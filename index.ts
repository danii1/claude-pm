#!/usr/bin/env bun

/**
 * CLI utility to create Jira stories from Figma designs and decompose them into tasks
 */

import { join } from "node:path";
import { loadConfig } from "./lib/config";
import { JiraClient } from "./lib/jira";
import { runClaude } from "./lib/claude";
import { runInteractiveMode } from "./lib/interactive";

/**
 * Load a prompt template from file and replace placeholders
 */
async function loadPrompt(
  sourceType: SourceType,
  style: "technical" | "pm",
  filename: string,
  replacements: Record<string, string>
): Promise<string> {
  const promptPath = join(
    import.meta.dir,
    "prompts",
    sourceType,
    style,
    filename
  );
  const promptFile = Bun.file(promptPath);
  let prompt = await promptFile.text();

  // Replace all placeholders
  for (const [key, value] of Object.entries(replacements)) {
    prompt = prompt.replace(new RegExp(`{{${key}}}`, "g"), value);
  }

  return prompt.trim();
}

/**
 * Ask user for yes/no confirmation
 */
async function askConfirm(message: string): Promise<boolean> {
  while (true) {
    process.stdout.write(`${message} (Y/n): `);

    try {
      // Use Bun's synchronous readline-like approach
      const proc = Bun.spawn(["bash", "-c", 'read line && echo "$line"'], {
        stdin: "inherit",
        stdout: "pipe",
        stderr: "inherit",
      });

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      const answer = output.trim().toLowerCase();

      // Empty input (just Enter) defaults to yes
      if (answer === "" || answer === "y" || answer === "yes") {
        return true;
      } else if (answer === "n" || answer === "no") {
        return false;
      } else {
        // Invalid input, loop and prompt again
        process.stdout.write(`Please answer 'y' or 'n' (default: y): `);
        continue;
      }
    } catch (error) {
      console.error("\nError reading input:", error);
      return false;
    }
  }
}

type SourceType = "figma" | "log" | "prompt";

interface SourceInput {
  type: SourceType;
  content: string;
}

interface CLIArgs {
  source: SourceInput;
  epicKey?: string;
  extraInstructions?: string;
  promptStyle: "technical" | "pm";
  decompose: boolean;
  confirm: boolean;
  model?: string;
  issueType: string;
}

function parseArgs(): CLIArgs | null {
  const args = Bun.argv.slice(2);

  // Check for interactive mode early
  if (args.includes("--interactive")) {
    return null; // Signal to use interactive mode
  }

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: claude-pm --figma <url> [options]
       claude-pm --log <text> [options]
       claude-pm --prompt <text> [options]
       claude-pm --interactive
       claude-pm --web [--port <port>]

Modes:
  --interactive        Interactive mode - step-by-step task creation (Terminal UI)
  --web                Start web interface server

Source (one required for non-interactive mode):
  --figma <url>        Figma design node URL to analyze
  --log <text>         Error log or bug report text to analyze
  --prompt <text>      Free-form text describing requirements or features

Options:
  --port <number>      Port for web server (default: 3000, only with --web)
  --epic, -e <key>     Jira epic key to link the story to (e.g., PROJ-100)
  --type, -t <type>    Jira issue type (default: "Story")
                       Common types: Story, Task, Bug, Epic
  --custom, -c <text>  Additional custom instructions for the requirements
  --style, -s <type>   Prompt style: "pm" (default) or "technical"
                       - pm: Focuses on user stories and acceptance criteria
                       - technical: Includes Technical Considerations section
  --model, -m <model>  Claude model to use (e.g., "sonnet", "opus", or full model name)
  --decompose          Decompose the story into subtasks (default: off)
  --confirm            Interactively confirm each subtask before creating in Jira
  --help, -h           Show this help message

Environment variables (set in .env):
  JIRA_DOMAIN         Your Jira domain (e.g., your-org.atlassian.net)
  JIRA_EMAIL          Your Jira email
  JIRA_API_TOKEN      Your Jira API token
  JIRA_PROJECT_KEY    Your Jira project key (e.g., PROJ)

Examples:
  # Interactive mode (Terminal UI)
  claude-pm --interactive            # Step-by-step interactive task creation

  # Web interface
  claude-pm --web                    # Start web interface on port 3000
  claude-pm --web --port 8080        # Start web interface on custom port

  # Figma designs
  claude-pm --figma "https://www.figma.com/design/abc/file?node-id=123-456"
  claude-pm --figma "https://..." --epic PROJ-100
  claude-pm --figma "https://..." -c "Focus on accessibility"
  claude-pm --figma "https://..." --style technical --decompose
  claude-pm --figma "https://..." --type Task

  # Error logs
  claude-pm --log "Error: Cannot read property 'id' of undefined at line 42"
  claude-pm --log "$(cat error.log)" --epic PROJ-200 --type Bug
  claude-pm --log "Stack trace..." --style technical --model opus

  # Free-form prompts
  claude-pm --prompt "Add user profile settings page with theme preferences"
  claude-pm --prompt "$(cat requirements.txt)" --epic PROJ-300
  claude-pm --prompt "Implement OAuth login" --style technical --decompose
    `);
    process.exit(0);
  }

  let source: SourceInput | undefined;
  let epicKey: string | undefined;
  let customInstructions: string | undefined;
  let promptStyle: "technical" | "pm" = "pm"; // Default to pm
  let decompose = false; // Default to NOT decomposing
  let confirm = false;
  let model: string | undefined;
  let issueType = "Story"; // Default to Story

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue; // Skip undefined args (shouldn't happen but satisfies TS)

    if (arg === "--figma") {
      if (i + 1 >= args.length) {
        console.error("Error: --figma requires a URL");
        process.exit(1);
      }
      if (source) {
        console.error(
          "Error: Cannot specify multiple source types (--figma, --log, --prompt)"
        );
        process.exit(1);
      }
      source = {
        type: "figma",
        content: args[i + 1]!,
      };
      i++; // Skip next arg
    } else if (arg === "--log") {
      if (i + 1 >= args.length) {
        console.error("Error: --log requires text content");
        process.exit(1);
      }
      if (source) {
        console.error(
          "Error: Cannot specify multiple source types (--figma, --log, --prompt)"
        );
        process.exit(1);
      }
      source = {
        type: "log",
        content: args[i + 1]!,
      };
      i++; // Skip next arg
    } else if (arg === "--prompt") {
      if (i + 1 >= args.length) {
        console.error("Error: --prompt requires text content");
        process.exit(1);
      }
      if (source) {
        console.error(
          "Error: Cannot specify multiple source types (--figma, --log, --prompt)"
        );
        process.exit(1);
      }
      source = {
        type: "prompt",
        content: args[i + 1]!,
      };
      i++; // Skip next arg
    } else if (arg === "--epic" || arg === "-e") {
      if (i + 1 >= args.length) {
        console.error("Error: --epic requires a value");
        process.exit(1);
      }
      epicKey = args[i + 1]!; // Non-null assertion safe due to check above
      i++; // Skip next arg
    } else if (arg === "--type" || arg === "-t") {
      if (i + 1 >= args.length) {
        console.error("Error: --type requires a value");
        process.exit(1);
      }
      issueType = args[i + 1]!; // Non-null assertion safe due to check above
      i++; // Skip next arg
    } else if (arg === "--custom" || arg === "-c") {
      if (i + 1 >= args.length) {
        console.error("Error: --custom requires a value");
        process.exit(1);
      }
      customInstructions = args[i + 1]!; // Non-null assertion safe due to check above
      i++; // Skip next arg
    } else if (arg === "--style" || arg === "-s") {
      if (i + 1 >= args.length) {
        console.error("Error: --style requires a value");
        process.exit(1);
      }
      const style = args[i + 1]!;
      if (style !== "technical" && style !== "pm") {
        console.error('Error: --style must be either "technical" or "pm"');
        process.exit(1);
      }
      promptStyle = style;
      i++; // Skip next arg
    } else if (arg === "--model" || arg === "-m") {
      if (i + 1 >= args.length) {
        console.error("Error: --model requires a value");
        process.exit(1);
      }
      model = args[i + 1]!; // Non-null assertion safe due to check above
      i++; // Skip next arg
    } else if (arg === "--decompose") {
      decompose = true;
    } else if (arg === "--confirm") {
      confirm = true;
    } else {
      console.error(`Error: Unknown argument "${arg}"`);
      console.error("Use --help to see available options");
      process.exit(1);
    }
  }

  if (!source) {
    console.error(
      "Error: Source is required (use --figma, --log, or --prompt)"
    );
    process.exit(1);
  }

  return {
    source,
    epicKey,
    promptStyle,
    decompose,
    confirm,
    model,
    issueType,
    extraInstructions: customInstructions,
  };
}

async function main() {
  // Parse arguments - null means interactive mode
  const parsedArgs = parseArgs();

  let source: SourceInput;
  let epicKey: string | undefined;
  let extraInstructions: string | undefined;
  let promptStyle: "technical" | "pm";
  let decompose: boolean;
  let confirm: boolean;
  let model: string | undefined;
  let issueType: string;
  let interactiveHandle: Awaited<ReturnType<typeof runInteractiveMode>> | null = null;

  try {

    if (parsedArgs === null) {
      // Interactive mode with preview - setup once
      console.clear();
      try {
        interactiveHandle = await runInteractiveMode();
      } catch {
        console.log("\nBye!");
        process.exit(0);
      }

      // Get initial config (before preview)
      const interactiveConfig = await interactiveHandle.waitForCompletion();

      // Convert interactive config to CLI args format
      if (!interactiveConfig.sourceType || !interactiveConfig.sourceContent) {
        console.error("❌ Interactive mode was cancelled or incomplete");
        process.exit(1);
      }

      source = {
        type: interactiveConfig.sourceType,
        content: interactiveConfig.sourceContent,
      };
      epicKey = interactiveConfig.epicKey;
      extraInstructions = interactiveConfig.customInstructions;
      promptStyle = interactiveConfig.promptStyle;
      decompose = interactiveConfig.decompose;
      confirm = false; // Interactive mode handles confirmation differently
      model = undefined;
      issueType = interactiveConfig.issueType;
    } else {
      // CLI mode
      source = parsedArgs.source;
      epicKey = parsedArgs.epicKey;
      extraInstructions = parsedArgs.extraInstructions;
      promptStyle = parsedArgs.promptStyle;
      decompose = parsedArgs.decompose;
      confirm = parsedArgs.confirm;
      model = parsedArgs.model;
      issueType = parsedArgs.issueType;
    }

    // Load configuration
    if (!interactiveHandle) {
      console.log("📋 Loading configuration...\n");
    }
    const config = await loadConfig();

    // Initialize Jira client
    const jiraClient = new JiraClient(config.jira);

    // Step 1: Run Claude to create Jira story from source
    if (!interactiveHandle) {
      const sourceTypeLabel =
        source.type === "figma"
          ? "Figma design"
          : source.type === "log"
          ? "error log"
          : "free-form prompt";
      console.log(`Step 1: Creating Jira story from ${sourceTypeLabel}\n`);
      console.log(`Source type: ${source.type}`);
      if (source.type === "figma") {
        console.log(`Figma URL: ${source.content}`);
      } else {
        // Show first 100 chars of content
        const preview =
          source.content.length > 100
            ? source.content.substring(0, 100) + "..."
            : source.content;
        const label = source.type === "log" ? "Log preview" : "Prompt preview";
        console.log(`${label}: ${preview}`);
      }
      console.log(`Prompt style: ${promptStyle}`);
      console.log(`Issue type: ${issueType}`);
      if (model) {
        console.log(`Model: ${model}`);
      }
      if (epicKey) {
        console.log(`Epic: ${epicKey}`);
      }
      if (extraInstructions) {
        console.log(`Custom instructions: ${extraInstructions}`);
      }
    }

    // Prepare replacements based on source type
    const replacements: Record<string, string> = {
      epicContext: epicKey
        ? `\nThis story will be part of epic: ${epicKey}`
        : "",
      extraInstructions: extraInstructions
        ? `\nAdditional instructions: ${extraInstructions}`
        : "",
    };

    if (source.type === "figma") {
      replacements.figmaUrl = source.content;
    } else if (source.type === "log") {
      replacements.logContent = source.content;
    } else if (source.type === "prompt") {
      replacements.promptContent = source.content;
    }

    const storyPrompt = await loadPrompt(
      source.type,
      promptStyle,
      "story-generation.txt",
      replacements
    );

    // In interactive mode, show generating state
    if (interactiveHandle) {
      interactiveHandle.setGenerating();
    }

    const storyResult = await runClaude(
      storyPrompt,
      {
        maxTurns: 100,
        skipPermissions: true,
        planMode: true,
        model,
        silent: !!interactiveHandle,
      },
      config.claudeCliPath
    );

    if (storyResult.exitCode !== 0) {
      console.error("❌ Failed to analyze Figma design");
      console.error(storyResult.stderr);
      process.exit(1);
    }

    // Parse JSON from Claude output (may be in code blocks)
    let storyData;
    try {
      let jsonText = storyResult.stdout.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1]!; // Safe because regex has capture group
      }
      storyData = JSON.parse(jsonText);

      if (!storyData.summary || !storyData.description) {
        throw new Error("Missing required fields: summary and description");
      }
    } catch (error) {
      console.error(
        "\n❌ Failed to parse story requirements from Claude output"
      );
      console.error("Error:", error instanceof Error ? error.message : error);
      console.error("Output:", storyResult.stdout);
      process.exit(1);
    }

    // In interactive mode, show preview and wait for confirmation or edits
    if (interactiveHandle) {
      interactiveHandle.setPreviewData(storyData.summary, storyData.description);

      // Edit loop - allow user to request edits multiple times
      while (true) {
        const editRequest = await Promise.race([
          interactiveHandle.waitForCompletion().then(() => null),
          interactiveHandle.waitForEdit()
        ]);

        if (!editRequest) {
          // User confirmed, break out of edit loop
          break;
        }

        // User requested an edit
        const editPrompt = `You are helping revise a Jira ${issueType.toLowerCase()} description.

Current Title: ${editRequest.currentSummary}

Current Description:
${editRequest.currentDescription}

User's edit request: ${editRequest.editPrompt}

Please update the description based on the user's feedback. Keep the same title unless the user specifically asks to change it. Return ONLY valid JSON in this exact format:

\`\`\`json
{
  "summary": "Updated or same title",
  "description": "Updated description in markdown format"
}
\`\`\``;

        const editResult = await runClaude(
          editPrompt,
          {
            maxTurns: 100,
            skipPermissions: true,
            planMode: true,
            model,
            silent: true,
          },
          config.claudeCliPath
        );

        if (editResult.exitCode !== 0) {
          console.error("❌ Failed to update task description");
          console.error(editResult.stderr);
          // Show error and continue loop to allow retry
          continue;
        }

        // Parse updated JSON
        try {
          let jsonText = editResult.stdout.trim();
          const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (jsonMatch?.[1]) {
            jsonText = jsonMatch[1];
          }
          const updatedData = JSON.parse(jsonText);

          if (!updatedData.summary || !updatedData.description) {
            throw new Error("Missing required fields in update");
          }

          // Update storyData with the new content
          storyData = updatedData;

          // Show updated preview
          interactiveHandle.setPreviewData(storyData.summary, storyData.description);
        } catch (error) {
          console.error("❌ Failed to parse updated task from Claude");
          console.error("Error:", error instanceof Error ? error.message : error);
          // Loop will retry
        }
      }
    }

    if (!interactiveHandle) {
      console.log(`\n📝 Creating Jira ${issueType.toLowerCase()}...`);
      console.log(`   Title: ${storyData.summary}`);
    }

    // Create the Jira story via API
    const jiraStory = await jiraClient.createStory(
      storyData.summary,
      storyData.description,
      issueType
    );

    if (!interactiveHandle) {
      console.log(
        `\n✅ Jira ${issueType.toLowerCase()} created: ${jiraStory.url}`
      );
    }

    // Link to epic if provided
    if (epicKey) {
      if (!interactiveHandle) {
        console.log(`🔗 Linking story to epic ${epicKey}...`);
      }
      try {
        await jiraClient.linkToEpic(jiraStory.key, epicKey);
        if (!interactiveHandle) {
          console.log(`✅ Story linked to epic ${epicKey}`);
        }
      } catch (error) {
        console.error(
          `⚠️  Warning: Failed to link to epic: ${
            error instanceof Error ? error.message : error
          }`
        );
        if (!interactiveHandle) {
          console.log("Continuing with task decomposition...");
        }
      }
    }
    if (!interactiveHandle) {
      console.log();
    }

    // Check if we should decompose into subtasks
    if (!decompose) {
      if (!interactiveHandle) {
        console.log(`✅ ${issueType} created successfully!\n`);
        console.log("Summary:");
        console.log(`  ${issueType}: ${jiraStory.url}`);
        if (epicKey) {
          console.log(`  Epic: ${epicKey}`);
        }
        console.log("\n🎉 Done!");
      }

      // In interactive mode, show success and wait for user to restart
      if (interactiveHandle) {
        interactiveHandle.showSuccess(`Task created: ${jiraStory.url}`);
        // Wait for user key press to restart
        await interactiveHandle.waitForRestart();
        // Restart the flow
        return main();
      }
      return;
    }

    // Step 2: Run Claude to decompose the story into tasks
    console.log("Step 2: Decomposing story into tasks\n");

    const decomposePrompt = await loadPrompt(
      source.type,
      promptStyle,
      "decomposition.txt",
      {
        storySummary: storyData.summary,
        storyDescription: storyData.description,
      }
    );

    const decomposeResult = await runClaude(
      decomposePrompt,
      {
        maxTurns: 100,
        skipPermissions: true,
        planMode: false,
        model,
      },
      config.claudeCliPath
    );

    if (decomposeResult.exitCode !== 0) {
      console.error("❌ Failed to decompose story");
      console.error(decomposeResult.stderr);
      process.exit(1);
    }

    // Parse subtasks JSON from Claude output
    let subtasksData;
    try {
      let jsonText = decomposeResult.stdout.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1]!; // Safe because regex has capture group
      }
      subtasksData = JSON.parse(jsonText);

      if (!subtasksData.subtasks || !Array.isArray(subtasksData.subtasks)) {
        throw new Error("Expected subtasks array in response");
      }
    } catch (error) {
      console.error("\n❌ Failed to parse subtasks from Claude output");
      console.error("Error:", error instanceof Error ? error.message : error);
      console.error("Output:", decomposeResult.stdout);
      process.exit(1);
    }

    console.log(
      `\n✅ Claude suggested ${subtasksData.subtasks.length} subtasks\n`
    );

    if (confirm) {
      console.log("📝 Review and confirm each subtask:\n");
    } else {
      console.log("📝 Creating subtasks in Jira...\n");
    }

    // Create each subtask via API
    const createdSubtasks = [];
    const skippedSubtasks = [];

    for (let i = 0; i < subtasksData.subtasks.length; i++) {
      const subtask = subtasksData.subtasks[i];
      if (!subtask) continue;

      // If confirmation mode is enabled, ask user
      if (confirm) {
        // Visual separator between tasks
        console.log("\n" + "─".repeat(80));
        console.log(`\n📋 Task ${i + 1}/${subtasksData.subtasks.length}`);
        console.log(`   ${subtask.summary}\n`);

        if (subtask.description) {
          // Show first 300 characters of description with better formatting
          const descPreview = subtask.description.substring(0, 300);
          // Split into lines and indent each line
          const lines = descPreview.split("\n");
          for (const line of lines) {
            if (line.trim()) {
              console.log(`   ${line}`);
            }
          }
          if (subtask.description.length > 300) {
            console.log("   ...");
          }
          console.log(""); // Extra blank line
        }

        const shouldCreate = await askConfirm(`Create this subtask?`);
        if (!shouldCreate) {
          skippedSubtasks.push(subtask.summary);
          console.log(`⏭️  Skipped\n`);
          continue;
        }
      }

      try {
        // Ensure we have a description, use summary as fallback
        const description = subtask.description?.trim() || subtask.summary;

        const created = await jiraClient.createSubtask(
          jiraStory.key,
          subtask.summary,
          description
        );
        createdSubtasks.push(created);
        if (confirm) {
          console.log(`✅ Created: ${created.key}\n`);
        } else {
          console.log(`   ✅ ${created.key}: ${subtask.summary}`);
        }
      } catch (error) {
        if (confirm) {
          console.error(`⚠️  Failed to create subtask: ${subtask.summary}`);
          console.error(
            `   Error: ${error instanceof Error ? error.message : error}\n`
          );
        } else {
          console.error(`   ⚠️  Failed to create subtask: ${subtask.summary}`);
          console.error(
            `      Error: ${error instanceof Error ? error.message : error}`
          );
        }
      }
    }

    console.log(`\n✅ ${issueType} decomposed into tasks successfully!\n`);
    console.log("Summary:");
    console.log(`  ${issueType}: ${jiraStory.url}`);
    console.log(`  Created: ${createdSubtasks.length} subtasks`);
    if (skippedSubtasks.length > 0) {
      console.log(`  Skipped: ${skippedSubtasks.length} subtasks`);
    }
    if (epicKey) {
      console.log(`  Epic: ${epicKey}`);
    }
    console.log("\n🎉 Done!");

    // In interactive mode, show success and wait for user to restart
    if (interactiveHandle) {
      interactiveHandle.showSuccess(`Task created: ${jiraStory.url}`);
      // Wait for user key press to restart
      await interactiveHandle.waitForRestart();
      // Restart the flow
      return main();
    }
  } catch (error) {
    console.error(
      "\n❌ Error:",
      error instanceof Error ? error.message : error
    );
    // In interactive mode, show error and wait for user to restart
    if (interactiveHandle) {
      interactiveHandle.showSuccess(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      // Wait for user key press to restart
      await interactiveHandle.waitForRestart();
      return main();
    }
    process.exit(1);
  }
}

// Check if we should start web server
const args = Bun.argv.slice(2);
if (args.includes("--web")) {
  // Extract port if provided
  const portIndex = args.indexOf("--port");
  const port =
    portIndex !== -1 && args[portIndex + 1]
      ? parseInt(args[portIndex + 1]!, 10)
      : 3000;

  // Set port in environment
  process.env.PORT = port.toString();

  // Dynamically import and start the server
  import("./server")
    .then(() => {
      // Server will start automatically when module is loaded
    })
    .catch((error) => {
      console.error("Failed to start web server:", error);
      process.exit(1);
    });
} else {
  // Run CLI mode
  main();
}
