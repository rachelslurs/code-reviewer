# 🤖 Code Review Agent - Development Commands
# Usage: make <command>

.PHONY: help build test test-all test-ci test-json test-error test-perf clean setup-ci

# Default target
help: ## Show this help message
	@echo "🤖 Code Review Agent - Available Commands"
	@echo "=========================================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# Build commands
build: ## Build the project
	@echo "📦 Building project..."
	@bun run build

clean: ## Clean build artifacts and test files
	@echo "🧹 Cleaning up..."
	@rm -f bin/code-review
	@rm -f test-*.json
	@rm -f pr-comment.md
	@rm -rf .codereview-cache
	@rm -rf .codereview-sessions

# Test commands
test: build ## Run basic functionality test
	@echo "🧪 Running basic test..."
	@./bin/code-review --template quality --ci-mode --allow-dirty --yes test-files/security-issues.ts

test-all: build ## Run complete test suite
	@echo "🚀 Running complete test suite..."
	@bash scripts/test-all.sh

test-ci: build ## Test CI mode functionality
	@bash scripts/test/ci-mode.sh

test-json: build ## Test JSON output generation
	@bash scripts/test/json-output.sh

test-error: build ## Test error handling
	@bash scripts/test/error-handling.sh

test-perf: build ## Test performance
	@bash scripts/test/performance.sh

test-templates: build ## Test all review templates
	@bash scripts/test/templates.sh

test-ci-fix: build ## Test CI fixes locally
	@echo "🧪 Testing CI fixes..."
	@chmod +x scripts/test/ci-fix-test.sh
	@./scripts/test/ci-fix-test.sh

test-oauth: build ## Test OAuth token authentication (DEPRECATED)
	@echo "⚠️ OAuth tokens are not supported by Anthropic API"
	@echo "Use 'make test-api-key' instead"

test-api-key: build ## Test API key authentication
	@echo "🔑 Testing API key..."
	@chmod +x scripts/test/api-key-test.sh
	@./scripts/test/api-key-test.sh

test-debug-ci: ## Test enhanced CI debugging
	@echo "🔍 Testing CI debug tools..."
	@chmod +x scripts/ci/enhanced-debug.sh
	@./scripts/ci/enhanced-debug.sh

# CI/CD commands
setup-ci: ## Setup CI/CD integration files
	@bash scripts/ci/setup.sh

pr-comment: ## Generate PR comment from last test results (requires test-results.json)
	@bash scripts/ci/generate-pr-comment.sh test-results.json

# Development shortcuts
dev-test: ## Quick development test (single file)
	@make build
	@./bin/code-review --template combined --allow-dirty --yes test-files/security-issues.ts

dev-json: ## Quick JSON output test
	@make build  
	@./bin/code-review --template combined --output json --ci-mode --allow-dirty --yes test-files/security-issues.ts --output-file dev-test.json
	@echo "📄 Results saved to: dev-test.json"
	@jq '.metadata' dev-test.json

# Installation and setup
install: ## Install dependencies
	@echo "📦 Installing dependencies..."
	@bun install

setup: install build ## Complete setup (install + build)
	@echo "✅ Setup complete!"
	@echo "Run 'make test' to verify everything works"

# Status check
status: ## Show project status and available commands
	@echo "🤖 Code Review Agent Status"
	@echo "============================"
	@echo "Build status:"
	@if [ -f "bin/code-review" ]; then echo "  ✅ Built"; else echo "  ❌ Not built (run 'make build')"; fi
	@echo "Dependencies:"
	@if [ -d "node_modules" ]; then echo "  ✅ Installed"; else echo "  ❌ Not installed (run 'make install')"; fi
	@echo "Authentication:"
	@if command -v claude >/dev/null 2>&1; then echo "  ✅ Claude Code available"; else echo "  ⚠️  Claude Code not found"; fi
	@if [ -n "$$ANTHROPIC_API_KEY" ]; then echo "  ✅ API key set"; else echo "  ⚠️  No API key set"; fi
	@echo ""
	@echo "Next: run 'make test' to verify functionality"
