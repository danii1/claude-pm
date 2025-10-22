# claude-pm

A CLI utility that automates creating Jira stories from Figma designs and decomposing them into actionable tasks using Claude Code.

## Features

- **Figma to Jira**: Automatically analyze Figma designs and create detailed PM-style Jira stories
- **Story Decomposition**: Break down stories into well-scoped subtasks (1-2 days each)
- **Jira Integration**: Direct integration with Jira API for seamless task creation
- **Claude Code Integration**: Leverages Claude Code's Figma MCP for design analysis

## Prerequisites

- [Bun](https://bun.sh) runtime installed
- [Claude Code CLI](https://claude.com/code) installed and configured
- Jira account with API access
- Figma designs accessible via URL

## Installation

1. Clone the repository and install dependencies:

```bash
bun install
```

2. Set up environment variables:

```bash
cp .env.example .env
```

3. Edit `.env` with your Jira credentials:

```env
JIRA_DOMAIN=your-org.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
JIRA_PROJECT_KEY=PROJ
```

### Getting Jira API Token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give it a name and copy the token
4. Add it to your `.env` file

## Usage

```bash
bun run index.ts <figma-url> [options] [extra-instructions]
```

### Arguments

- `figma-url` (required): Figma design node URL
- `extra-instructions` (optional): Additional context for the PM requirements

### Options

- `--epic, -e <key>`: Link the created story to a Jira epic (e.g., PROJ-100)
- `--help, -h`: Show help message

### Examples

**Basic usage:**

```bash
bun run index.ts "https://www.figma.com/design/YTw63KfvSwcMGAyAMxiD8K/Briefs?node-id=5073-14946"
```

**Link to an epic:**

```bash
bun run index.ts "https://www.figma.com/design/abc/file?node-id=123-456" --epic PROJ-100
```

**With epic and extra instructions:**

```bash
bun run index.ts "https://www.figma.com/design/abc/file?node-id=123-456" -e PROJ-100 "Focus on accessibility"
```

## How It Works

1. **Figma Analysis**: Claude Code analyzes the Figma design using the Figma MCP integration
2. **Story Creation**: Creates a comprehensive Jira story with:
   - User story format
   - Acceptance criteria
   - Technical considerations
   - Design notes
3. **Epic Linking** (optional): Links the story to the specified epic for organization
4. **Task Decomposition**: Breaks down the story into subtasks that are:
   - Focused on single responsibilities
   - Completable within 1-2 days
   - Properly linked to the parent story

## Project Structure

```
claude-pm/
├── index.ts              # Main CLI entry point
├── lib/
│   ├── config.ts        # Configuration management
│   ├── jira.ts          # Jira API integration
│   └── claude.ts        # Claude CLI wrapper
├── .env.example         # Environment template
└── README.md
```

## Development

This project uses Bun as the runtime and package manager. See [CLAUDE.md](./CLAUDE.md) for detailed development guidelines.

**Type checking:**

```bash
bun run tsc --noEmit
```

**Run with hot reload:**

```bash
bun --hot index.ts
```

## Troubleshooting

**"Missing required environment variables"**
- Make sure you've created a `.env` file with all required variables from `.env.example`

**"Jira API error (401)"**
- Verify your Jira API token is correct
- Check that your email matches your Jira account

**"Could not find Jira story URL in Claude output"**
- The Claude session may have failed to create the Jira story
- Check the output for errors
- Verify your Jira credentials and permissions

## License

MIT

---

Built with [Bun](https://bun.sh) and [Claude Code](https://claude.com/code)
