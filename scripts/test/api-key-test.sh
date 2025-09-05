#!/bin/bash

# Test API Key Authentication Fix
# Make script executable
chmod +x $0

echo "🧪 Testing API Key Authentication Fix"
echo "====================================="

# Check if API key is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ ANTHROPIC_API_KEY not set"
    echo "Set it first: export ANTHROPIC_API_KEY=your-api-key"
    exit 1
fi

echo "✅ API key is set (length: ${#ANTHROPIC_API_KEY} chars)"

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
echo "🚀 Testing quick review with API key:"
echo "console.log('test api key');" > /tmp/api-test.js

# Test with a simple file and API key
./bin/code-review \
  --template quality \
  --ci-mode \
  --allow-dirty \
  --output json \
  --output-file /tmp/api-test-results.json \
  /tmp/api-test.js

if [ -f "/tmp/api-test-results.json" ]; then
    echo "✅ API key authentication fix successful!"
    echo "📋 Results preview:"
    head -10 /tmp/api-test-results.json
    rm -f /tmp/api-test-results.json
else
    echo "❌ API key authentication fix failed - no results created"
fi

# Cleanup
rm -f /tmp/api-test.js

echo ""
echo "🎯 API key test completed"
