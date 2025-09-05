#!/bin/bash

# Enhanced CI Review Script with proper flag handling
# Make script executable
chmod +x $0

TEMPLATE=${1:-"quality"}
TARGET_PATH=${2:-"."}
IS_INCREMENTAL=${3:-"false"}
BASE_REF=${4:-""}
OUTPUT_FILE="review-results.json"

echo "🤖 Enhanced Safe CI Review"
echo "Template: $TEMPLATE"
echo "Path: $TARGET_PATH"
echo "Incremental: $IS_INCREMENTAL"
echo "Base ref: $BASE_REF"
echo "Output: $OUTPUT_FILE"

# Function to create fallback JSON if review fails
create_fallback_json() {
    local exit_code=$1
    local error_message=$2
    
    cat > "$OUTPUT_FILE" << EOF
[
  {
    "filePath": "CI_ERROR",
    "template": "$TEMPLATE",
    "hasIssues": true,
    "feedback": "⚠️ Code review failed: $error_message (exit code: $exit_code)",
    "tokensUsed": {
      "input": 0,
      "output": 0
    },
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "authMethod": "oauth-token",
    "modelUsed": "none",
    "responseTime": 0
  }
]
EOF
    
    echo "📝 Created fallback JSON: $OUTPUT_FILE"
}

# Ensure we have executable binary
if [ ! -f "./bin/code-review" ]; then
    echo "❌ Binary not found, trying to build..."
    bun run build || {
        create_fallback_json 1 "Build failed"
        exit 1
    }
    chmod +x ./bin/code-review
fi

# Test authentication
echo "🔍 Testing authentication..."
./bin/code-review --config || {
    create_fallback_json 2 "Authentication failed"
    exit 1
}

# Build the command
CMD="./bin/code-review --template $TEMPLATE --ci-mode --output json --output-file $OUTPUT_FILE --auto-fallback --allow-dirty"

# Add incremental flags if needed
if [ "$IS_INCREMENTAL" = "true" ] && [ -n "$BASE_REF" ]; then
    CMD="$CMD --incremental --compare-with $BASE_REF"
    echo "🔍 Running incremental review against $BASE_REF"
else
    echo "🔍 Running full review"
fi

CMD="$CMD $TARGET_PATH"

# Run the actual review
echo "🚀 Executing: $CMD"
if eval "$CMD"; then
    echo "✅ Review completed successfully"
    
    # Verify JSON was created
    if [ -f "$OUTPUT_FILE" ]; then
        echo "✅ Output file created: $OUTPUT_FILE"
        echo "📊 Results preview:"
        head -10 "$OUTPUT_FILE"
    else
        echo "⚠️ Warning: No output file created despite success"
        create_fallback_json 0 "Review succeeded but no output file created"
    fi
    
else
    review_exit_code=$?
    echo "❌ Review failed with exit code: $review_exit_code"
    
    # Check if partial results exist
    if [ -f "$OUTPUT_FILE" ]; then
        echo "📝 Partial results found, keeping them"
    else
        echo "📝 No results found, creating fallback"
        create_fallback_json $review_exit_code "Review process failed"
    fi
    
    # Don't exit with error - we want CI to continue with partial results
    echo "⚠️ Continuing with available results..."
fi

# Final verification
if [ -f "$OUTPUT_FILE" ]; then
    echo "✅ Final check: $OUTPUT_FILE exists"
    # Validate JSON format
    if command -v jq >/dev/null 2>&1; then
        if jq . "$OUTPUT_FILE" >/dev/null 2>&1; then
            echo "✅ JSON format is valid"
        else
            echo "⚠️ JSON format is invalid, but file exists"
        fi
    fi
else
    echo "❌ Critical: No output file exists!"
    create_fallback_json 99 "Unknown error - no output created"
fi

echo "🎯 Enhanced safe review completed"
