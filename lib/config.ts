/**
 * Configuration management for the CLI
 */

import { join } from 'node:path';

export interface Config {
  jira: {
    domain: string;
    email: string;
    apiToken: string;
    defaultProjectKey: string;
  };
  claudeCliPath: string;
}

/**
 * Sanitize Jira domain by removing protocol and trailing slashes
 */
function sanitizeDomain(domain: string): string {
  return domain
    .replace(/^https?:\/\//, '') // Remove http:// or https://
    .replace(/\/+$/, '');         // Remove trailing slashes
}

export async function loadConfig(): Promise<Config> {
  // Load .env file from .claude-pm in the current working directory
  // This allows per-project configuration
  const envPath = join(process.cwd(), '.claude-pm', '.env');

  // Try to load .env file if it exists
  try {
    const envFile = Bun.file(envPath);
    if (await envFile.exists()) {
      const envContent = await envFile.text();
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            let value = valueParts.join('=').trim();
            // Strip surrounding quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            process.env[key.trim()] = value;
          }
        }
      }
    }
  } catch (error) {
    // Ignore errors - .env is optional if env vars are set another way
  }

  const required = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_DEFAULT_PROJECT_KEY', 'CLAUDE_CLI_PATH'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please copy .env.example to .env and fill in the values.'
    );
  }

  return {
    jira: {
      domain: sanitizeDomain(process.env.JIRA_BASE_URL!),
      email: process.env.JIRA_EMAIL!,
      apiToken: process.env.JIRA_API_TOKEN!,
      defaultProjectKey: process.env.JIRA_DEFAULT_PROJECT_KEY!,
    },
    claudeCliPath: process.env.CLAUDE_CLI_PATH!,
  };
}
