#!/bin/bash

# Test script for OAuth token authentication
# Make script executable
chmod +x $0
# Usage: ./scripts/test/oauth-token-test.sh

echo "🎫 Testing Claude OAuth Token Authentication"
echo "==========================================="

# Check if OAuth token is set
if [ -z "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
    echo "❌ CLAUDE_CODE_OAUTH_TOKEN not set"
    echo ""
    echo "To test OAuth token authentication:"
    echo "1. Get an OAuth token from your Claude Code setup"
    echo "2. Export it: export CLAUDE_CODE_OAUTH_TOKEN=your-token"
    echo "3. Run this test again"
    exit 1
fi

echo "✅ CLAUDE_CODE_OAUTH_TOKEN is set (length: ${#CLAUDE_CODE_OAUTH_TOKEN} chars)"

# Temporarily unset other auth methods to ensure OAuth is used
unset ANTHROPIC_API_KEY

# Test authentication check
echo ""
echo "🔍 Testing authentication detection..."
cd /Users/rachel/Code/code-review-agent
./bin/code-review --config

echo ""
echo "🎯 Testing OAuth token with a simple review..."
echo "Creating test file..."

# Create a simple test file
cat > /tmp/oauth-test.js << 'EOF'
// Simple test file for OAuth authentication
function buggyFunction() {
    var x = 1;  // Should use const/let
    return x + undefined;  // Bug: adding undefined
}

// No error handling
fetch('/api/data').then(res => res.json());
EOF

echo "📝 Test file created: /tmp/oauth-test.js"

# Run review with OAuth token
echo ""
echo "🤖 Running code review with OAuth token..."
./bin/code-review /tmp/oauth-test.js --template quality --yes --ci-mode

exit_code=$?

# Cleanup
rm -f /tmp/oauth-test.js

if [ $exit_code -eq 0 ]; then
    echo ""
    echo "✅ OAuth token authentication test PASSED!"
    echo "🎉 CI/CD environments can now use CLAUDE_CODE_OAUTH_TOKEN"
else
    echo ""
    echo "❌ OAuth token authentication test FAILED!"
    echo "Check the error messages above for details"
fi

exit $exit_code
