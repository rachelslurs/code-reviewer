#!/bin/bash

# Test the improved error handling
echo "🧪 Testing improved error handling..."

cd /Users/rachel/Code/code-review-agent

# Build the project
echo "📦 Building project..."
bun run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    
    # Test 1: API credit error (should show friendly error)
    echo ""
    echo "🧪 Test 1: Testing API credit error handling..."
    echo "This should show a user-friendly error message about insufficient credits:"
    ./bin/code-review --template security --output json --ci-mode --allow-dirty --yes test-files/security-issues.ts --output-file test-debug.json
    
else
    echo "❌ Build failed"
    exit 1
fi
