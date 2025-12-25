/**
 * Initialize .claude-pm configuration in the current directory
 */

import { join } from 'node:path';

export async function initializeProject(): Promise<void> {
  const cwd = process.cwd();
  const claudePmDir = join(cwd, '.claude-pm');
  const envPath = join(claudePmDir, '.env');

  console.log('🚀 Initializing claude-pm in current directory...\n');

  // Check if .claude-pm already exists
  const claudePmDirFile = Bun.file(claudePmDir);
  try {
    const stat = await Bun.file(join(claudePmDir, '.')).exists();
    if (stat) {
      console.log('⚠️  .claude-pm directory already exists');
      const shouldOverwrite = await askConfirm('Overwrite existing configuration?');
      if (!shouldOverwrite) {
        console.log('❌ Initialization cancelled');
        process.exit(0);
      }
    }
  } catch {
    // Directory doesn't exist, continue
  }

  // Create .claude-pm directory
  await Bun.$`mkdir -p ${claudePmDir}`;
  console.log('✅ Created .claude-pm directory');

  // Copy .env.example from the script's directory
  const scriptDir = import.meta.dir;
  const projectRoot = join(scriptDir, '..');
  const envExamplePath = join(projectRoot, '.env.example');
  const envExampleContent = await Bun.file(envExamplePath).text();

  // Check for existing .claude-intern configuration
  const claudeInternDir = join(cwd, '.claude-intern');
  const claudeInternEnvPath = join(claudeInternDir, '.env');

  let jiraBaseUrl = '';
  let jiraEmail = '';
  let jiraApiToken = '';
  let claudeCliPath = '';

  try {
    const claudeInternEnvFile = Bun.file(claudeInternEnvPath);
    if (await claudeInternEnvFile.exists()) {
      console.log('📋 Found existing .claude-intern configuration');
      const claudeInternEnv = await claudeInternEnvFile.text();

      // Extract JIRA_* and CLAUDE_CLI_PATH values
      const lines = claudeInternEnv.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          if (trimmed.startsWith('JIRA_BASE_URL=')) {
            jiraBaseUrl = trimmed.split('=', 2)[1]?.trim() || '';
          } else if (trimmed.startsWith('JIRA_EMAIL=')) {
            jiraEmail = trimmed.split('=', 2)[1]?.trim() || '';
          } else if (trimmed.startsWith('JIRA_API_TOKEN=')) {
            jiraApiToken = trimmed.split('=', 2)[1]?.trim() || '';
          } else if (trimmed.startsWith('CLAUDE_CLI_PATH=')) {
            claudeCliPath = trimmed.split('=', 2)[1]?.trim() || '';
          }
        }
      }

      if (jiraBaseUrl || jiraEmail || jiraApiToken || claudeCliPath) {
        console.log('✅ Migrating configuration from .claude-intern');
      }
    }
  } catch {
    // No .claude-intern found, that's fine
  }

  // Replace values in .env.example with migrated values if available
  let envContent = envExampleContent;
  if (jiraBaseUrl) {
    envContent = envContent.replace(
      /JIRA_BASE_URL=.*/,
      `JIRA_BASE_URL=${jiraBaseUrl}`
    );
  }
  if (jiraEmail) {
    envContent = envContent.replace(
      /JIRA_EMAIL=.*/,
      `JIRA_EMAIL=${jiraEmail}`
    );
  }
  if (jiraApiToken) {
    envContent = envContent.replace(
      /JIRA_API_TOKEN=.*/,
      `JIRA_API_TOKEN=${jiraApiToken}`
    );
  }
  if (claudeCliPath) {
    envContent = envContent.replace(
      /CLAUDE_CLI_PATH=.*/,
      `CLAUDE_CLI_PATH=${claudeCliPath}`
    );
  }

  // Write .env file
  await Bun.write(envPath, envContent);
  console.log('✅ Created .env configuration file');

  // Check if .gitignore exists and update it
  const gitignorePath = join(cwd, '.gitignore');
  const gitignoreFile = Bun.file(gitignorePath);

  try {
    if (await gitignoreFile.exists()) {
      let gitignoreContent = await gitignoreFile.text();

      // Check if .claude-pm is already in .gitignore
      if (!gitignoreContent.includes('.claude-pm')) {
        // Add .claude-pm/.env to .gitignore
        if (!gitignoreContent.endsWith('\n')) {
          gitignoreContent += '\n';
        }
        gitignoreContent += '\n# claude-pm configuration (contains secrets)\n.claude-pm/.env\n';
        await Bun.write(gitignorePath, gitignoreContent);
        console.log('✅ Updated .gitignore to exclude .claude-pm/.env');
      } else {
        console.log('ℹ️  .gitignore already contains .claude-pm');
      }
    } else {
      // Create new .gitignore
      const gitignoreContent = '# claude-pm configuration (contains secrets)\n.claude-pm/.env\n';
      await Bun.write(gitignorePath, gitignoreContent);
      console.log('✅ Created .gitignore with .claude-pm/.env');
    }
  } catch (error) {
    console.warn('⚠️  Could not update .gitignore:', error instanceof Error ? error.message : error);
  }

  console.log('\n✨ Initialization complete!');
  console.log(`\nNext steps:`);
  console.log(`1. Edit .claude-pm/.env with your configuration`);
  console.log(`2. Run claude-pm --interactive to create your first task`);
}

/**
 * Ask user for yes/no confirmation
 */
async function askConfirm(message: string): Promise<boolean> {
  while (true) {
    process.stdout.write(`${message} (Y/n): `);

    try {
      const proc = Bun.spawn(['bash', '-c', 'read line && echo "$line"'], {
        stdin: 'inherit',
        stdout: 'pipe',
        stderr: 'inherit',
      });

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      const answer = output.trim().toLowerCase();

      if (answer === '' || answer === 'y' || answer === 'yes') {
        return true;
      } else if (answer === 'n' || answer === 'no') {
        return false;
      } else {
        process.stdout.write(`Please answer 'y' or 'n' (default: y): `);
        continue;
      }
    } catch (error) {
      console.error('\nError reading input:', error);
      return false;
    }
  }
}
