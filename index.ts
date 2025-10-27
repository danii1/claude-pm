#!/usr/bin/env bun

/**
 * CLI utility to create Jira stories from Figma designs and decompose them into tasks
 */

import { join } from "node:path";
import { loadConfig } from "./lib/config";
import { JiraClient } from "./lib/jira";
import { runClaude } from "./lib/claude";

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
      const proc = Bun.spawn(['bash', '-c', 'read line && echo "$line"'], {
        stdin: 'inherit',
        stdout: 'pipe',
        stderr: 'inherit',
      });

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      const answer = output.trim().toLowerCase();

      // Empty input (just Enter) defaults to yes
      if (answer === '' || answer === 'y' || answer === 'yes') {
        return true;
      } else if (answer === 'n' || answer === 'no') {
        return false;
      } else {
        // Invalid input, loop and prompt again
        process.stdout.write(`Please answer 'y' or 'n' (default: y): `);
        continue;
      }
    } catch (error) {
      console.error('\nError reading input:', error);
      return false;
    }
  }
}

interface CLIArgs {
  figmaUrl: string;
  epicKey?: string;
  extraInstructions?: string;
  promptStyle: "technical" | "pm";
  decompose: boolean;
  confirm: boolean;
  model?: string;
}

function parseArgs(): CLIArgs {
  const args = Bun.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: claude-pm <figma-url> [options]
       claude-pm --web [--port <port>]

Arguments:
  figma-url            Figma design node URL (required)

Options:
  --web                Start web interface server
  --port <number>      Port for web server (default: 3000, only with --web)
  --epic, -e <key>     Jira epic key to link the story to (e.g., PROJ-100)
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
  claude-pm --web                    # Start web interface on port 3000
  claude-pm --web --port 8080        # Start web interface on custom port
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456"
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" --epic PROJ-100
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" -c "Focus on accessibility"
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" --style technical
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" --model opus
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" --decompose
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" --decompose --confirm
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" -e PROJ-100 -c "Focus on accessibility"
    `);
    process.exit(0);
  }

  let figmaUrl: string | undefined;
  let epicKey: string | undefined;
  let customInstructions: string | undefined;
  let promptStyle: "technical" | "pm" = "pm"; // Default to pm
  let decompose = false; // Default to NOT decomposing
  let confirm = false;
  let model: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue; // Skip undefined args (shouldn't happen but satisfies TS)

    if (arg === "--epic" || arg === "-e") {
      if (i + 1 >= args.length) {
        console.error("Error: --epic requires a value");
        process.exit(1);
      }
      epicKey = args[i + 1]!; // Non-null assertion safe due to check above
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
    } else if (!figmaUrl) {
      figmaUrl = arg;
    } else {
      console.error(`Error: Unknown argument "${arg}"`);
      console.error('Use --help to see available options');
      process.exit(1);
    }
  }

  if (!figmaUrl) {
    console.error("Error: Figma URL is required");
    process.exit(1);
  }

  return {
    figmaUrl,
    epicKey,
    promptStyle,
    decompose,
    confirm,
    model,
    extraInstructions: customInstructions,
  };
}

async function main() {
  try {
    // Parse arguments
    const { figmaUrl, epicKey, extraInstructions, promptStyle, decompose, confirm, model } = parseArgs();

    // Load configuration
    console.log("📋 Loading configuration...\n");
    const config = await loadConfig();

    // Initialize Jira client
    const jiraClient = new JiraClient(config.jira);

    // Step 1: Run Claude to create Jira story from Figma design
    console.log("Step 1: Creating Jira story from Figma design\n");
    console.log(`Figma URL: ${figmaUrl}`);
    console.log(`Prompt style: ${promptStyle}`);
    if (model) {
      console.log(`Model: ${model}`);
    }
    if (epicKey) {
      console.log(`Epic: ${epicKey}`);
    }
    if (extraInstructions) {
      console.log(`Custom instructions: ${extraInstructions}`);
    }

    const storyPrompt = await loadPrompt(promptStyle, "story-generation.txt", {
      figmaUrl,
      epicContext: epicKey ? `\nThis story will be part of epic: ${epicKey}` : "",
      extraInstructions: extraInstructions
        ? `\nAdditional instructions: ${extraInstructions}`
        : "",
    });

    const storyResult = await runClaude(
      storyPrompt,
      {
        maxTurns: 100,
        skipPermissions: true,
        planMode: true,
        model,
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

    console.log("\n📝 Creating Jira story...");
    console.log(`   Title: ${storyData.summary}`);

    // Create the Jira story via API
    const jiraStory = await jiraClient.createStory(
      storyData.summary,
      storyData.description
    );

    console.log(`\n✅ Jira story created: ${jiraStory.url}`);

    // Link to epic if provided
    if (epicKey) {
      console.log(`🔗 Linking story to epic ${epicKey}...`);
      try {
        await jiraClient.linkToEpic(jiraStory.key, epicKey);
        console.log(`✅ Story linked to epic ${epicKey}`);
      } catch (error) {
        console.error(
          `⚠️  Warning: Failed to link to epic: ${
            error instanceof Error ? error.message : error
          }`
        );
        console.log("Continuing with task decomposition...");
      }
    }
    console.log();

    // Check if we should decompose into subtasks
    if (!decompose) {
      console.log("✅ Story created successfully!\n");
      console.log("Summary:");
      console.log(`  Story: ${jiraStory.url}`);
      if (epicKey) {
        console.log(`  Epic: ${epicKey}`);
      }
      console.log("\n🎉 Done!");
      return;
    }

    // Step 2: Run Claude to decompose the story into tasks
    console.log("Step 2: Decomposing story into tasks\n");

    const decomposePrompt = await loadPrompt(promptStyle, "decomposition.txt", {
      storySummary: storyData.summary,
      storyDescription: storyData.description,
    });

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
        console.log('\n' + '─'.repeat(80));
        console.log(`\n📋 Task ${i + 1}/${subtasksData.subtasks.length}`);
        console.log(`   ${subtask.summary}\n`);

        if (subtask.description) {
          // Show first 300 characters of description with better formatting
          const descPreview = subtask.description.substring(0, 300);
          // Split into lines and indent each line
          const lines = descPreview.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              console.log(`   ${line}`);
            }
          }
          if (subtask.description.length > 300) {
            console.log('   ...');
          }
          console.log(''); // Extra blank line
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
          console.error(`   Error: ${error instanceof Error ? error.message : error}\n`);
        } else {
          console.error(`   ⚠️  Failed to create subtask: ${subtask.summary}`);
          console.error(
            `      Error: ${error instanceof Error ? error.message : error}`
          );
        }
      }
    }

    console.log("\n✅ Story decomposed into tasks successfully!\n");
    console.log("Summary:");
    console.log(`  Story: ${jiraStory.url}`);
    console.log(`  Created: ${createdSubtasks.length} subtasks`);
    if (skippedSubtasks.length > 0) {
      console.log(`  Skipped: ${skippedSubtasks.length} subtasks`);
    }
    if (epicKey) {
      console.log(`  Epic: ${epicKey}`);
    }
    console.log("\n🎉 Done!");
  } catch (error) {
    console.error(
      "\n❌ Error:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

// Check if we should start web server
const args = Bun.argv.slice(2);
if (args.includes("--web")) {
  // Extract port if provided
  const portIndex = args.indexOf("--port");
  const port = portIndex !== -1 && args[portIndex + 1]
    ? parseInt(args[portIndex + 1]!, 10)
    : 3000;

  // Set port in environment
  process.env.PORT = port.toString();

  // Dynamically import and start the server
  import("./server").then(() => {
    // Server will start automatically when module is loaded
  }).catch((error) => {
    console.error("Failed to start web server:", error);
    process.exit(1);
  });
} else {
  // Run CLI mode
  main();
}
