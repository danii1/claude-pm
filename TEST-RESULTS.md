# Prompt Loading Fix - Test Results

## Problem

When running `claude-pm` from a global installation, the CLI failed with:
```
ENOENT: no such file or directory, open '/Users/daniil/.bun/install/global/node_modules/claude-pm/dist/prompts/prompt/pm/story-generation.txt'
```

## Root Cause

The path resolution logic used `import.meta.dir` which resolves to different locations depending on the execution context:

- **Local development**: `import.meta.dir` = project root (where `index.ts` is)
- **Global installation**: `import.meta.dir` = `dist/` directory (where bundled `index.js` is)

The original code assumed prompts were always relative to `import.meta.dir`, which only worked for local development.

## Solution

Implemented smart path detection that works in both contexts:

```typescript
// Detect if we're running from dist/ (bundled) or from source
const isBundle = import.meta.dir.endsWith("/dist") || import.meta.dir.endsWith("\\dist");
const baseDir = isBundle ? join(import.meta.dir, "..") : import.meta.dir;

const promptPath = join(
  baseDir,
  "prompts",
  sourceType,
  style,
  filename
);
```

## Test Coverage

### Unit Tests (`prompt-loader.test.ts`)
✅ Smart path detection works for local development
✅ All prompt files load correctly (figma, log, prompt types)
✅ Placeholder replacement works correctly
✅ Path resolution detects correct context

### Integration Tests (`test-bundled-prompt-loading.ts`)
✅ Simulates bundled execution from dist/
✅ Verifies all 6 prompt files are found
✅ Confirms path resolution works for global installation

### NPX/Bunx Scenario Tests (`test-npx-scenario.ts`)
✅ Simulates npm cache locations (`/tmp/node_modules/claude-pm/dist`)
✅ Simulates bun cache locations (`~/.bun/install/cache/claude-pm@1.0.1/dist`)
✅ Verifies Windows path detection (`C:\...\dist`)
✅ Confirms smart detection works in all package manager scenarios

### Manual Verification
✅ Local development: `bun run index.ts --help` works
✅ Global installation: `claude-pm --help` works
✅ No errors when loading prompts in either mode

## Files Changed

- `index.ts`: Updated `loadPrompt()` function with smart path detection
- `server.ts`: Removed (unused file from previous architecture)
- `prompt-loader.test.ts`: Added comprehensive unit tests
- `test-bundled-prompt-loading.ts`: Added bundled scenario simulation test

## Verification Commands

```bash
# Run unit tests
bun test prompt-loader.test.ts

# Test bundled simulation
bun run test-bundled-prompt-loading.ts

# Test local development
bun run index.ts --help

# Rebuild and test global installation
bun run build
bun link
claude-pm --help
```

## Result

✅ Prompt loading now works correctly in all execution scenarios:
1. **Local development**: `bun run index.ts` (runs from project root)
2. **Global installation**: `claude-pm` via `bun link` (runs from `~/.bun/install/global/node_modules/claude-pm/dist/`)
3. **NPX/Bunx**: `bunx claude-pm` or `npx claude-pm` (runs from cache directory)

The fix is backward compatible and requires no changes to the package structure or build process.

### How It Works

The smart detection checks if the code is running from a `dist/` directory:
- If YES → It's bundled, so go up one level (`..`) to find prompts
- If NO → It's local development, prompts are in current directory

This works because:
- Local development: `index.ts` is at project root → prompts are at `./prompts/`
- Bundled (global/npx): `dist/index.js` → prompts are at `../prompts/`
