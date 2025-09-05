#!/bin/bash

# CI Debug Script - helps troubleshoot CI/CD issues
# Make script executable
chmod +x $0
# Usage: ./scripts/ci/debug-ci.sh

echo "🔍 CI/CD Debug Information"
echo "=========================="

echo ""
echo "📁 Current Directory:"
pwd
ls -la

echo ""
echo "🔧 Build Status:"
if [ -f "./bin/code-review" ]; then
    echo "✅ Binary exists"
    ls -la ./bin/code-review
    
    echo ""
    echo "🧪 Testing binary:"
    ./bin/code-review --help | head -5
else
    echo "❌ Binary not found"
    echo "Available files in bin/:"
    ls -la ./bin/ 2>/dev/null || echo "bin/ directory doesn't exist"
fi

echo ""
echo "🔑 Authentication Check:"
if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
    echo "✅ CLAUDE_CODE_OAUTH_TOKEN is set (length: ${#CLAUDE_CODE_OAUTH_TOKEN} chars)"
elif [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "✅ ANTHROPIC_API_KEY is set (length: ${#ANTHROPIC_API_KEY} chars)"
else
    echo "❌ No authentication environment variables found"
fi

if [ -n "$GEMINI_API_KEY" ]; then
    echo "✅ GEMINI_API_KEY is set (length: ${#GEMINI_API_KEY} chars)"
else
    echo "⚠️  GEMINI_API_KEY not set (optional)"
fi

echo ""
echo "📦 Dependencies:"
if command -v bun >/dev/null 2>&1; then
    echo "✅ Bun: $(bun --version)"
else
    echo "❌ Bun not found"
fi

if command -v node >/dev/null 2>&1; then
    echo "✅ Node: $(node --version)"
else
    echo "❌ Node not found"
fi

echo ""
echo "🏗️  Build Test:"
if [ -f "package.json" ]; then
    echo "✅ package.json exists"
    echo "Available scripts:"
    cat package.json | grep -A 10 '"scripts"' | head -6
else
    echo "❌ package.json not found"
fi

echo ""
echo "🎯 Quick Test Run:"
if [ -f "./bin/code-review" ]; then
    echo "Running: ./bin/code-review --config"
    ./bin/code-review --config || echo "Config command failed with exit code $?"
else
    echo "❌ Cannot test - binary not available"
fi

echo ""
echo "💡 CI/CD Troubleshooting Tips:"
echo "1. Ensure CLAUDE_CODE_OAUTH_TOKEN is set in repository secrets"
echo "2. Check that 'bun run build' completes successfully"
echo "3. Verify ./bin/code-review is executable after build"
echo "4. Test authentication with './bin/code-review --config'"
echo "5. Use debug mode: './bin/code-review --template quality . --ci-mode --output json'"
