#!/usr/bin/env bun

/**
 * CLI utility to create Jira stories from Figma designs and decompose them into tasks
 */

import { loadConfig } from './lib/config';
import { JiraClient } from './lib/jira';
import { runClaude, extractJiraUrl } from './lib/claude';

interface CLIArgs {
  figmaUrl: string;
  extraInstructions?: string;
}

function parseArgs(): CLIArgs {
  const args = Bun.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: bun run index.ts <figma-url> [extra-instructions]

Arguments:
  figma-url            Figma design node URL (required)
  extra-instructions   Additional instructions for the PM requirements (optional)

Environment variables (set in .env):
  JIRA_DOMAIN         Your Jira domain (e.g., your-org.atlassian.net)
  JIRA_EMAIL          Your Jira email
  JIRA_API_TOKEN      Your Jira API token
  JIRA_PROJECT_KEY    Your Jira project key (e.g., PROJ)

Example:
  bun run index.ts "https://www.figma.com/design/abc/file?node-id=123-456" "Focus on accessibility"
    `);
    process.exit(0);
  }

  const figmaUrl = args[0];
  if (!figmaUrl) {
    console.error('Error: Figma URL is required');
    process.exit(1);
  }

  const extraInstructions = args.slice(1).join(' ');

  return {
    figmaUrl,
    extraInstructions: extraInstructions || undefined,
  };
}

async function main() {
  try {
    // Parse arguments
    const { figmaUrl, extraInstructions } = parseArgs();

    // Load configuration
    console.log('📋 Loading configuration...\n');
    const config = loadConfig();

    // Initialize Jira client
    const jiraClient = new JiraClient(config.jira);

    // Step 1: Run Claude to create Jira story from Figma design
    console.log('Step 1: Creating Jira story from Figma design\n');
    console.log(`Figma URL: ${figmaUrl}`);
    if (extraInstructions) {
      console.log(`Extra instructions: ${extraInstructions}`);
    }

    const storyPrompt = `
Write Jira task with PM-style requirements for the following screen/component with Figma link:

${figmaUrl}

${extraInstructions ? `\nAdditional instructions: ${extraInstructions}` : ''}

Please provide:
1. A clear, concise summary/title
2. Detailed description with:
   - User story (As a... I want... So that...)
   - Acceptance criteria
   - Technical considerations
   - Design notes from the Figma

After analyzing the Figma design, create a Jira story with these requirements.
    `.trim();

    const storyResult = await runClaude(storyPrompt, {
      maxTurns: 25,
      skipPermissions: true,
      planMode: true,
    });

    if (storyResult.exitCode !== 0) {
      console.error('❌ Failed to create Jira story');
      console.error(storyResult.stderr);
      process.exit(1);
    }

    // Extract Jira story URL from output
    const jiraStoryUrl = extractJiraUrl(storyResult.stdout, config.jira.domain);

    if (!jiraStoryUrl) {
      console.error('\n❌ Could not find Jira story URL in Claude output');
      console.error('Output:', storyResult.stdout);
      process.exit(1);
    }

    console.log(`\n✅ Jira story created: ${jiraStoryUrl}\n`);

    // Step 2: Run Claude to decompose the story into tasks
    console.log('Step 2: Decomposing story into tasks\n');

    const decomposePrompt = `
Decompose the following Jira story: ${jiraStoryUrl} into smaller tasks, link them to the story:

Ensure that the tasks are not too small (you can group similar tasks) and not too big (doable within 1-2 days).

Please create subtasks that are:
- Focused on a single responsibility
- Completable within 1-2 days
- Clear and actionable
- Properly linked to the parent story
    `.trim();

    const decomposeResult = await runClaude(decomposePrompt, {
      maxTurns: 300,
      skipPermissions: true,
      planMode: true,
    });

    if (decomposeResult.exitCode !== 0) {
      console.error('❌ Failed to decompose story');
      console.error(decomposeResult.stderr);
      process.exit(1);
    }

    console.log('\n✅ Story decomposed into tasks successfully!\n');
    console.log('Summary:');
    console.log(`  Story: ${jiraStoryUrl}`);
    console.log('\n🎉 Done!');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
