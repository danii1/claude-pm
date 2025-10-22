/**
 * Claude CLI wrapper for executing prompts
 */

export interface ClaudeOptions {
  maxTurns: number;
  skipPermissions?: boolean;
  planMode?: boolean;
}

export interface ClaudeResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runClaude(
  prompt: string,
  options: ClaudeOptions,
  claudeCliPath: string
): Promise<ClaudeResult> {
  const args = [];

  if (options.planMode) {
    args.push('-p');
  }

  if (options.skipPermissions) {
    args.push('--dangerously-skip-permissions');
  }

  args.push('--max-turns', options.maxTurns.toString());
  args.push(prompt);

  console.log('\n🤖 Running Claude...\n');

  const proc = Bun.spawn([claudeCliPath, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  return {
    stdout,
    stderr,
    exitCode,
  };
}

/**
 * Extract Jira story URL from Claude output
 */
export function extractJiraUrl(text: string, domain: string): string | null {
  // Match patterns like:
  // https://your-org.atlassian.net/browse/PROJ-750
  // PROJ-750
  const urlPattern = new RegExp(
    `https://${domain.replace('.', '\\.')}/browse/([A-Z]+-\\d+)`,
    'i'
  );
  const keyPattern = /\b([A-Z]+-\d+)\b/;

  const urlMatch = text.match(urlPattern);
  if (urlMatch) {
    return urlMatch[0];
  }

  const keyMatch = text.match(keyPattern);
  if (keyMatch) {
    return `https://${domain}/browse/${keyMatch[1]}`;
  }

  return null;
}
