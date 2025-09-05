#!/bin/bash

# ⚡ Test: Performance and Speed
# Verifies the tool performs well and completes in reasonable time

echo "Testing performance and speed..."

cd "$(dirname "$0")/../.."

# Test 1: Single file performance
echo "🧪 Test 1: Single file review speed"
START_TIME=$(date +%s)
./bin/code-review --template quality --ci-mode --allow-dirty --yes test-files/security-issues.ts >/dev/null 2>&1
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "   Duration: ${DURATION}s"
if [ $DURATION -gt 180 ]; then  # 3 minutes max
    echo "❌ Single file review took too long (${DURATION}s > 180s)"
    exit 1
else
    echo "✅ Single file review completed in reasonable time"
fi

# Test 2: Multiple files performance  
echo "🧪 Test 2: Multiple files review speed"
START_TIME=$(date +%s)
./bin/code-review --template quality --ci-mode --allow-dirty --yes test-files/ >/dev/null 2>&1
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "   Duration: ${DURATION}s"
if [ $DURATION -gt 300 ]; then  # 5 minutes max for multiple files
    echo "❌ Multiple files review took too long (${DURATION}s > 300s)"
    exit 1
else
    echo "✅ Multiple files review completed in reasonable time"
fi

# Test 3: Memory usage (rough check)
echo "🧪 Test 3: Memory usage check"
if command -v ps >/dev/null 2>&1; then
    # Start review in background and monitor memory
    ./bin/code-review --template combined --ci-mode --allow-dirty --yes test-files/ >/dev/null 2>&1 &
    PID=$!
    
    # Wait a bit for process to start
    sleep 2
    
    if kill -0 $PID 2>/dev/null; then
        # Get memory usage (in KB)
        MEMORY=$(ps -o rss= -p $PID 2>/dev/null || echo "0")
        MEMORY_MB=$((MEMORY / 1024))
        
        echo "   Memory usage: ${MEMORY_MB}MB"
        
        # Wait for process to complete
        wait $PID
        
        if [ $MEMORY_MB -gt 1024 ]; then  # 1GB max
            echo "❌ Memory usage too high (${MEMORY_MB}MB > 1024MB)"
            exit 1
        else
            echo "✅ Memory usage within acceptable limits"
        fi
    else
        echo "✅ Process completed quickly"
    fi
else
    echo "⚠️  ps command not available, skipping memory test"
fi

echo "✅ All performance tests passed"
