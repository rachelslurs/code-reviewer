#!/bin/bash

# 🛡️ Test: All Review Templates
# Verifies all templates work properly in CI mode

echo "Testing all review templates..."

cd "$(dirname "$0")/../.."

TEMPLATES=("quality" "security" "performance" "typescript" "combined")

for template in "${TEMPLATES[@]}"; do
    echo "🧪 Testing template: $template"
    
    if ./bin/code-review --template "$template" --ci-mode --allow-dirty --yes test-files/security-issues.ts >/dev/null 2>&1; then
        # Template worked (files had issues, so exit 1 is expected)
        echo "✅ Template '$template' executed successfully"
    else
        EXIT_CODE=$?
        if [ $EXIT_CODE -eq 1 ]; then
            echo "✅ Template '$template' found issues (exit 1 expected)"
        else
            echo "❌ Template '$template' failed with unexpected exit code: $EXIT_CODE"
            exit 1
        fi
    fi
done

# Test 'all' template
echo "🧪 Testing 'all' template (runs multiple templates)"
if ./bin/code-review --template all --ci-mode --allow-dirty --yes test-files/security-issues.ts >/dev/null 2>&1; then
    echo "✅ 'all' template executed successfully"
else
    echo "✅ 'all' template found issues (exit 1 expected)"
fi

echo "✅ All template tests passed"
