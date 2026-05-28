# claude-pm

> **This repository is archived.** Development has moved to [DevIntern](https://devintern.com). Active development, new features, and ongoing support now live at [devintern.com](https://devintern.com). If you use claude-pm for commercial work, please move to [DevIntern for Product Managers](https://devintern.com/for/product-managers/) — it is the supported path forward.
>
> Thank you to everyone who tried claude-pm early. As a thank-you, use coupon code **`earlybird`** for **30% off** when you sign up at [devintern.com](https://devintern.com) — limited offer, may not last.

Automate Jira story creation with AI. Transform Figma designs, error logs, or requirements into well-structured Jira stories in seconds. Let Claude Code research your codebase and designs to write detailed task descriptions that work for both humans and AI.

## Features

- **Save Time on Task Creation**: Spend minutes instead of hours writing detailed Jira stories
- **AI-Powered Analysis**: Let Claude Code research your codebase and designs to understand context
- **Multiple Input Sources**: Create stories from:
  - **Figma designs**: Analyze designs and extract detailed specifications
  - **Error logs**: Convert bug reports and stack traces into structured issues
  - **Free-form prompts**: Transform requirements into well-defined stories
- **Quality Descriptions**: Generate task descriptions optimized for both human developers and AI assistants
- **Direct Jira Integration**: Seamlessly create and link issues without leaving your terminal

## Prerequisites

- **[Bun](https://bun.sh) runtime** - Required to run claude-pm (the tool is built with Bun)
- [Claude Code CLI](https://claude.com/code) installed and configured
- Jira account with API access
- **For Figma functionality**: [Figma MCP server](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/) must be installed and configured in Claude Code

## Installation

Install globally with Bun:

```bash
bun install -g claude-pm
```

Or for local development:

```bash
git clone https://github.com/danii1/claude-pm.git
cd claude-pm
bun install
bun run install-global
```

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

### Interactive Mode (Recommended)

The interactive mode provides a step-by-step terminal UI for creating tasks. This is the recommended way to use claude-pm for all users:

```bash
claude-pm --interactive

# Or for local development
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
- ✨ Works great for both technical and non-technical users

### CLI Usage (For Power Users)

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

> **Note**: Figma functionality requires the Figma MCP server to be installed and configured in Claude Code. See [Prerequisites](#prerequisites) for setup instructions.

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

1. **Input Analysis**: Claude Code analyzes your input:
   - **Figma designs**: Uses the Figma MCP integration to extract design specifications
   - **Error logs**: Parses error messages and stack traces to identify root causes
   - **Free-form prompts**: Interprets requirements and feature descriptions
2. **Story Creation**: Creates a comprehensive Jira story with:
   - User story format
   - Acceptance criteria
   - Technical considerations
   - Design notes (for Figma) or reproduction steps (for bugs)
3. **Epic Linking** (optional): Links the story to the specified epic for organization
4. **Task Decomposition** (optional): Breaks down the story into subtasks that are:
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
bun run build              # Build and type check the project
bun run install-global     # Install globally for development
bun run uninstall-global   # Uninstall global installation
```

**Type checking:**

```bash
bun run tsc --noEmit
```

**Run CLI:**

```bash
bun run index.ts --interactive
```

## License

Licensed under the [ISC License](https://opensource.org/licenses/ISC). This repository is archived and no longer maintained. For ongoing development and support, see [DevIntern](https://devintern.com/for/product-managers/).

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

---

Built with [Bun](https://bun.sh) and [Claude Code](https://claude.com/code)
