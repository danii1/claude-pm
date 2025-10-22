#!/usr/bin/env bun

/**
 * Web server for claude-pm
 * Provides a simple web interface for non-technical users
 */

import { loadConfig } from "./lib/config";
import { JiraClient } from "./lib/jira";
import { runClaude } from "./lib/claude";
import { join } from "node:path";

// Store active SSE connections
const sseConnections = new Map<string, ReadableStreamDefaultController>();

/**
 * Load a prompt template from file and replace placeholders
 */
async function loadPrompt(
  style: "technical" | "pm",
  filename: string,
  replacements: Record<string, string>
): Promise<string> {
  const promptPath = join(import.meta.dir, "prompts", style, filename);
  const promptFile = Bun.file(promptPath);
  let prompt = await promptFile.text();

  for (const [key, value] of Object.entries(replacements)) {
    prompt = prompt.replace(new RegExp(`{{${key}}}`, "g"), value);
  }

  return prompt.trim();
}

/**
 * Send SSE message to a specific connection
 */
function sendSSE(sessionId: string, data: any) {
  const controller = sseConnections.get(sessionId);
  if (controller) {
    try {
      controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      // Connection was closed, remove it from the map
      sseConnections.delete(sessionId);
    }
  }
}

/**
 * Process the Figma design and create Jira story + subtasks
 */
async function processJob(
  sessionId: string,
  figmaUrl: string,
  epicKey?: string,
  extraInstructions?: string,
  promptStyle: "technical" | "pm" = "technical",
  skipDecomposition = false
) {
  try {
    sendSSE(sessionId, { type: "log", message: "Loading configuration..." });
    const config = await loadConfig();
    const jiraClient = new JiraClient(config.jira);

    sendSSE(sessionId, {
      type: "log",
      message: `Creating Jira story from Figma design\nURL: ${figmaUrl}`,
    });

    // Step 1: Create story
    const storyPrompt = await loadPrompt(promptStyle, "story-generation.txt", {
      figmaUrl,
      epicContext: epicKey ? `\nThis story will be part of epic: ${epicKey}` : "",
      extraInstructions: extraInstructions
        ? `\nAdditional instructions: ${extraInstructions}`
        : "",
    });

    sendSSE(sessionId, { type: "log", message: "Running Claude to analyze design..." });

    const storyResult = await runClaude(
      storyPrompt,
      { maxTurns: 100, skipPermissions: true, planMode: true },
      config.claudeCliPath
    );

    if (storyResult.exitCode !== 0) {
      throw new Error(`Failed to analyze Figma design: ${storyResult.stderr}`);
    }

    // Parse JSON from Claude output
    let storyData;
    try {
      let jsonText = storyResult.stdout.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1]!;
      }
      storyData = JSON.parse(jsonText);

      if (!storyData.summary || !storyData.description) {
        throw new Error("Missing required fields: summary and description");
      }
    } catch (error) {
      throw new Error(
        `Failed to parse story requirements: ${error instanceof Error ? error.message : error}`
      );
    }

    sendSSE(sessionId, {
      type: "log",
      message: `Creating Jira story: ${storyData.summary}`,
    });

    const jiraStory = await jiraClient.createStory(
      storyData.summary,
      storyData.description
    );

    sendSSE(sessionId, {
      type: "story_created",
      storyKey: jiraStory.key,
      storyUrl: jiraStory.url,
      storySummary: storyData.summary,
    });

    // Link to epic if provided
    if (epicKey) {
      sendSSE(sessionId, { type: "log", message: `Linking to epic ${epicKey}...` });
      try {
        await jiraClient.linkToEpic(jiraStory.key, epicKey);
        sendSSE(sessionId, { type: "log", message: `Linked to epic ${epicKey}` });
      } catch (error) {
        sendSSE(sessionId, {
          type: "warning",
          message: `Failed to link to epic: ${error instanceof Error ? error.message : error}`,
        });
      }
    }

    if (skipDecomposition) {
      sendSSE(sessionId, { type: "complete", message: "Story created successfully!" });
      return;
    }

    // Step 2: Decompose into subtasks
    sendSSE(sessionId, { type: "log", message: "Decomposing story into subtasks..." });

    const decomposePrompt = await loadPrompt(promptStyle, "decomposition.txt", {
      storySummary: storyData.summary,
      storyDescription: storyData.description,
    });

    const decomposeResult = await runClaude(
      decomposePrompt,
      { maxTurns: 100, skipPermissions: true, planMode: false },
      config.claudeCliPath
    );

    if (decomposeResult.exitCode !== 0) {
      throw new Error(`Failed to decompose story: ${decomposeResult.stderr}`);
    }

    // Parse subtasks JSON
    let subtasksData;
    try {
      let jsonText = decomposeResult.stdout.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1]!;
      }
      subtasksData = JSON.parse(jsonText);

      if (!subtasksData.subtasks || !Array.isArray(subtasksData.subtasks)) {
        throw new Error("Expected subtasks array in response");
      }
    } catch (error) {
      throw new Error(
        `Failed to parse subtasks: ${error instanceof Error ? error.message : error}`
      );
    }

    sendSSE(sessionId, {
      type: "log",
      message: `Creating ${subtasksData.subtasks.length} subtasks in Jira...`,
    });

    // Create subtasks
    const createdSubtasks = [];
    for (const subtask of subtasksData.subtasks) {
      try {
        const description = subtask.description?.trim() || subtask.summary;
        const created = await jiraClient.createSubtask(
          jiraStory.key,
          subtask.summary,
          description
        );
        createdSubtasks.push(created);
        sendSSE(sessionId, {
          type: "subtask_created",
          subtaskKey: created.key,
          subtaskSummary: subtask.summary,
        });
      } catch (error) {
        sendSSE(sessionId, {
          type: "warning",
          message: `Failed to create subtask: ${subtask.summary}`,
        });
      }
    }

    sendSSE(sessionId, {
      type: "complete",
      message: `Successfully created story with ${createdSubtasks.length} subtasks!`,
    });
  } catch (error) {
    sendSSE(sessionId, {
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Close the SSE connection
    const controller = sseConnections.get(sessionId);
    if (controller) {
      try {
        controller.close();
      } catch (error) {
        // Connection already closed, ignore
      }
      sseConnections.delete(sessionId);
    }
  }
}

// HTML interface
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude PM - Figma to Jira</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 32px;
            margin-bottom: 10px;
        }

        .header p {
            opacity: 0.9;
            font-size: 16px;
        }

        .content {
            padding: 30px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #333;
            font-size: 14px;
        }

        input[type="text"],
        input[type="url"],
        textarea,
        select {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s;
            font-family: inherit;
        }

        input:focus,
        textarea:focus,
        select:focus {
            outline: none;
            border-color: #667eea;
        }

        textarea {
            resize: vertical;
            min-height: 80px;
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .checkbox-group input[type="checkbox"] {
            width: auto;
            cursor: pointer;
        }

        .checkbox-group label {
            margin: 0;
            font-weight: 400;
            cursor: pointer;
        }

        button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
        }

        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .output {
            margin-top: 30px;
            padding: 20px;
            background: #f5f5f5;
            border-radius: 8px;
            display: none;
            max-height: 400px;
            overflow-y: auto;
        }

        .output.active {
            display: block;
        }

        .log-entry {
            padding: 8px;
            margin-bottom: 8px;
            border-radius: 4px;
            font-size: 14px;
            line-height: 1.5;
        }

        .log-entry.log {
            background: #e3f2fd;
            color: #1565c0;
        }

        .log-entry.story_created {
            background: #e8f5e9;
            color: #2e7d32;
            font-weight: 600;
        }

        .log-entry.subtask_created {
            background: #f3e5f5;
            color: #6a1b9a;
        }

        .log-entry.warning {
            background: #fff3e0;
            color: #ef6c00;
        }

        .log-entry.error {
            background: #ffebee;
            color: #c62828;
            font-weight: 600;
        }

        .log-entry.complete {
            background: #c8e6c9;
            color: #1b5e20;
            font-weight: 600;
            font-size: 16px;
        }

        .log-entry a {
            color: inherit;
            text-decoration: underline;
        }

        .hint {
            font-size: 12px;
            color: #666;
            margin-top: 4px;
        }

        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 8px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Claude PM</h1>
            <p>Transform Figma designs into Jira stories with AI</p>
        </div>

        <div class="content">
            <form id="pmForm">
                <div class="form-group">
                    <label for="figmaUrl">Figma Design URL *</label>
                    <input
                        type="url"
                        id="figmaUrl"
                        name="figmaUrl"
                        required
                        placeholder="https://www.figma.com/design/..."
                    >
                    <div class="hint">Paste the Figma node URL from your design</div>
                </div>

                <div class="form-group">
                    <label for="epicKey">Epic Key (optional)</label>
                    <input
                        type="text"
                        id="epicKey"
                        name="epicKey"
                        placeholder="e.g., PROJ-100"
                    >
                    <div class="hint">Link this story to an existing epic</div>
                </div>

                <div class="form-group">
                    <label for="customInstructions">Custom Instructions (optional)</label>
                    <textarea
                        id="customInstructions"
                        name="customInstructions"
                        placeholder="Add any specific requirements or context..."
                    ></textarea>
                </div>

                <div class="form-group">
                    <label for="promptStyle">Prompt Style</label>
                    <select id="promptStyle" name="promptStyle">
                        <option value="technical">Technical (with Technical Considerations)</option>
                        <option value="pm">PM Style (User Stories focused)</option>
                    </select>
                </div>

                <div class="form-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="skipDecomposition" name="skipDecomposition">
                        <label for="skipDecomposition">Skip task decomposition (only create story)</label>
                    </div>
                </div>

                <button type="submit" id="submitBtn">
                    Create Jira Story
                </button>
            </form>

            <div id="output" class="output"></div>
        </div>
    </div>

    <script>
        const form = document.getElementById('pmForm');
        const output = document.getElementById('output');
        const submitBtn = document.getElementById('submitBtn');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const data = {
                figmaUrl: formData.get('figmaUrl'),
                epicKey: formData.get('epicKey') || undefined,
                customInstructions: formData.get('customInstructions') || undefined,
                promptStyle: formData.get('promptStyle'),
                skipDecomposition: formData.has('skipDecomposition'),
            };

            // Clear previous output
            output.innerHTML = '';
            output.classList.add('active');

            // Disable form
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> Processing...';

            try {
                // Generate session ID
                const sessionId = Math.random().toString(36).substring(7);

                // Start job
                fetch('/api/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...data, sessionId }),
                });

                // Connect to SSE
                const eventSource = new EventSource(\`/api/events/\${sessionId}\`);

                eventSource.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    const entry = document.createElement('div');
                    entry.className = \`log-entry \${data.type}\`;

                    if (data.type === 'story_created') {
                        entry.innerHTML = \`✅ Story created: <a href="\${data.storyUrl}" target="_blank">\${data.storyKey}</a> - \${data.storySummary}\`;
                    } else if (data.type === 'subtask_created') {
                        entry.innerHTML = \`  ✓ Subtask created: \${data.subtaskKey} - \${data.subtaskSummary}\`;
                    } else {
                        entry.textContent = data.message;
                    }

                    output.appendChild(entry);
                    output.scrollTop = output.scrollHeight;

                    if (data.type === 'complete' || data.type === 'error') {
                        eventSource.close();
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Create Jira Story';
                    }
                };

                eventSource.onerror = () => {
                    eventSource.close();
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create Jira Story';
                };
            } catch (error) {
                const entry = document.createElement('div');
                entry.className = 'log-entry error';
                entry.textContent = \`Error: \${error.message}\`;
                output.appendChild(entry);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Jira Story';
            }
        });
    </script>
</body>
</html>`;

// Global error handlers for uncaught errors
process.on('unhandledRejection', (error: any) => {
  // Suppress AbortError from SSE connections
  if (error instanceof DOMException && error.name === "AbortError") {
    return; // Silently ignore
  }
  console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error: any) => {
  // Suppress AbortError from SSE connections
  if (error instanceof DOMException && error.name === "AbortError") {
    return; // Silently ignore
  }
  console.error('Uncaught Exception:', error);
});

// Start server
const server = Bun.serve({
  port: process.env.PORT || 3000,
  error(error) {
    // Suppress AbortError from SSE connections being closed
    if (error instanceof DOMException && error.name === "AbortError") {
      return new Response("Connection closed", { status: 499 });
    }
    console.error("Server error:", error);
    return new Response("Internal Server Error", { status: 500 });
  },
  fetch(req) {
    const url = new URL(req.url);

    // Serve HTML page
    if (url.pathname === "/") {
      return new Response(HTML, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Handle form submission
    if (url.pathname === "/api/process" && req.method === "POST") {
      req.json().then((data: any) => {
        const { sessionId, figmaUrl, epicKey, customInstructions, promptStyle, skipDecomposition } = data;

        // Start processing in background with error handling
        processJob(sessionId, figmaUrl, epicKey, customInstructions, promptStyle, skipDecomposition)
          .catch((error) => {
            console.error("Error in processJob:", error);
            // Try to send error to client if connection still exists
            try {
              sendSSE(sessionId, {
                type: "error",
                message: error instanceof Error ? error.message : String(error),
              });
            } catch (e) {
              // Ignore if SSE connection is already closed
            }
          });
      });

      return new Response("OK", { status: 202 });
    }

    // Server-Sent Events endpoint
    if (url.pathname.startsWith("/api/events/")) {
      const sessionId = url.pathname.split("/").pop();
      if (!sessionId) {
        return new Response("Missing session ID", { status: 400 });
      }

      const stream = new ReadableStream({
        start(controller) {
          // Store the controller for this session
          sseConnections.set(sessionId, controller);

          // Send initial connection message
          try {
            controller.enqueue("data: {\"type\":\"connected\"}\n\n");
          } catch (error) {
            // Connection closed before we could send, ignore
            sseConnections.delete(sessionId);
          }
        },
        cancel() {
          // Clean up when client disconnects
          if (sessionId) {
            sseConnections.delete(sessionId);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Claude PM web interface running at http://localhost:${server.port}`);
console.log(`   Open your browser and navigate to the URL above`);
