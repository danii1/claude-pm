/**
 * Configuration management for the CLI
 */

export interface Config {
  jira: {
    domain: string;
    email: string;
    apiToken: string;
    projectKey: string;
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

export function loadConfig(): Config {
  const required = ['JIRA_DOMAIN', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY', 'CLAUDE_CLI_PATH'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please copy .env.example to .env and fill in the values.'
    );
  }

  return {
    jira: {
      domain: sanitizeDomain(process.env.JIRA_DOMAIN!),
      email: process.env.JIRA_EMAIL!,
      apiToken: process.env.JIRA_API_TOKEN!,
      projectKey: process.env.JIRA_PROJECT_KEY!,
    },
    claudeCliPath: process.env.CLAUDE_CLI_PATH!,
  };
}
