#!/usr/bin/env bun

import { execSync } from 'child_process';

console.log('🔍 Testing different Claude Code commands...\n');

// Try different commands to see which ones give us actual auth status
const commands = [
  'claude auth status',
  'claude status', 
  'claude --version',
  'claude help',
];

for (const cmd of commands) {
  console.log(`\n--- Testing: ${cmd} ---`);
  try {
    const result = execSync(cmd, { 
      encoding: 'utf8', 
      stdio: 'pipe',
      timeout: 3000  // 3 second timeout
    });
    console.log('Output:');
    console.log(result.substring(0, 200) + (result.length > 200 ? '...' : ''));
  } catch (error: any) {
    console.log(`Error: ${error.message}`);
  }
}

// Also try non-interactive flags
console.log('\n--- Testing non-interactive approaches ---');
try {
  // Try with --help flag
  const helpResult = execSync('claude --help', { 
    encoding: 'utf8', 
    stdio: 'pipe',
    timeout: 3000
  });
  console.log('Help output (first 200 chars):');
  console.log(helpResult.substring(0, 200) + '...');
} catch (error: any) {
  console.log(`Help error: ${error.message}`);
}
