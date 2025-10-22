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
}

export function loadConfig(): Config {
  const required = ['JIRA_DOMAIN', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please copy .env.example to .env and fill in the values.'
    );
  }

  return {
    jira: {
      domain: process.env.JIRA_DOMAIN!,
      email: process.env.JIRA_EMAIL!,
      apiToken: process.env.JIRA_API_TOKEN!,
      projectKey: process.env.JIRA_PROJECT_KEY!,
    },
  };
}
