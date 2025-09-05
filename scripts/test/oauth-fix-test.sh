#!/bin/bash

# Quick test to verify OAuth token fix
# Make script executable
chmod +x $0
echo "🧪 Testing OAuth Token Fix"
echo "=========================="

# Verify we have the OAuth token
if [ -z "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
    echo "❌ CLAUDE_CODE_OAUTH_TOKEN not set"
    echo "Set it first: export CLAUDE_CODE_OAUTH_TOKEN=your-token"
    exit 1
fi

echo "✅ OAuth token is set"

# Build if needed
if [ ! -f "./bin/code-review" ]; then
    echo "🔧 Building project..."
    bun run build
    chmod +x ./bin/code-review
fi

# Test auth config
echo ""
echo "🔍 Testing auth configuration:"
./bin/code-review --config

echo ""
echo "🚀 Testing quick review with OAuth (should work now):"
echo "console.log('test oauth');" > /tmp/oauth-test.js

# Test with a simple file and OAuth token
./bin/code-review \
  --template quality \
  --ci-mode \
  --allow-dirty \
  --output json \
  --output-file /tmp/oauth-test-results.json \
  /tmp/oauth-test.js

if [ -f "/tmp/oauth-test-results.json" ]; then
    echo "✅ OAuth token fix successful!"
    echo "📋 Results preview:"
    head -10 /tmp/oauth-test-results.json
    rm -f /tmp/oauth-test-results.json
else
    echo "❌ OAuth token fix failed - no results created"
fi

# Cleanup
rm -f /tmp/oauth-test.js

echo ""
echo "🎯 OAuth token test completed"
