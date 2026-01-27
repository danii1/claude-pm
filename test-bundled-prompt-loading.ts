#!/usr/bin/env bun

/**
 * Test that simulates loading prompts from the bundled dist/index.js
 * This verifies that the smart path detection works for global installations
 */

import { join } from "node:path";

// Simulate what import.meta.dir would be when running from dist/
const simulatedDistDir = join(process.cwd(), "dist");

console.log("\n🧪 Testing bundled prompt loading simulation");
console.log("=".repeat(60));
console.log("Simulated dist directory:", simulatedDistDir);

// Simulate the smart path detection logic from index.ts
const isBundle = simulatedDistDir.endsWith("/dist") || simulatedDistDir.endsWith("\\dist");
const baseDir = isBundle ? join(simulatedDistDir, "..") : simulatedDistDir;

console.log("Is bundle detected:", isBundle);
console.log("Base directory:", baseDir);
console.log("");

// Test loading each source type
const testCases = [
  { sourceType: "figma", style: "pm", filename: "story-generation.txt" },
  { sourceType: "figma", style: "technical", filename: "decomposition.txt" },
  { sourceType: "log", style: "pm", filename: "story-generation.txt" },
  { sourceType: "log", style: "technical", filename: "decomposition.txt" },
  { sourceType: "prompt", style: "pm", filename: "story-generation.txt" },
  { sourceType: "prompt", style: "technical", filename: "decomposition.txt" },
] as const;

let allPassed = true;

for (const testCase of testCases) {
  const promptPath = join(
    baseDir,
    "prompts",
    testCase.sourceType,
    testCase.style,
    testCase.filename
  );

  const exists = await Bun.file(promptPath).exists();
  const status = exists ? "✓" : "✗";
  const result = exists ? "PASS" : "FAIL";

  console.log(`${status} ${result}: ${testCase.sourceType}/${testCase.style}/${testCase.filename}`);

  if (!exists) {
    console.log(`  Expected path: ${promptPath}`);
    allPassed = false;
  }
}

console.log("=".repeat(60));
if (allPassed) {
  console.log("✅ All prompt files found - bundled loading works!\n");
  process.exit(0);
} else {
  console.log("❌ Some prompt files not found - bundled loading broken!\n");
  process.exit(1);
}
