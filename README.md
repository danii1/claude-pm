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

2. (Optional) Install globally to use from any directory:

```bash
bun run install-global
```

After global installation, you can use `claude-pm` command from anywhere, including the web interface with `claude-pm --web`.

3. Set up environment variables:

```bash
cp .env.example .env
```

4. Edit `.env` with your configuration:

```env
# Jira Configuration
JIRA_DOMAIN=your-org.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
JIRA_PROJECT_KEY=PROJ

# Claude CLI Configuration
CLAUDE_CLI_PATH=/path/to/claude
```

### Getting Jira API Token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give it a name and copy the token
4. Add it to your `.env` file

### Finding Claude CLI Path

The Claude CLI path is typically located at:
- `~/.claude/local/claude` (default installation)
- Or run `which claude` if it's in your PATH

## Usage

### Web Interface (Recommended for Non-Technical Users)

Start the web server:

```bash
# If installed globally
claude-pm --web

# Or from the project directory
bun run web
```

Then open your browser to http://localhost:3000

**Custom port:**
```bash
claude-pm --web --port 8080
```

The web interface provides:
- User-friendly form interface
- Real-time progress updates
- No command-line knowledge required
- Visual feedback for story and subtask creation
- Can be run from any directory when installed globally

### CLI Usage (For Advanced Users)

```bash
bun run index.ts <figma-url> [options]
```

#### Arguments

- `figma-url` (required): Figma design node URL

#### Options

- `--epic, -e <key>`: Link the created story to a Jira epic (e.g., PROJ-100)
- `--custom, -c <text>`: Additional custom instructions for the requirements
- `--style, -s <type>`: Prompt style: "technical" (default) or "pm"
- `--skip-decomposition`: Skip the task decomposition step (only create story)
- `--confirm`: Interactively confirm each subtask before creating in Jira
- `--help, -h`: Show help message

#### Examples

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
├── server.ts             # Web server with Bun.serve()
├── lib/
│   ├── config.ts        # Configuration management
│   ├── jira.ts          # Jira API integration
│   └── claude.ts        # Claude CLI wrapper
├── prompts/
│   ├── technical/       # Technical-style prompts
│   └── pm/              # PM-style prompts
├── .env.example         # Environment template
└── README.md
```

## Development

This project uses Bun as the runtime and package manager. See [CLAUDE.md](./CLAUDE.md) for detailed development guidelines.

**Available scripts:**

```bash
bun run web          # Start web server
bun run dev          # Start web server with hot reload
bun run build        # Type check the project
```

**Type checking:**

```bash
bun run tsc --noEmit
```

**CLI with hot reload:**

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
