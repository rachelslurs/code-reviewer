#!/bin/bash

# Enhanced CI Debug Script with JSON validation
# Make script executable
chmod +x $0

echo "🔍 Enhanced CI Debug - JSON Structure Analysis"
echo "=============================================="

echo ""
echo "📁 Current Directory:"
pwd
ls -la

echo ""
echo "🔧 Build Status:"
if [ -f "./bin/code-review" ]; then
    echo "✅ Binary exists"
    ls -la ./bin/code-review
else
    echo "❌ Binary not found"
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

echo ""
echo "📊 JSON Analysis:"
if [ -f "review-results.json" ]; then
    echo "✅ review-results.json exists"
    
    echo "📏 File size: $(wc -c < review-results.json) bytes"
    echo "📄 Line count: $(wc -l < review-results.json) lines"
    
    echo ""
    echo "🔍 JSON Structure Analysis:"
    
    # Check if it's valid JSON
    if command -v jq >/dev/null 2>&1; then
        if jq . review-results.json >/dev/null 2>&1; then
            echo "✅ Valid JSON format"
            
            # Determine if it's array or object
            JSON_TYPE=$(jq -r 'type' review-results.json)
            echo "📝 JSON type: $JSON_TYPE"
            
            if [ "$JSON_TYPE" = "array" ]; then
                ITEM_COUNT=$(jq 'length' review-results.json)
                echo "📊 Array items: $ITEM_COUNT"
                
                if [ "$ITEM_COUNT" -gt 0 ]; then
                    echo "🔍 First item structure:"
                    jq '.[0] | keys' review-results.json
                    
                    echo "🔍 Sample first item:"
                    jq '.[0]' review-results.json | head -10
                fi
            else
                echo "🔍 Object structure:"
                jq 'keys' review-results.json
                
                echo "🔍 Sample object:"
                jq '.' review-results.json | head -10
            fi
            
            # Test critical issue detection
            echo ""
            echo "🧪 Testing critical issue detection:"
            CRITICAL_TEST=$(jq -r '
              if type == "array" then
                [.[] | select(.hasIssues and (.feedback | contains("Critical") or contains("🚨")))] | length
              else
                if .hasIssues and (.feedback | contains("Critical") or contains("🚨")) then 1 else 0 end
              end
            ' review-results.json 2>/dev/null || echo "ERROR")
            
            echo "🎯 Critical issues detected: $CRITICAL_TEST"
            
        else
            echo "❌ Invalid JSON format"
            echo "📄 First 200 characters:"
            head -c 200 review-results.json
            echo ""
            
            echo "📄 Last 200 characters:"
            tail -c 200 review-results.json
            echo ""
        fi
    else
        echo "⚠️ jq not available for JSON analysis"
        echo "📄 First 500 characters:"
        head -c 500 review-results.json
        echo ""
    fi
else
    echo "❌ review-results.json not found"
    
    echo "🔍 Looking for any JSON files:"
    find . -name "*.json" -type f 2>/dev/null | head -10 || echo "No JSON files found"
fi

echo ""
echo "💡 CI Troubleshooting Summary:"
echo "1. Check JSON format and structure above"
echo "2. Verify authentication is working"
echo "3. Ensure binary exists and is executable"
echo "4. Look for any error patterns in the JSON content"
echo "5. Test locally with: make test-oauth"
