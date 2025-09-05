# 🤖 Code Review Agent

An AI-powered code review CLI tool that provides intelligent, multi-model code analysis with advanced features like caching, multi-model support, comprehensive error handling, and complete CI/CD integration.

## ✨ Features

### 🎯 **Multi-Model AI Support**
- **Smart Model Selection**: Automatically chooses the best AI model for each review type
- **Claude Integration**: Supports both Claude Code (subscription) and API key authentication
- **Gemini Integration**: Google's Gemini models for enhanced code analysis
- **Auto-Fallback**: Automatically switches models when one fails or hits rate limits
- **Cost Optimization**: Intelligent use of free vs paid models

### 🛡️ **Comprehensive Review Templates**
- **Quality**: Code organization, naming, duplication, complexity, error handling
- **Security**: Vulnerabilities, data validation, injection attacks, authentication issues
- **Performance**: Bundle size optimization, async patterns, memory usage
- **TypeScript**: Type safety, strict mode compliance, generic usage
- **Combined**: Single comprehensive review combining all aspects (4x faster than running all templates)

### ⚡ **Performance & Developer Experience**
- **Smart Caching**: Only reviews changed files, massive speedup for large codebases
- **Parallel Processing**: Reviews multiple files simultaneously with configurable concurrency
- **Incremental Reviews**: Only review files changed since last commit/branch
- **Resume Functionality**: Continue interrupted reviews from where you left off
- **Professional Error Handling**: User-friendly error messages with actionable solutions

### 🚀 **Complete CI/CD Integration**
- **GitHub Actions Workflow**: Automated PR reviews with comments
- **Exit Code Management**: Proper CI build status (pass/fail/warning)
- **JSON Output**: Structured data for automation and reporting
- **Non-Interactive Mode**: Perfect for automated environments

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh) installed
- **Authentication** (choose one):
  - Claude Code CLI (recommended) OR Anthropic API key
  - Google AI Studio API key (optional but recommended for auto-fallback)

### Installation

```bash
# Clone and install
git clone <your-repo-url>
cd code-review-agent
make setup              # Install dependencies + build

# Test installation
make status             # Check project health
make test               # Basic functionality test
```

### Authentication Setup

**Option 1: Claude Code (Recommended for Local Development)**
```bash
claude setup-token      # Uses your subscription with higher limits
```

**Option 2: OAuth Token (Best for CI/CD Environments)**
```bash
export CLAUDE_CODE_OAUTH_TOKEN="your-oauth-token"
```
> 🎯 **Perfect for GitHub Actions!** OAuth tokens provide secure, stateless authentication for CI/CD pipelines without requiring Claude Code CLI installation.

**Option 3: API Keys (Universal)**
```bash
export ANTHROPIC_API_KEY="your-claude-key"
export GEMINI_API_KEY="your-gemini-key"    # Optional for auto-fallback
```

**Option 4: Interactive Setup**
```bash
./bin/code-review --setup    # Configure any method interactively
```

### 🔑 Authentication Method Comparison

| Method | Local Dev | CI/CD | Rate Limits | Setup Complexity |
|--------|-----------|-------|-------------|------------------|
| **Claude Code** | ✅ Perfect | ❌ Complex | 🚀 Highest | 🟢 Simple |
| **OAuth Token** | ✅ Good | ✅ Perfect | 🚀 High | 🟡 Medium |
| **API Key** | ✅ Good | ✅ Good | ⚠️ Standard | 🟢 Simple |

> **💡 Recommendation**: Use Claude Code for local development, OAuth tokens for CI/CD!

## 📖 Usage Guide

### Quick Commands

```bash
# Basic usage
code-review ./src                        # Quality review with auto-fallback
code-review --template security ./       # Security-focused review
code-review --template combined ./src    # Comprehensive review

# Advanced features
code-review --auto-fallback --template security ./src  # Smart model fallback
code-review --interactive --template quality ./src     # Choose files
code-review --watch --template combined ./src          # Continuous monitoring
code-review --incremental --template security ./       # Only changed files

# CI/CD usage
code-review --ci-mode --output json --template combined ./src
```

### Make Commands (Recommended)

```bash
# Development workflow
make help               # Show all available commands
make status            # Check project health  
make dev-test          # Quick single file test
make dev-json          # Test JSON output

# Testing
make test              # Basic functionality test
make test-all          # Complete test suite
make test-ci           # CI mode tests
make test-json         # JSON output tests
make test-error        # Error handling tests

# CI/CD
make setup-ci          # Prepare CI/CD files
make pr-comment        # Generate PR comment from results
```

## 🛠️ Project Organization

Our codebase is professionally organized for maintainability and CI/CD:

```
code-review-agent/
├── 📁 scripts/                    # All automation scripts  
│   ├── 📁 test/                   # Testing scripts
│   │   ├── ci-mode.sh            # Test CI functionality
│   │   ├── json-output.sh        # Test JSON generation
│   │   ├── error-handling.sh     # Test error handling
│   │   ├── templates.sh          # Test all templates
│   │   └── performance.sh        # Performance benchmarks
│   ├── 📁 ci/                    # CI/CD automation
│   │   ├── setup.sh              # CI setup script
│   │   └── generate-pr-comment.sh # PR comment generator
│   └── test-all.sh               # Master test runner
├── 📁 .github/workflows/         # GitHub Actions (auto-generated)
├── Makefile                      # Easy command interface
├── ORGANIZATION.md               # Project structure guide
└── ...
```

### Benefits of This Organization:
- **✅ Clear Separation**: Testing, CI/CD, and core logic separated
- **✅ Easy Commands**: `make test-all`, `make dev-test`, `make status`
- **✅ CI/CD Ready**: Modular scripts for GitHub Actions
- **✅ Professional**: Industry-standard structure

## ⚙️ Command Reference

### Core Options

| Option | Description | Example |
|--------|-------------|---------|
| `--template <n>` | Review template: `quality`, `security`, `performance`, `typescript`, `combined`, `all` | `--template security` |
| `--auto-fallback` | Smart model selection with automatic fallbacks | `--auto-fallback` |
| `--multi-model` | Enable multi-model selection | `--multi-model` |
| `--model <n>` | Force specific model: `claude-sonnet`, `claude-haiku`, `gemini-pro`, `gemini-flash` | `--model gemini-flash` |

### Output & Format

| Option | Description | Example |
|--------|-------------|---------|
| `--output <format>` | Output format: `terminal`, `markdown`, `json`, `html` | `--output json` |
| `--output-file <path>` | Save results to file | `--output-file report.json` |
| `--interactive`, `-i` | Interactive file selection | `--interactive` |
| `--watch`, `-w` | Watch mode for continuous review | `--watch` |

### CI/CD & Automation

| Option | Description | Example |
|--------|-------------|---------|
| `--ci-mode` | CI-optimized mode (no prompts, proper exit codes) | `--ci-mode` |
| `--yes`, `-y` | Skip confirmation prompts | `--yes` |
| `--allow-dirty` | Allow uncommitted changes | `--allow-dirty` |
| `--status` | Show model status and usage | `--status` |

### Performance

| Option | Description | Example |
|--------|-------------|---------|
| `--incremental` | Only review changed files | `--incremental` |
| `--resume` | Resume interrupted review session | `--resume` |
| `--no-cache` | Disable caching | `--no-cache` |
| `--clear-cache` | Clear review cache | `--clear-cache` |

## 🔥 Auto-Fallback: Smart Model Selection

Never let rate limits or authentication issues stop your workflow:

```bash
# Enable auto-fallback for any template
code-review --auto-fallback --template security ./src
```

**What you see:**
```
🎯 Auto-fallback enabled for security template
📋 Priority chain: claude-sonnet → claude-haiku → gemini-pro → gemini-flash
✅ Available models: gemini-pro → gemini-flash
🎆 Auto-fallback: Will try models until one works
```

### Smart Model Priorities by Template

- **🔒 Security**: Claude Sonnet → Claude Haiku → Gemini Pro → Gemini Flash
- **🔄 Combined**: Claude Sonnet → Gemini Pro → Claude Haiku → Gemini Flash  
- **⚡ Quality/Performance/TypeScript**: Gemini Flash → Claude Haiku → Gemini Pro → Claude Sonnet

### Real-World Benefits

✅ **Rate Limit Resilience**: Automatically switches when models hit limits  
✅ **Cost Optimization**: Uses free models when available  
✅ **Authentication Flexibility**: Works with any combination of API keys  

## 🛡️ Professional Error Handling

No more cryptic stack traces! Every error now shows user-friendly messages with actionable solutions:

### Before (Bad) ❌
```
❌ Error reviewing file: 1 | (function (...args) { super(...args); })
error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low...
[500 lines of technical details]
```

### After (Good) ✅
```
❌ Code Review Failed

🏦 Insufficient API Credits
   Your Anthropic API credit balance is too low.

   💡 Quick fixes:
   • Add credits: https://console.anthropic.com/settings/billing
   • Switch to Claude Code: run `claude setup-token`
   • Use a different API key with available credits
```

### Error Types Handled

- **🏦 Insufficient API Credits** - Links to billing page
- **🔑 Invalid API Keys** - Authentication guidance  
- **🚦 Rate Limits** - Wait time and retry advice
- **🌐 Network Issues** - Connection troubleshooting
- **🤖 Claude Code Problems** - Setup instructions
- **📏 File Too Large** - File splitting suggestions

## 🎯 Review Templates

### Quality Review ⭐
**Best for**: Daily code review, maintainability  
**Focus**: Code organization, naming conventions, duplication detection

### Security Review 🔒  
**Best for**: Production deployments, security audits  
**Focus**: SQL injection, XSS, authentication flaws, data validation

### Performance Review ⚡
**Best for**: Optimization, bundle size reduction  
**Focus**: Bundle size, async patterns, memory usage, algorithm complexity

### TypeScript Review 🔷
**Best for**: Type safety, migration to strict mode  
**Focus**: Type safety improvements, generic usage, strict mode compliance

### Combined Review 🎯 (Recommended)
**Best for**: Comprehensive analysis in single pass  
**Focus**: All review types integrated, 4x faster than running separately

## 🚀 Complete CI/CD Integration

### GitHub Actions Setup

The tool includes a complete GitHub Actions workflow:

1. **One-time setup:**
   ```bash
   make setup-ci                    # Creates .github/workflows and scripts
   ```

2. **Add GitHub Secrets:**
   - `ANTHROPIC_API_KEY` (required)
   - `GEMINI_API_KEY` (optional but recommended)

3. **The workflow automatically:**
   - ✅ Reviews only changed files in PRs
   - ✅ Posts results as formatted PR comments  
   - ✅ Sets build status (pass/fail/warning)
   - ✅ Handles critical vs warning issues appropriately

### CI/CD Exit Codes

- **Exit 0**: No critical issues → Build passes ✅
- **Exit 1**: Critical issues found → Build fails ❌  
- **Warnings**: High-priority issues → Build passes with warnings ⚠️

### Example CI Usage

```bash
# Perfect for GitHub Actions
code-review --ci-mode --template combined --output json --allow-dirty --yes ./src
```

### JSON Output Structure

```json
{
  "metadata": {
    "totalFiles": 5,
    "filesWithIssues": 2,
    "totalTokensUsed": 3847,
    "templates": ["combined"]
  },
  "results": [
    {
      "filePath": "src/api.ts",
      "hasIssues": true,
      "feedback": "🚨 Critical: SQL injection vulnerability...",
      "tokensUsed": { "input": 1200, "output": 800 }
    }
  ]
}
```

## 🧪 Testing & Quality Assurance

Our comprehensive test suite ensures reliability:

```bash
# Run all tests
make test-all

# Individual test categories
make test-ci        # CI mode functionality
make test-json      # JSON output validation  
make test-error     # Error handling
make test-perf      # Performance benchmarks
```

### Test Categories

- **🤖 CI Mode Tests**: Exit codes, non-interactive operation, prompt skipping
- **📄 JSON Output Tests**: Structure validation, non-empty results, token tracking
- **🛡️ Error Handling Tests**: User-friendly messages, actionable solutions
- **🎯 Template Tests**: All templates functional, proper exit codes
- **⚡ Performance Tests**: Speed benchmarks, memory limits, timeout handling

## 📊 Configuration

### Project Configuration (`.codereview.json`)

```json
{
  "maxFileSize": 51200,
  "outputFormat": "terminal", 
  "defaultTemplate": "combined",
  "geminiApiKey": "your-key-here",
  "ignorePatterns": [
    "node_modules/**",
    "dist/**", 
    "**/*.test.{ts,js,tsx,jsx}",
    "**/*.d.ts"
  ],
  "requireCleanGit": true,
  "multiModel": {
    "primaryModel": "claude-sonnet",
    "fallbackModels": ["gemini-flash", "claude-haiku"],
    "comparisonMode": false,
    "timeout": 60000
  }
}
```

## 🔄 Advanced Workflows

### Incremental Development
```bash
# Only review changed files
code-review --incremental --auto-fallback --template combined ./

# Compare with main branch
code-review --incremental --compare-with main --template security ./

# Continuous development workflow  
code-review --watch --auto-fallback --template quality ./src
```

### Large Project Management
```bash
# Start review (can be interrupted)
code-review --template all ./large-project

# Resume later from where you left off
code-review --resume ./large-project

# Interactive file selection for focused reviews
code-review --interactive --auto-fallback --template security ./
```

### Team Workflows
```bash
# Generate reports for team sharing
code-review --template combined --output markdown --output-file team-review.md ./src

# CI-optimized for fast PR feedback
code-review --ci-mode --auto-fallback --template combined --output json ./src
```

## 📈 Model Comparison

| Model | Best For | Speed | Cost | Token Limits |
|-------|----------|-------|------|--------------|
| **Claude Sonnet** | Security, Architecture, Complex analysis | Medium | $3/$15 per 1M tokens | 200K input |
| **Claude Haiku** | Quick feedback, Simple reviews | Fast | $0.25/$1.25 per 1M tokens | 200K input |  
| **Gemini Pro** | Detailed analysis, Large files | Medium | Free tier (limited) | 2M input |
| **Gemini Flash** | Fast reviews, Development workflow | Fast | Free tier (generous) | 1M input |

## 🛠 Development

### Project Structure
```
├── agents/code-review.ts          # Main CLI entry point  
├── src/
│   ├── core/                      # Core review logic
│   ├── templates/                 # Review templates
│   └── utils/                     # Utilities (config, git, error handling)
├── scripts/                       # All automation scripts
└── .github/workflows/            # GitHub Actions integration
```

## 🚀 CI/CD Integration

### GitHub Actions Setup (OAuth Token Method)

**Step 1: Add OAuth Token to Repository Secrets**
1. Go to your repository → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `CLAUDE_CODE_OAUTH_TOKEN`
4. Value: Your Claude Code OAuth token
5. Optional: Add `GEMINI_API_KEY` for fallback support

**Step 2: Use the Provided Workflow**

Our repository includes a complete GitHub Actions workflow at `.github/workflows/code-review.yml`:

```yaml
# Key features of our workflow:
- ✅ OAuth token authentication  
- ✅ Automatic PR comments with review results
- ✅ Incremental reviews (only changed files)
- ✅ Security-focused reviews for sensitive files
- ✅ Proper exit codes for build status
- ✅ JSON artifacts for further processing
```

**Step 3: Workflow Triggers**
- **Pull Requests**: Incremental review of changed files with PR comments
- **Push to Main**: Full security review of entire codebase
- **Manual Dispatch**: Custom template selection via GitHub UI

### CI/CD Authentication Options

| Environment | Recommended Method | Setup Instructions |
|-------------|-------------------|--------------------|
| **GitHub Actions** | OAuth Token | Add `CLAUDE_CODE_OAUTH_TOKEN` to secrets |
| **GitLab CI** | OAuth Token | Add to CI/CD variables |
| **Jenkins** | API Key | Set `ANTHROPIC_API_KEY` environment variable |
| **Azure DevOps** | OAuth Token | Add to pipeline variables |

### Example CI/CD Command

```bash
# Typical CI/CD usage with OAuth token
CLAUDE_CODE_OAUTH_TOKEN=${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }} \
code-review \
  --template combined \
  --incremental \
  --ci-mode \
  --output json \
  --auto-fallback \
  .
```

### CI/CD Benefits

- **🔐 Secure**: OAuth tokens provide secure, stateless authentication
- **⚡ Fast**: Incremental reviews only check changed files
- **📊 Detailed**: JSON output for integration with other tools
- **🎯 Smart**: Auto-fallback between Claude and Gemini models
- **💬 Interactive**: Automatic PR comments with actionable feedback

### Development Commands
```bash
make build                         # Build executable
make dev-test                      # Quick development test
make clean                         # Clean build artifacts  
make status                        # Check project health
```

## 📄 Documentation

- **ORGANIZATION.md** - Project structure and script usage
- **CI_CD_GUIDE.md** - Complete CI/CD setup instructions
- **TEAM_SETUP.md** - Team onboarding and workflows

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`  
3. Make your changes and add tests
4. Run the test suite: `make test-all`
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [Anthropic](https://anthropic.com) for Claude API
- [Google](https://ai.google.dev) for Gemini API
- [Bun](https://bun.sh) for excellent runtime and tooling

---

**🚀 Transform your code quality with AI-powered reviews that actually work in the real world!**

**Key Features:**
✅ Professional error handling  
✅ Complete CI/CD integration  
✅ Auto-fallback model selection  
✅ Comprehensive testing suite  
✅ Easy-to-use make commands  
✅ Industry-standard organization  

**Get started:** `make setup && make test-all` 🎉
