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

## Configuration

claude-pm uses per-project configuration stored in `.claude-pm/.env` in your project directory. This allows you to work with multiple projects without configuration conflicts.

### Initialize Configuration

Navigate to your project directory and run:

```bash
claude-pm init
```

This will:
- Create a `.claude-pm` directory in your current project
- Copy the configuration template to `.claude-pm/.env`
- Automatically migrate configuration from `.claude-intern/.env` if present (JIRA credentials and Claude CLI path)
- Update your `.gitignore` to exclude `.claude-pm/.env` (to prevent leaking secrets)

### Edit Configuration

After initialization, edit `.claude-pm/.env` in your project:

```env
# JIRA Configuration
# Your JIRA instance URL (without trailing slash)
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
JIRA_DEFAULT_PROJECT_KEY=PROJ

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

### Interactive Mode (Terminal UI)

The interactive mode provides a step-by-step terminal UI for creating tasks:

```bash
# If installed globally
claude-pm --interactive

# Or from the project directory
bun run index.ts --interactive
```

The interactive mode will guide you through:
1. **Source type selection**: Choose between Figma URL, error log, or free-form prompt
2. **Source input**: Enter your Figma URL, error log, or requirements
3. **Custom instructions** (optional): Add additional requirements or focus areas
4. **Epic linking** (optional): Link to an existing Jira epic
5. **Issue type**: Select Story, Task, Bug, Epic, or enter a custom type
6. **Prompt style**: Choose between PM style or Technical style
7. **Confirmation**: Review your configuration before proceeding

**Features:**
- 📝 Step-by-step guided workflow
- ⌨️ Keyboard navigation (Enter to confirm, ESC to exit)
- 👀 Visual preview of your configuration
- 🎯 No need to remember command-line flags

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

For power users who prefer command-line flags:

```bash
claude-pm --figma <url> [options]
claude-pm --log <text> [options]
claude-pm --prompt <text> [options]
```

#### Source Options (one required)

- `--figma <url>`: Figma design node URL to analyze
- `--log <text>`: Error log or bug report text to analyze
- `--prompt <text>`: Free-form text describing requirements or features

#### Additional Options

- `--epic, -e <key>`: Link the created story to a Jira epic (e.g., PROJ-100)
- `--type, -t <type>`: Jira issue type (default: "Story"). Common types: Story, Task, Bug, Epic
- `--custom, -c <text>`: Additional custom instructions for the requirements
- `--style, -s <type>`: Prompt style: "pm" (default) or "technical"
  - **pm**: Focuses on user stories and acceptance criteria
  - **technical**: Includes Technical Considerations section
- `--model, -m <model>`: Claude model to use (e.g., "sonnet", "opus", or full model name)
- `--decompose`: Decompose the story into subtasks (default: off)
- `--confirm`: Interactively confirm each subtask before creating in Jira
- `--help, -h`: Show help message

#### Examples

**Figma designs:**

```bash
claude-pm --figma "https://www.figma.com/design/abc/file?node-id=123-456"
claude-pm --figma "https://..." --epic PROJ-100
claude-pm --figma "https://..." -c "Focus on accessibility"
claude-pm --figma "https://..." --style technical --decompose
claude-pm --figma "https://..." --type Task
```

**Error logs:**

```bash
claude-pm --log "Error: Cannot read property 'id' of undefined at line 42"
claude-pm --log "$(cat error.log)" --epic PROJ-200 --type Bug
claude-pm --log "Stack trace..." --style technical --model opus
```

**Free-form prompts:**

```bash
claude-pm --prompt "Add user profile settings page with theme preferences"
claude-pm --prompt "$(cat requirements.txt)" --epic PROJ-300
claude-pm --prompt "Implement OAuth login" --style technical --decompose
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
