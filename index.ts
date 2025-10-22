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
  process.stdout.write(`${message} (y/n): `);

  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const answer = decoder.decode(value).trim().toLowerCase();
    if (answer === 'y' || answer === 'yes') {
      reader.releaseLock();
      return true;
    } else if (answer === 'n' || answer === 'no') {
      reader.releaseLock();
      return false;
    }
    process.stdout.write(`Please answer 'y' or 'n': `);
  }

  return false;
}

interface CLIArgs {
  figmaUrl: string;
  epicKey?: string;
  extraInstructions?: string;
  promptStyle: "technical" | "pm";
  skipDecomposition: boolean;
  confirm: boolean;
}

function parseArgs(): CLIArgs {
  const args = Bun.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: claude-pm <figma-url> [options]

Arguments:
  figma-url            Figma design node URL (required)

Options:
  --epic, -e <key>     Jira epic key to link the story to (e.g., PROJ-100)
  --custom, -c <text>  Additional custom instructions for the requirements
  --style, -s <type>   Prompt style: "technical" (default) or "pm"
                       - technical: Includes Technical Considerations section
                       - pm: Focuses on user stories and acceptance criteria
  --skip-decomposition Skip the task decomposition step (only create story)
  --confirm            Interactively confirm each subtask before creating in Jira
  --help, -h           Show this help message

Environment variables (set in .env):
  JIRA_DOMAIN         Your Jira domain (e.g., your-org.atlassian.net)
  JIRA_EMAIL          Your Jira email
  JIRA_API_TOKEN      Your Jira API token
  JIRA_PROJECT_KEY    Your Jira project key (e.g., PROJ)

Examples:
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456"
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" --epic PROJ-100
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" -c "Focus on accessibility"
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" --style pm
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" --skip-decomposition
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" --confirm
  claude-pm "https://www.figma.com/design/abc/file?node-id=123-456" -e PROJ-100 -s pm -c "Focus on accessibility"
    `);
    process.exit(0);
  }

  let figmaUrl: string | undefined;
  let epicKey: string | undefined;
  let customInstructions: string | undefined;
  let promptStyle: "technical" | "pm" = "technical"; // Default to technical
  let skipDecomposition = false;
  let confirm = false;

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
    } else if (arg === "--skip-decomposition") {
      skipDecomposition = true;
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
    skipDecomposition,
    confirm,
    extraInstructions: customInstructions,
  };
}

async function main() {
  try {
    // Parse arguments
    const { figmaUrl, epicKey, extraInstructions, promptStyle, skipDecomposition, confirm } = parseArgs();

    // Load configuration
    console.log("📋 Loading configuration...\n");
    const config = await loadConfig();

    // Initialize Jira client
    const jiraClient = new JiraClient(config.jira);

    // Step 1: Run Claude to create Jira story from Figma design
    console.log("Step 1: Creating Jira story from Figma design\n");
    console.log(`Figma URL: ${figmaUrl}`);
    console.log(`Prompt style: ${promptStyle}`);
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

    // Check if we should skip decomposition
    if (skipDecomposition) {
      console.log("✅ Story created successfully!\n");
      console.log("Summary:");
      console.log(`  Story: ${jiraStory.url}`);
      if (epicKey) {
        console.log(`  Epic: ${epicKey}`);
      }
      console.log("\n🎉 Done! (Skipped decomposition)");
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
        console.log(`\n[${i + 1}/${subtasksData.subtasks.length}] ${subtask.summary}`);
        if (subtask.description) {
          const descPreview = subtask.description.substring(0, 200);
          console.log(`   ${descPreview}${subtask.description.length > 200 ? '...' : ''}`);
        }

        const shouldCreate = await askConfirm(`\nCreate this subtask?`);
        if (!shouldCreate) {
          skippedSubtasks.push(subtask.summary);
          console.log(`   ⏭️  Skipped`);
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
        console.log(`   ✅ ${created.key}: ${subtask.summary}`);
      } catch (error) {
        console.error(`   ⚠️  Failed to create subtask: ${subtask.summary}`);
        console.error(
          `      Error: ${error instanceof Error ? error.message : error}`
        );
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

main();
