# 📁 Project Organization Guide

## 🗂️ **Current Structure**

```
code-review-agent/
├── 📁 scripts/           # All automation scripts
│   ├── 📁 test/          # Testing scripts
│   │   ├── ci-mode.sh    # Test CI functionality
│   │   ├── json-output.sh # Test JSON generation
│   │   ├── error-handling.sh # Test error handling
│   │   ├── templates.sh  # Test all templates
│   │   └── performance.sh # Performance tests
│   ├── 📁 ci/            # CI/CD automation
│   │   ├── setup.sh      # CI setup script
│   │   └── generate-pr-comment.sh # PR comment generator
│   └── test-all.sh       # Master test runner
├── 📁 .github/           # GitHub Actions (to be created)
│   ├── 📁 workflows/     # GitHub workflow files
│   └── 📁 scripts/       # GitHub-specific scripts
├── Makefile              # Easy command management
└── ...
```

## 🎯 **Usage Commands**

### **Quick Commands (Using Make)**
```bash
# Show all available commands
make help

# Build and test
make setup          # Install deps + build
make test           # Basic functionality test
make test-all       # Complete test suite

# Individual tests
make test-ci        # CI mode tests
make test-json      # JSON output tests
make test-error     # Error handling tests
make test-perf      # Performance tests

# Development
make dev-test       # Quick single file test
make dev-json       # Quick JSON test
make status         # Show project status
```

### **Direct Script Usage**
```bash
# Run complete test suite
bash scripts/test-all.sh

# Individual test categories
bash scripts/test/ci-mode.sh
bash scripts/test/json-output.sh
bash scripts/test/error-handling.sh
bash scripts/test/templates.sh
bash scripts/test/performance.sh

# CI/CD setup
bash scripts/ci/setup.sh

# Generate PR comment from results
bash scripts/ci/generate-pr-comment.sh test-results.json
```

## 🚀 **Workflow Examples**

### **Local Development Testing**
```bash
# Quick development cycle
make build
make dev-test

# Full validation before committing
make test-all
```

### **CI/CD Setup**
```bash
# One-time setup
make setup-ci

# Test PR comment generation
make dev-json
make pr-comment
```

### **Debugging Issues**
```bash
# Test specific functionality
make test-error     # Test error handling
make test-ci        # Test CI mode
make test-json      # Test JSON output

# Check project status
make status
```

## 📋 **Test Categories**

### **🤖 CI Mode Tests (`ci-mode.sh`)**
- ✅ Exit codes (0 for clean, 1 for issues)
- ✅ Non-interactive operation
- ✅ Proper prompt skipping

### **📄 JSON Output Tests (`json-output.sh`)**
- ✅ File generation
- ✅ Valid JSON structure
- ✅ Non-empty results
- ✅ Token tracking

### **🛡️ Error Handling Tests (`error-handling.sh`)**
- ✅ User-friendly error messages
- ✅ Actionable solutions
- ✅ Graceful fallbacks

### **🎯 Template Tests (`templates.sh`)**
- ✅ All templates functional
- ✅ Proper exit codes
- ✅ Multi-template support

### **⚡ Performance Tests (`performance.sh`)**
- ✅ Speed benchmarks
- ✅ Memory usage limits
- ✅ Timeout handling

## 🎨 **Benefits of This Organization**

### **✅ Clear Separation**
- **`scripts/test/`** - All testing logic
- **`scripts/ci/`** - CI/CD automation
- **`Makefile`** - Simple command interface

### **✅ Easy Usage**
- **`make test-all`** - Complete validation
- **`make dev-test`** - Quick development
- **`make status`** - Project health check

### **✅ GitHub Actions Ready**
- **Structured scripts** for workflow automation
- **PR comment generation** built-in
- **Modular testing** for parallel execution

### **✅ Developer Friendly**
- **Self-documenting** with help commands
- **Consistent naming** and structure
- **Progress indicators** and colored output

## 🚀 **Next Steps**

1. **Test the organization**: `make test-all`
2. **Set up GitHub Actions**: `make setup-ci`
3. **Create PR workflow**: Add `.github/workflows/code-review.yml`
4. **Test integration**: Create test PR

This organization makes your project **professional, maintainable, and CI/CD ready**! 🎉
