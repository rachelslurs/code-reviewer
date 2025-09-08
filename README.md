# Code Reviewer

An AI-powered code review CLI tool that provides intelligent, multi-model code analysis with advanced features like caching, multi-model support, and CI/CD integration.

## ✨ Features

### 🤖 **Multi-Model AI Support**
- **Smart Model Selection**: Automatically chooses the best AI model for each review type
- **Claude Integration**: Supports both Claude Code (subscription) and API key authentication
- **Gemini Integration**: Google's Gemini models for enhanced code analysis
- **Intelligent Fallbacks**: Automatically switches models if one fails or hits rate limits
- **Token Estimation**: Pre-calculates token usage and costs before API calls

### 🎯 **Comprehensive Review Templates**
- **Quality**: Code organization, naming, duplication, complexity, error handling
- **Security**: Vulnerabilities, data validation, injection attacks, authentication issues
- **Performance**: Bundle size optimization, async patterns, memory usage
- **TypeScript**: Type safety, strict mode compliance, generic usage
- **Combined**: Single comprehensive review combining all aspects (4x faster than running all templates)

### ⚡ **Performance & Efficiency**
- **Smart Caching**: Only reviews changed files, massive speedup for large codebases
- **Parallel Processing**: Reviews multiple files simultaneously with configurable concurrency
- **Incremental Reviews**: Only review files changed since last commit/branch
- **Resume Functionality**: Continue interrupted reviews from where you left off
- **Rate Limit Handling**: Intelligent API rate limit management and fallbacks

### 🛠 **Developer Experience**
- **Interactive Mode**: Choose specific files to review with visual selection
- **Watch Mode**: Continuously monitor files for changes and auto-review
- **Auto-Fallback**: Intelligent model selection with automatic fallbacks when models are unavailable
- **Multiple Output Formats**: Terminal, Markdown, JSON, and HTML reports
- **Progress Streaming**: Real-time results as each file completes
- **Model Status Monitoring**: Real-time tracking of API usage, rate limits, and costs
- **CI/CD Integration**: GitHub Actions workflow with PR comments

### 🔧 **Advanced Features**
- **Git Integration**: Smart git status checking and branch-aware reviews
- **Session Management**: Save and resume long review sessions
- **Custom Configuration**: Project-specific settings and ignore patterns
- **Token Tracking**: Detailed usage analytics and cost estimation

## 🚀 Installation & Setup

### Prerequisites
- [Bun](https://bun.sh) installed
- **For Claude**: Claude Code CLI (recommended) OR Anthropic API key
- **For Gemini**: Google AI Studio API key (optional but recommended)

### Quick Start

1. **Clone and install:**
   ```bash
   git clone <your-repo-url>
   cd code-reviewer
   bun install && bun run build
   ```

2. **Set up authentication:**
   
   **Claude Code (Recommended - uses your subscription):**
   ```bash
   claude setup-token
   ```
   
   **API Keys:**
   ```bash
   export ANTHROPIC_API_KEY="your-claude-key"
   export GEMINI_API_KEY="your-gemini-key"  # Optional but recommended
   ```

3. **Test the installation:**
   ```bash
   ./bin/code-review --help
   ```

4. **Optional - Add to PATH:**
   ```bash
   echo 'export PATH="$PATH:'$(pwd)'/bin"' >> ~/.zshrc
   source ~/.zshrc
   ```

## 📖 Usage Guide

### Basic Commands

```bash
# Quick quality review
code-review ./src

# Comprehensive multi-model review  
code-review --multi-model --template combined ./src

# Security-focused review
code-review --template security --allow-dirty ./

# Interactive file selection
code-review --interactive --template quality ./src

# Watch mode for continuous development
code-review --watch --template combined ./src

# Auto-fallback: Smart model selection with automatic fallbacks
code-review --auto-fallback --template security ./src

# Check model status and rate limits
code-review --status

# Note: Status shows usage from this tool only, not account-wide
# Check provider dashboards for complete usage data
```

### Multi-Model Usage

```bash
# Smart model selection (automatic)
code-review --multi-model --template quality ./src

# Compare multiple models on same code
code-review --compare-models --template security file.ts

# Force specific model
code-review --multi-model --model gemini-flash ./src

# CI/CD optimized mode
code-review --multi-model --ci-mode --template combined ./src
```

### Advanced Workflows

```bash
# Incremental review (only changed files)
code-review --incremental --template combined ./

# Compare with specific branch
code-review --incremental --compare-with main --template security ./

# Resume interrupted review
code-review --resume ./src

# Generate reports
code-review --template combined --output markdown --output-file report.md ./src
```

## ⚙️ Command Reference

### Core Options

| Option | Description | Example |
|--------|-------------|---------|
| `--template <name>` | Review template: `quality`, `security`, `performance`, `typescript`, `combined`, `all` | `--template security` |
| `--multi-model` | Enable smart multi-model selection | `--multi-model` |
| `--compare-models` | Compare results from multiple AI models | `--compare-models` |
| `--model <name>` | Force specific model: `claude-sonnet`, `claude-haiku`, `gemini-pro`, `gemini-flash` | `--model gemini-flash` |
| `--auto-fallback` | Smart model selection with automatic fallbacks when models unavailable | `--auto-fallback` |

### Output & Format

| Option | Description | Example |
|--------|-------------|---------|
| `--output <format>` | Output format: `terminal`, `markdown`, `json`, `html` | `--output markdown` |
| `--output-file <path>` | Save results to file | `--output-file report.md` |
| `--interactive`, `-i` | Interactive file selection | `--interactive` |
| `--watch`, `-w` | Watch mode for continuous review | `--watch` |

### Performance & Efficiency

| Option | Description | Example |
|--------|-------------|---------|
| `--incremental` | Only review changed files | `--incremental` |
| `--compare-with <ref>` | Compare with branch/commit | `--compare-with main` |
| `--resume` | Resume interrupted review session | `--resume` |
| `--no-cache` | Disable caching | `--no-cache` |
| `--clear-cache` | Clear review cache | `--clear-cache` |

### CI/CD & Automation

| Option | Description | Example |
|--------|-------------|---------|
| `--ci-mode` | CI-optimized mode (no prompts, exit codes) | `--ci-mode` |
| `--yes`, `-y` | Skip confirmation prompts | `--yes` |
| `--allow-dirty` | Allow uncommitted changes | `--allow-dirty` |
| `--status` | Show model status and rate limits | `--status` |

## 📊 Model Status Monitoring

Track your API usage, rate limits, and costs across all AI models in real-time.

### Status Command

```bash
# Check current model status
code-review --status
```

**Example Output:**
```
🤖 AI Model Status Report
================================================================================
📅 Generated: 9/4/2025, 2:45:30 PM

⚠️  IMPORTANT: This shows usage from this tool only, not account-wide usage
📊 Check provider dashboards for complete usage across all applications

🔹 Claude Models (Anthropic)
----------------------------------------
✅ Claude 3.5 Sonnet
   Status: Ready for use
   Usage: 2/5 requests/min, 1,234/40,000 tokens/min
   Daily: 45/1000 requests
   Cost: $3/$15 per 1K tokens

⏰ Claude 3.5 Haiku
   Status: Rate limited
   Usage: 5/5 requests/min, 45,000/50,000 tokens/min
   Next available: 23s
   Cost: $0.25/$1.25 per 1K tokens

🔸 Gemini Models (Google)
----------------------------------------
✅ Gemini 1.5 Flash
   Status: Ready for use
   Usage: 3/15 requests/min, 12,450/1,000,000 tokens/min
   Daily: 234/1500 requests
   Cost: Free

📊 Summary:
   ✅ Available: 2 models
   ⏰ Rate Limited: 1 models
   ❌ Unavailable: 0 models

🔗 Provider Usage Dashboards:
   📊 Anthropic (Claude): https://console.anthropic.com/settings/usage
   📊 Google (Gemini): https://aistudio.google.com/app/apikey
   📊 Claude Code: No usage dashboard (subscription-based)

💡 Recommendations:
   💡 Use free models: Gemini 1.5 Flash
   ⏰ Rate limits reset in 23s
   📊 Note: Rate limits may be lower due to external API usage
================================================================================
```

### Status Indicators

- **✅ Available**: Model is ready for requests
- **⏰ Rate Limited**: Model has hit rate limits, shows cooldown time
- **❌ Unavailable**: Model is not accessible (missing API key)

### Usage Tracking

The status checker automatically tracks:
- **Requests per minute/day**: Current usage vs limits
- **Token consumption**: Input/output tokens used vs limits  
- **Cost tracking**: Real-time cost estimates for paid models
- **Rate limit cooldowns**: Time until limits reset
- **Model recommendations**: Suggests best available models

⚠️  **Important Limitation**: This tool only tracks usage from the `code-review` command itself, not your entire account usage across all applications.

### What It Tracks ✅
- API calls made by this code review tool
- Tokens used during reviews in this tool  
- Rate limits based on this tool's usage patterns
- Cost estimates for work done in this tool

### What It Doesn't Track ❌
- Usage from claude.ai web interface
- Usage from other applications using your API keys
- Usage from Claude Code in other contexts
- Gemini usage in Google AI Studio or other apps
- Server-side rate limit state from providers

### Complete Usage Data

For account-wide usage across all applications:
- **Claude**: [Anthropic Console Usage Dashboard](https://console.anthropic.com/settings/usage)
- **Gemini**: [Google AI Studio API Usage](https://aistudio.google.com/app/apikey)  
- **Claude Code**: No usage dashboard (subscription-based)

⚠️  **Real-world Impact**: If you're using Claude/Gemini heavily elsewhere, you might see "Available" in our status but still hit rate limits when making calls. Always check provider dashboards for complete usage data.

### Integration with Reviews

Usage is automatically tracked during reviews:
- Each API call records tokens used
- Rate limit status updates in real-time
- Smart model fallbacks when limits hit
- Cost accumulation across sessions

## 🎆 Auto-Fallback Model Selection

Intelligent model selection that automatically tries the best model for your task and gracefully falls back when models are unavailable due to rate limits or authentication issues.

### How It Works

```bash
# Enable auto-fallback for any template
code-review --auto-fallback --template security ./src
```

**Example Output:**
```
🎯 Auto-fallback enabled for security template
📋 Priority chain: claude-sonnet → claude-haiku → gemini-pro → gemini-flash
✅ Available models: gemini-pro → gemini-flash
🎆 Auto-fallback: Will try models until one works
🚀 Initializing auto-fallback reviewer with 2 models
```

### Smart Model Priorities by Template

Each review template has an optimized model priority chain:

**🔒 Security Reviews**
- Priority: Claude Sonnet → Claude Haiku → Gemini Pro → Gemini Flash
- Why: Claude excels at vulnerability detection and security analysis

**🔄 Combined Reviews** 
- Priority: Claude Sonnet → Gemini Pro → Claude Haiku → Gemini Flash
- Why: Comprehensive analysis benefits from Claude's depth, Gemini's speed

**⚡ Quality/Performance/TypeScript Reviews**
- Priority: Gemini Flash → Claude Haiku → Gemini Pro → Claude Sonnet
- Why: Fast feedback loops, Gemini excels at code quality and optimization

### Real-World Benefits

**🛡 Rate Limit Resilience**
```bash
# When Claude hits 5-hour limit, automatically uses Gemini
code-review --auto-fallback --template quality ./src
# ✅ Continues working seamlessly
```

**💰 Cost Optimization**
```bash
# Uses free Gemini models when available, falls back to paid Claude
code-review --auto-fallback --watch --template typescript ./src
# ✅ Maximizes free tier usage
```

**🔧 Authentication Flexibility**
```bash
# Works with any combination of API keys
code-review --auto-fallback --template combined ./src
# ✅ Uses whatever authentication you have available
```

### Advanced Usage

```bash
# Auto-fallback + Interactive selection
code-review --auto-fallback --interactive --template security ./src

# Auto-fallback + Watch mode for continuous development
code-review --auto-fallback --watch --template quality ./src

# Auto-fallback + Incremental reviews
code-review --auto-fallback --incremental --template combined ./src
```

### vs Manual Model Selection

| Approach | Rate Limit Handling | Cost Optimization | Setup Complexity |
|----------|-------------------|------------------|------------------|
| `--model claude-sonnet` | ❌ Fails when rate limited | ❌ Always uses paid model | ✅ Simple |
| `--model gemini-flash` | ❌ Fails if no Gemini key | ✅ Always free | ✅ Simple |
| `--auto-fallback` | ✅ Graceful fallback | ✅ Smart cost optimization | ✅ Automatic |

**Recommendation**: Use `--auto-fallback` as your default for the best experience.

## 🎯 Review Templates

### Quality Review
**Best for**: Daily code review, maintainability
**Model**: Gemini Flash (fast, detailed)
```bash
code-review --template quality ./src
```
- Code organization and structure
- Naming conventions and clarity
- Code duplication detection
- Complexity analysis
- Error handling patterns

### Security Review  
**Best for**: Production deployments, security audits
**Model**: Claude Sonnet (excellent vulnerability detection)
```bash
code-review --template security ./src
```
- SQL injection vulnerabilities
- XSS and input validation
- Authentication/authorization flaws
- Information disclosure risks
- Command injection detection

### Performance Review
**Best for**: Optimization, bundle size reduction
**Model**: Gemini Flash (great optimization suggestions)  
```bash
code-review --template performance ./src
```
- Bundle size optimization
- Async operation efficiency
- Memory usage patterns
- Algorithm complexity analysis
- React rendering optimization

### TypeScript Review
**Best for**: Type safety, migration to strict mode
**Model**: Gemini Flash (fast type checking)
```bash
code-review --template typescript ./src
```
- Type safety improvements
- Generic usage optimization
- Interface vs type decisions
- Strict mode compliance
- Type assertion safety

### Combined Review (⭐ Recommended)
**Best for**: Comprehensive analysis in single pass
**Model**: Claude Sonnet (best overall analysis)
```bash
code-review --template combined ./src
```
- All review types in one API call
- 4x faster than running all templates separately
- Integrated analysis across dimensions
- Priority-based issue ranking

## 🔧 Configuration

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
    "templateMappings": {
      "security": "claude-sonnet",
      "quality": "gemini-flash",
      "performance": "gemini-flash", 
      "typescript": "gemini-flash",
      "combined": "claude-sonnet"
    },
    "comparisonMode": false,
    "timeout": 60000
  }
}
```

### Model Comparison

| Model | Best For | Speed | Cost | Token Limits |
|-------|----------|-------|------|--------------|
| **Claude Sonnet** | Security, Architecture, Complex analysis | Medium | $3/$15 per 1M tokens | 200K input |
| **Claude Haiku** | Quick feedback, Simple reviews | Fast | $0.25/$1.25 per 1M tokens | 200K input |  
| **Gemini Pro** | Detailed analysis, Large files | Medium | Free tier (limited) | 2M input |
| **Gemini Flash** | Fast reviews, Development workflow | Fast | Free tier (generous) | 1M input |

## 🔄 CI/CD Integration

### GitHub Actions Setup

The tool includes a complete GitHub Actions workflow for automated PR reviews:

1. **Add repository secrets:**
   - `ANTHROPIC_API_KEY` (required)
   - `GEMINI_API_KEY` (optional but recommended)

2. **The workflow automatically:**
   - Reviews only changed files in PRs
   - Posts results as PR comments
   - Sets build status (pass/fail/warning)
   - Generates downloadable reports

3. **Example CI usage:**
   ```bash
   code-review --ci-mode --template combined --output json --allow-dirty --yes ./src
   ```

4. **Exit codes:**
   - `0`: No critical issues (build passes)
   - `1`: Critical issues found (build fails)

See `CI_CD_GUIDE.md` for complete setup instructions.

## 🧠 Smart Features

### Token Estimation & Cost Control

Before each review, the tool estimates:
- Input/output token requirements
- API costs for paid models  
- Model compatibility and limits
- Optimal model selection

```
📊 Token Estimate for gemini-flash:
   Input tokens: 1,200
   Output tokens: ~800
   Total tokens: ~2,000
   Complexity: medium
   Cost: Free tier
   ✅ Fits within model limits
   🎯 Recommended: gemini-flash (better fit)
```

### Incremental Reviews

Only review what changed:
```bash
# Review files changed since last commit
code-review --incremental ./

# Compare with main branch  
code-review --incremental --compare-with main ./

# Include untracked files
code-review --incremental --include-untracked ./
```

### Session Management

For large codebases:
```bash
# Start review (can be interrupted)
code-review --template all ./large-project

# Resume later
code-review --resume ./large-project
```

### Interactive Development

```bash
# Choose specific files
code-review --interactive ./src

# Continuous development workflow
code-review --watch --template combined ./src
```

## 📊 Output Formats

### Terminal (Default)
Real-time streaming results with progress bars and colored output.

### Markdown Reports
```bash
code-review --output markdown --output-file review.md ./src
```
Perfect for sharing with team, GitHub issues, or documentation.

### JSON Data
```bash  
code-review --output json --output-file results.json ./src
```
Structured data for CI/CD pipelines and programmatic processing.

### HTML Reports
```bash
code-review --output html --output-file report.html ./src  
```
Professional reports with styling, charts, and interactive elements.

## 🛠 Development

### Project Structure
```
├── agents/
│   └── code-review.ts          # Main CLI entry point
├── src/
│   ├── core/
│   │   ├── file-scanner.ts     # File discovery and filtering
│   │   ├── reviewer.ts         # Single-model reviewer
│   │   ├── multi-model-reviewer.ts  # Multi-model orchestration
│   │   └── multi-model-provider.ts  # Model abstraction layer
│   ├── templates/
│   │   ├── quality.ts          # Code quality template
│   │   ├── security.ts         # Security analysis template
│   │   ├── performance.ts      # Performance optimization template
│   │   ├── typescript.ts       # TypeScript-specific template
│   │   └── combined.ts         # Comprehensive template
│   └── utils/
│       ├── config.ts           # Configuration management
│       ├── git.ts              # Git integration utilities
│       ├── token-estimator.ts  # Smart token estimation
│       ├── cache-manager.ts    # Review caching system
│       ├── session-manager.ts  # Resume functionality
│       ├── output-formatter.ts # Multi-format output
│       └── file-watcher.ts     # Watch mode implementation
└── .github/
    └── workflows/
        └── code-review.yml     # GitHub Actions integration
```

### Scripts
```bash
# Development
bun run dev                     # Run in development mode
bun run build                   # Build executable
bun install                     # Install dependencies

# Testing  
bun run build && ./bin/code-review --help
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests if applicable  
5. Submit a pull request

### Adding New Features
- **New Templates**: Add to `src/templates/` and update CLI validation
- **New Models**: Add to `AVAILABLE_MODELS` in `multi-model-provider.ts`
- **New Output Formats**: Extend `OutputFormatter` class

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [Anthropic](https://anthropic.com) for Claude API
- [Google](https://ai.google.dev) for Gemini API  
- [Bun](https://bun.sh) for the excellent runtime and tooling

---

**Get started today and transform your code quality with AI-powered reviews!** 🚀
