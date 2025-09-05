#!/bin/bash

# 🚀 CI Setup Script
# Prepares the environment for CI/CD integration

echo "🚀 Setting up CI/CD integration..."

cd "$(dirname "$0")/../.."

# Create .github directory structure
echo "📁 Creating GitHub Actions structure..."
mkdir -p .github/workflows
mkdir -p .github/scripts

# Set permissions
echo "🔧 Setting executable permissions..."
chmod +x scripts/**/*.sh
chmod +x scripts/*.sh

# Verify required files exist
echo "📋 Verifying required files..."

REQUIRED_FILES=(
    "bin/code-review"
    "package.json"
    "tsconfig.json"
    "test-files/security-issues.ts"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing required file: $file"
        exit 1
    fi
done

echo "✅ All required files present"

# Test build
echo "🔧 Testing build process..."
if bun run build; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

# Test basic functionality
echo "🧪 Testing basic functionality..."
if ./bin/code-review --help >/dev/null 2>&1; then
    echo "✅ CLI is functional"
else
    echo "❌ CLI is not working"
    exit 1
fi

echo ""
echo "🎉 CI/CD setup complete!"
echo ""
echo "Next steps:"
echo "1. Run: bash scripts/test-all.sh"
echo "2. Add ANTHROPIC_API_KEY to GitHub Secrets"
echo "3. Create PR to test GitHub Actions workflow"
