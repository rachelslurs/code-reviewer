#!/bin/bash

# Test Claude Model Names
# Make script executable
chmod +x $0

echo "🧪 Testing Claude Model Names"
echo "============================="

# Check if API key is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ ANTHROPIC_API_KEY not set"
    echo "Set it first: export ANTHROPIC_API_KEY=your-api-key"
    exit 1
fi

echo "✅ API key is set"

echo ""
echo "🔍 Testing model names with direct API calls..."

# Test Haiku model
echo ""
echo "📞 Testing Claude 3.5 Haiku (claude-3-5-haiku-20241022):"
HAIKU_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-5-haiku-20241022",
    "max_tokens": 10,
    "messages": [
      {
        "role": "user", 
        "content": "Say hello"
      }
    ]
  }' \
  https://api.anthropic.com/v1/messages)

HAIKU_STATUS=$(echo "$HAIKU_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "Status: $HAIKU_STATUS"
if [ "$HAIKU_STATUS" = "200" ]; then
    echo "✅ Haiku model works!"
else
    echo "❌ Haiku model failed"
    echo "$HAIKU_RESPONSE" | sed '/HTTP_STATUS:/d'
fi

# Test Sonnet model
echo ""
echo "📞 Testing Claude 3.5 Sonnet (claude-3-5-sonnet-20241220):"
SONNET_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-5-sonnet-20241220",
    "max_tokens": 10,
    "messages": [
      {
        "role": "user", 
        "content": "Say hello"
      }
    ]
  }' \
  https://api.anthropic.com/v1/messages)

SONNET_STATUS=$(echo "$SONNET_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "Status: $SONNET_STATUS"
if [ "$SONNET_STATUS" = "200" ]; then
    echo "✅ Sonnet model works!"
else
    echo "❌ Sonnet model failed"
    echo "$SONNET_RESPONSE" | sed '/HTTP_STATUS:/d'
fi

echo ""
echo "🎯 Model test completed"
