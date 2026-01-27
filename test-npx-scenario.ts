#!/usr/bin/env bun

/**
 * Test that simulates the bunx/npx scenario
 * When users run `bunx claude-pm`, the package is cached and dist/index.js is executed
 */

import { join } from "node:path";

console.log("\n🧪 Testing bunx/npx execution scenario");
console.log("=".repeat(60));

// Simulate different cache locations where bunx might install the package
const cacheLocations = [
  "/tmp/node_modules/claude-pm/dist", // npm cache
  "/Users/user/.bun/install/cache/claude-pm@1.0.1/dist", // bun cache
];

let allPassed = true;

for (const simulatedDistPath of cacheLocations) {
  console.log(`\nTesting cache location: ${simulatedDistPath}`);

  // Test the smart detection logic
  const isBundle = simulatedDistPath.endsWith("/dist") || simulatedDistPath.endsWith("\\dist");
  const baseDir = isBundle ? join(simulatedDistPath, "..") : simulatedDistPath;

  console.log(`  Is bundle detected: ${isBundle}`);
  console.log(`  Base directory: ${baseDir}`);

  if (!isBundle) {
    console.log(`  ❌ FAIL: Bundle detection failed!`);
    allPassed = false;
  } else {
    console.log(`  ✓ PASS: Would look for prompts at: ${join(baseDir, "prompts")}`);
  }
}

// Test Windows path separately (detection only, not path resolution)
console.log(`\nTesting Windows path detection:`);
const windowsPath = "C:\\Users\\user\\AppData\\Local\\npm-cache\\claude-pm\\dist";
const isWindowsBundle = windowsPath.endsWith("/dist") || windowsPath.endsWith("\\dist");
console.log(`  Path: ${windowsPath}`);
console.log(`  Is bundle detected: ${isWindowsBundle}`);
if (isWindowsBundle) {
  console.log(`  ✓ PASS: Windows path detection works`);
} else {
  console.log(`  ❌ FAIL: Windows path detection failed!`);
  allPassed = false;
}

console.log("\n" + "=".repeat(60));

// Now test with the actual dist directory
console.log("\nTesting actual dist/ in this project:");
const actualDistPath = join(process.cwd(), "dist");
const isBundle = actualDistPath.endsWith("/dist") || actualDistPath.endsWith("\\dist");
const baseDir = isBundle ? join(actualDistPath, "..") : actualDistPath;

console.log(`  import.meta.dir would be: ${actualDistPath}`);
console.log(`  Is bundle detected: ${isBundle}`);
console.log(`  Base directory: ${baseDir}`);

// Verify all prompt files exist at the expected location
const testFiles = [
  join(baseDir, "prompts", "figma", "pm", "story-generation.txt"),
  join(baseDir, "prompts", "log", "technical", "decomposition.txt"),
  join(baseDir, "prompts", "prompt", "pm", "story-generation.txt"),
];

console.log("\n  Checking if prompt files exist:");
for (const file of testFiles) {
  const exists = await Bun.file(file).exists();
  const status = exists ? "✓" : "✗";
  const shortPath = file.replace(baseDir + "/", "");
  console.log(`    ${status} ${shortPath}`);
  if (!exists) {
    allPassed = false;
  }
}

console.log("\n" + "=".repeat(60));

if (allPassed) {
  console.log("✅ bunx/npx scenario works - smart detection handles it!\n");
  process.exit(0);
} else {
  console.log("❌ bunx/npx scenario broken - needs fixes!\n");
  process.exit(1);
}
