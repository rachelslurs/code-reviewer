#!/bin/bash

# Test the CI fixes locally
# Make script executable
chmod +x $0
echo "🧪 Testing CI Fixes Locally"
echo "============================="

# Test that we can bypass git check
echo ""
echo "1. Testing --allow-dirty flag:"
if [ -f "./bin/code-review" ]; then
    echo "✅ Binary exists"
else
    echo "🔧 Building binary..."
    bun run build
    chmod +x ./bin/code-review
fi

echo "🔍 Testing allow-dirty flag:"
./bin/code-review --config --allow-dirty

echo ""
echo "2. Testing enhanced safe review script:"
chmod +x ./scripts/ci/enhanced-safe-review.sh

# Test with a simple file
echo "console.log('test');" > /tmp/test-ci.js

echo "🚀 Running enhanced safe review..."
./scripts/ci/enhanced-safe-review.sh "quality" "/tmp/test-ci.js" "false" ""

if [ -f "review-results.json" ]; then
    echo "✅ Review results created successfully!"
    echo "📋 Results:"
    cat review-results.json | head -20
    rm review-results.json
else
    echo "❌ No review results created"
fi

# Cleanup
rm -f /tmp/test-ci.js

echo ""
echo "🎯 Local CI test completed!"
echo "The enhanced script should now work in GitHub Actions with --allow-dirty"
