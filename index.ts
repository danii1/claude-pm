#!/usr/bin/env bun

/**
 * CLI utility to create Jira stories from Figma designs and decompose them into tasks
 */

import { loadConfig } from "./lib/config";
import { JiraClient } from "./lib/jira";
import { runClaude } from "./lib/claude";

interface CLIArgs {
  figmaUrl: string;
  epicKey?: string;
  extraInstructions?: string;
}

function parseArgs(): CLIArgs {
  const args = Bun.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: bun run index.ts <figma-url> [options] [extra-instructions]

Arguments:
  figma-url            Figma design node URL (required)
  extra-instructions   Additional instructions for the PM requirements (optional)

Options:
  --epic, -e <key>     Jira epic key to link the story to (e.g., PROJ-100)
  --help, -h           Show this help message

Environment variables (set in .env):
  JIRA_DOMAIN         Your Jira domain (e.g., your-org.atlassian.net)
  JIRA_EMAIL          Your Jira email
  JIRA_API_TOKEN      Your Jira API token
  JIRA_PROJECT_KEY    Your Jira project key (e.g., PROJ)

Examples:
  bun run index.ts "https://www.figma.com/design/abc/file?node-id=123-456"
  bun run index.ts "https://www.figma.com/design/abc/file?node-id=123-456" --epic PROJ-100
  bun run index.ts "https://www.figma.com/design/abc/file?node-id=123-456" -e PROJ-100 "Focus on accessibility"
    `);
    process.exit(0);
  }

  let figmaUrl: string | undefined;
  let epicKey: string | undefined;
  const extraParts: string[] = [];

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
    } else if (!figmaUrl) {
      figmaUrl = arg;
    } else {
      extraParts.push(arg);
    }
  }

  if (!figmaUrl) {
    console.error("Error: Figma URL is required");
    process.exit(1);
  }

  return {
    figmaUrl,
    epicKey,
    extraInstructions: extraParts.length > 0 ? extraParts.join(" ") : undefined,
  };
}

async function main() {
  try {
    // Parse arguments
    const { figmaUrl, epicKey, extraInstructions } = parseArgs();

    // Load configuration
    console.log("📋 Loading configuration...\n");
    const config = loadConfig();

    // Initialize Jira client
    const jiraClient = new JiraClient(config.jira);

    // Step 1: Run Claude to create Jira story from Figma design
    console.log("Step 1: Creating Jira story from Figma design\n");
    console.log(`Figma URL: ${figmaUrl}`);
    if (epicKey) {
      console.log(`Epic: ${epicKey}`);
    }
    if (extraInstructions) {
      console.log(`Extra instructions: ${extraInstructions}`);
    }

    const storyPrompt = `
Analyze the following Figma design and generate PM-style requirements for a Jira story:

${figmaUrl}
${epicKey ? `\nThis story will be part of epic: ${epicKey}` : ""}
${extraInstructions ? `\nAdditional instructions: ${extraInstructions}` : ""}

Please analyze the Figma design and provide the requirements in the following JSON format:

{
  "summary": "Brief, clear title for the story",
  "description": "Detailed description including:\\n- User story (As a... I want... So that...)\\n- Acceptance criteria\\n- Technical considerations"
}

Return ONLY valid JSON, no additional text.
    `.trim();

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

    // Step 2: Run Claude to decompose the story into tasks
    console.log("Step 2: Decomposing story into tasks\n");

    const decomposePrompt = `
Decompose the following Jira story into smaller, actionable tasks with detailed descriptions.

Story: ${storyData.summary}

Description:
${storyData.description}

Requirements for each task:
- Focused on a single responsibility
- Completable within 1-2 days
- Not too granular (group similar small tasks together)
- Not too large (break down complex work)
- MUST include a detailed description with:
  * What needs to be done
  * Acceptance criteria or definition of done
  * Any technical considerations or dependencies
  * Implementation notes if applicable

Return your response ONLY as valid JSON in this exact format (no markdown, no code blocks, no additional text):

{
  "subtasks": [
    {
      "summary": "Brief, actionable task title",
      "description": "Detailed description with what needs to be done, acceptance criteria, technical considerations, and implementation notes"
    }
  ]
}

IMPORTANT: Each task MUST have a comprehensive description. Do not leave descriptions empty.
    `.trim();

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
    console.log("📝 Creating subtasks in Jira...\n");

    // Create each subtask via API
    const createdSubtasks = [];
    for (const subtask of subtasksData.subtasks) {
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
