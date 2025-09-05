#!/bin/bash

# 🤖 Test: CI Mode and Exit Codes
# Verifies CI mode works properly and sets correct exit codes

echo "Testing CI mode functionality..."

cd "$(dirname "$0")/../.."

# Test 1: CI mode with clean code (should exit 0)
echo "🧪 Test 1: Clean code (exit 0)"
if ./bin/code-review --template quality --ci-mode --allow-dirty --yes test-files/clean-code.tsx >/dev/null 2>&1; then
    echo "✅ Clean code returned exit 0"
else
    echo "❌ Clean code should return exit 0"
    exit 1
fi

# Test 2: CI mode with security issues (should exit 1)
echo "🧪 Test 2: Critical issues (exit 1)"
if ./bin/code-review --template security --ci-mode --allow-dirty --yes test-files/security-issues.ts >/dev/null 2>&1; then
    echo "❌ Security issues should return exit 1"
    exit 1
else
    echo "✅ Security issues returned exit 1"
fi

# Test 3: CI mode skips prompts
echo "🧪 Test 3: No interactive prompts in CI mode"
timeout 10s ./bin/code-review --template quality --ci-mode --allow-dirty test-files/ >/dev/null 2>&1
if [ $? -eq 124 ]; then
    echo "❌ CI mode timed out (waiting for user input)"
    exit 1
else
    echo "✅ CI mode completed without prompts"
fi

echo "✅ All CI mode tests passed"
