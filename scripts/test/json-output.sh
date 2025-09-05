#!/bin/bash

# 📄 Test: JSON Output Generation
# Verifies JSON output contains proper structure and data

echo "Testing JSON output generation..."

cd "$(dirname "$0")/../.."

OUTPUT_FILE="test-json-output.json"

# Test 1: Generate JSON output
echo "🧪 Test 1: JSON generation"
./bin/code-review --template combined --output json --ci-mode --allow-dirty --yes test-files/security-issues.ts --output-file "$OUTPUT_FILE" >/dev/null 2>&1

if [ ! -f "$OUTPUT_FILE" ]; then
    echo "❌ JSON file not created"
    exit 1
fi

# Test 2: JSON structure validation
echo "🧪 Test 2: JSON structure validation"
if ! jq '.metadata.totalFiles' "$OUTPUT_FILE" >/dev/null 2>&1; then
    echo "❌ JSON structure invalid or missing metadata"
    exit 1
fi

# Test 3: Non-empty results
echo "🧪 Test 3: Non-empty results"
TOTAL_FILES=$(jq '.metadata.totalFiles' "$OUTPUT_FILE")
if [ "$TOTAL_FILES" -eq 0 ]; then
    echo "❌ JSON shows 0 files processed"
    exit 1
fi

# Test 4: Results array populated
echo "🧪 Test 4: Results array populated"
RESULTS_LENGTH=$(jq '.results | length' "$OUTPUT_FILE")
if [ "$RESULTS_LENGTH" -eq 0 ]; then
    echo "❌ Results array is empty"
    exit 1
fi

# Test 5: Token usage tracking
echo "🧪 Test 5: Token usage tracking"
TOKENS_USED=$(jq '.metadata.totalTokensUsed' "$OUTPUT_FILE")
if [ "$TOKENS_USED" -eq 0 ]; then
    echo "❌ No token usage recorded"
    exit 1
fi

# Cleanup
rm -f "$OUTPUT_FILE"

echo "✅ All JSON output tests passed"
echo "   - Files processed: $TOTAL_FILES"
echo "   - Results generated: $RESULTS_LENGTH" 
echo "   - Tokens used: $TOKENS_USED"
