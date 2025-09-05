#!/bin/bash

# OAuth Token API Diagnostic Test
# Make script executable
chmod +x $0

echo "🔍 OAuth Token API Diagnostic Test"
echo "=================================="

# Check if OAuth token is set
if [ -z "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
    echo "❌ CLAUDE_CODE_OAUTH_TOKEN not set"
    echo "Set it first: export CLAUDE_CODE_OAUTH_TOKEN=your-token"
    exit 1
fi

echo "✅ OAuth token is set (length: ${#CLAUDE_CODE_OAUTH_TOKEN} chars)"

# Test with curl to see the raw API response
echo ""
echo "🧪 Testing OAuth token with direct API call..."

# Create test payload
PAYLOAD='{
  "model": "claude-3-5-haiku-20241220",
  "max_tokens": 50,
  "messages": [
    {
      "role": "user", 
      "content": "Say hello"
    }
  ]
}'

echo "📡 Making direct API call to Anthropic..."

# Make the API call
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CLAUDE_CODE_OAUTH_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -d "$PAYLOAD" \
  https://api.anthropic.com/v1/messages)

# Extract status code
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')

echo "📊 Response Status: $HTTP_STATUS"
echo "📄 Response Body:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"

# Interpret the results
echo ""
echo "🔍 Analysis:"
case $HTTP_STATUS in
    200)
        echo "✅ SUCCESS: OAuth token is working perfectly!"
        echo "   The issue is likely in the code review agent's error handling"
        ;;
    401)
        echo "❌ AUTHENTICATION FAILED: OAuth token is invalid"
        echo "   - Check if token is correct"
        echo "   - Verify token hasn't expired"
        echo "   - Ensure token has proper format"
        ;;
    403)
        echo "❌ PERMISSION DENIED: OAuth token lacks required permissions"
        echo "   - Check token scopes/permissions"
        echo "   - Verify token is for the correct API"
        ;;
    429)
        echo "⚠️ RATE LIMITED: Too many requests"
        echo "   - Wait before retrying"
        echo "   - Check rate limits"
        ;;
    *)
        echo "❌ UNEXPECTED ERROR: HTTP $HTTP_STATUS"
        echo "   - Check API endpoint"
        echo "   - Verify request format"
        ;;
esac

echo ""
echo "💡 Next steps based on results above"
