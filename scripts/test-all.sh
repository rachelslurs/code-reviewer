#!/bin/bash

# 🧪 Test Suite: All Local CI/CD Tests
# Run all tests to verify CI/CD integration works properly

set -e

echo "🚀 Code Review Agent - Full Test Suite"
echo "======================================"

# Navigate to project root
cd "$(dirname "$0")/../.."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

run_test() {
    local test_name="$1"
    local test_script="$2"
    
    echo -e "\n${BLUE}🧪 Running: $test_name${NC}"
    echo "----------------------------------------"
    
    if bash "$test_script"; then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
        return 0
    else
        echo -e "${RED}❌ FAILED: $test_name${NC}"
        return 1
    fi
}

# Build project first
echo -e "${BLUE}📦 Building project...${NC}"
if bun run build; then
    echo -e "${GREEN}✅ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

# Track test results
TOTAL_TESTS=0
PASSED_TESTS=0

# Test 1: CI Mode Functionality
TOTAL_TESTS=$((TOTAL_TESTS + 1))
if run_test "CI Mode & Exit Codes" "scripts/test/ci-mode.sh"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
fi

# Test 2: JSON Output Generation
TOTAL_TESTS=$((TOTAL_TESTS + 1))
if run_test "JSON Output Generation" "scripts/test/json-output.sh"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
fi

# Test 3: Error Handling
TOTAL_TESTS=$((TOTAL_TESTS + 1))
if run_test "Error Handling" "scripts/test/error-handling.sh"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
fi

# Test 4: Template Testing
TOTAL_TESTS=$((TOTAL_TESTS + 1))
if run_test "All Templates" "scripts/test/templates.sh"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
fi

# Test 5: Performance Testing
TOTAL_TESTS=$((TOTAL_TESTS + 1))
if run_test "Performance & Speed" "scripts/test/performance.sh"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
fi

# Final Results
echo -e "\n${BLUE}📊 Test Results Summary${NC}"
echo "========================================"
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$((TOTAL_TESTS - PASSED_TESTS))${NC}"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "\n${GREEN}🎉 All tests passed! CI/CD integration ready.${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Fix issues before deploying.${NC}"
    exit 1
fi
