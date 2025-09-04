# Code Review Agent

An AI-powered code review CLI tool that uses Claude to analyze your code for quality, security, performance, and TypeScript issues.

## Features

- 🤖 **AI-Powered Reviews**: Uses Claude for intelligent code analysis
- 🔐 **Claude Code Integration**: Prioritizes your Claude Code subscription authentication
- 🎯 **Multiple Templates**: Quality, security, performance, and TypeScript-focused reviews
- 📂 **Smart File Filtering**: Automatically skips non-reviewable files and common ignore patterns
- ⚡ **Rate Limiting**: Built-in token tracking and rate limit handling
- 🌿 **Git Integration**: Requires clean working directory before reviews
- 📊 **Progress Tracking**: Real-time review progress and token usage
- ⚙️ **Configurable**: Interactive setup wizard and configuration file support

## Installation & Setup

### Prerequisites
- [Bun](https://bun.sh) installed
- Claude Code CLI installed (recommended) OR Anthropic API key

### For others to use your tool:

1. **Clone and install:**
   ```bash
   git clone <your-repo-url>
   cd code-review-agent
   bun install
   ```

2. **Authenticate (choose one):**
   
   **Option A - Claude Code (Recommended):**
   ```bash
   claude setup-token
   # Follow the prompts to authenticate with your subscription
   ```
   
   **Option B - API Key:**
   ```bash
   # Set environment variable
   export ANTHROPIC_API_KEY="your-key-here"
   
   # OR use interactive setup
   bun run agents/code-review.ts --setup
   ```

3. **Build the executable:**
   ```bash
   bun run build
   ```

4. **Use the tool:**
   ```bash
   # Review a single file
   bin/code-review path/to/file.ts
   
   # Review a directory
   bin/code-review ./src
   
   # Check configuration
   bin/code-review --config
   ```

5. **Optional - Add to PATH:**
   ```bash
   # Add to your shell profile (~/.zshrc, ~/.bashrc, etc.)
   export PATH="$PATH:/path/to/code-review-agent/bin"
   
   # Then use globally:
   code-review ./src
   ```

## Usage

### Basic Commands

```bash
# Review current directory
code-review

# Review specific path
code-review ./src/components

# Review single file
code-review component.tsx

# Use specific template
code-review --template security ./src

# Skip confirmation prompt
code-review --yes ./src

# Show help
code-review --help

# Check configuration
code-review --config

# Interactive setup
code-review --setup
```

### Review Templates

- **`quality`** (default): Code organization, naming, duplication, complexity, error handling
- **`security`**: Security vulnerabilities, data validation, authentication issues *(coming soon)*
- **`performance`**: Bundle size, optimization, async patterns *(coming soon)*
- **`typescript`**: Type safety, strict mode compliance, error fixes *(coming soon)*
- **`all`**: Run all templates sequentially *(coming soon)*

## Configuration

Configuration is stored in `.codereview.json` in your project root:

```json
{
  "maxFileSize": 51200,
  "outputFormat": "terminal",
  "defaultTemplate": "quality",
  "ignorePatterns": [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    "**/*.{png,jpg,jpeg,gif,svg,ico}"
  ],
  "requireCleanGit": true
}
```

## Development

### Scripts

```bash
# Run in development mode
bun run dev

# Build executable
bun run build

# Build and show install instructions
bun run install-global
```

### Adding New Review Templates

1. Create a new template in `src/templates/`
2. Export it from the main CLI
3. Update the help text and validation

### Architecture

- `agents/code-review.ts` - Main CLI entry point
- `src/core/` - Core functionality (file scanning, reviewing, token tracking)
- `src/templates/` - Review templates with prompts
- `src/utils/` - Configuration and Git utilities

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request
