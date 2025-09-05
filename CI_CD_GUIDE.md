# CI/CD Integration Guide

## Overview

The Code Review Agent can be integrated into your CI/CD pipeline to automatically review code changes in pull requests, provide feedback, and optionally block merges based on critical issues.

## GitHub Actions Setup

### 1. Repository Secrets

Add these secrets to your GitHub repository:

**Required:**
- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude access

**Optional (for enhanced features):**
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

### 2. Workflow Configuration

The workflow is automatically configured in `.github/workflows/code-review.yml`. It will:

- Trigger on pull requests for TypeScript/JavaScript files
- Review only changed files for efficiency  
- Generate JSON reports and PR comments
- Set build status based on issue severity
- Upload results as artifacts

### 3. Customization Options

Edit `.github/workflows/code-review.yml` to customize:

```yaml
# Change which files trigger reviews
paths:
  - '**/*.ts'
  - '**/*.tsx'
  - '**/*.py'  # Add Python files
  - '**/*.go'  # Add Go files

# Change review template
--template combined  # comprehensive
--template security  # security-focused
--template performance  # performance-focused

# Adjust failure behavior
# Current: fails on critical issues, warns on high issues
```

## Exit Codes

The tool uses different exit codes for CI integration:

- **Exit 0**: No issues found, or only low/medium severity issues
- **Exit 1**: Critical issues found (fails the build)

### Issue Severity Levels

**Critical Issues** (Build Failing):
- Security vulnerabilities (SQL injection, XSS, etc.)
- Authentication/authorization bypasses
- Data exposure risks
- Command injection vulnerabilities

**High Priority Issues** (Warnings):
- Performance bottlenecks
- Type safety issues
- Missing error handling
- Code quality problems

**Medium/Low Issues** (Informational):
- Code style suggestions
- Minor optimizations
- Documentation improvements

## PR Comments

The workflow automatically posts review results as PR comments:

### Comment Features
- **Summary**: Overview of files reviewed and issues found
- **Critical Issues**: Detailed breakdown of security/blocking issues
- **High Priority**: Performance and quality issues
- **Collapsible sections**: Minor issues hidden by default
- **Metrics**: Token usage and review statistics

### Comment Management
- Comments are updated on each push (not duplicated)
- Uses `comment_tag: code-review-agent` for identification
- Previous comments are automatically updated

## Local Testing

Test the CI behavior locally:

```bash
# Test CI mode (no interactive prompts)
./bin/code-review --template combined --ci-mode --allow-dirty src/

# Test with exit codes
./bin/code-review --template security --ci-mode --allow-dirty test-files/security-issues.ts
echo $?  # Should be 1 if critical issues found

# Generate reports like CI
./bin/code-review --template combined --output json --output-file results.json --ci-mode --yes src/
```

## Workflow Customization

### Review Only Specific Files
```yaml
- name: Run AI Code Review
  run: |
    ./bin/code-review \
      --template security \
      --ci-mode \
      --allow-dirty \
      --yes \
      src/auth/ src/api/
```

### Fail on Different Severity
```bash
# Fail on high priority issues too
HIGH_ISSUES=$(jq '[.results[] | select(.feedback | contains("High"))] | length' results.json)
if [ "$HIGH_ISSUES" -gt 0 ]; then
  echo "❌ Build failed due to high priority issues"
  exit 1
fi
```

### Skip Certain File Types
```yaml
files: |
  **/*.ts
  **/*.tsx
  !**/*.test.ts  # Skip test files
  !**/node_modules/**
```

## Integration with Other Tools

### Combine with ESLint
```yaml
- name: Run ESLint
  run: npm run lint

- name: Run AI Code Review  
  run: ./bin/code-review --template combined --ci-mode --yes
```

### Add to Required Checks
In GitHub repository settings:
1. Go to Settings → Branches
2. Add branch protection rule
3. Require "AI Code Review" check to pass

## Troubleshooting

### Common Issues

**API Rate Limits**:
```yaml
# Add delays between files for high-volume repos
--no-cache  # Disable cache in CI for consistent results
```

**Large Pull Requests**:
```yaml
# Limit files reviewed
if [ $(echo "${{ steps.changed-files.outputs.all_changed_files }}" | wc -w) -gt 20 ]; then
  echo "PR too large for automated review"
  exit 0
fi
```

**Workflow Not Triggering**:
- Check file path patterns in workflow
- Verify secrets are set correctly
- Ensure permissions are granted

### Debug Mode
```bash
# Enable verbose output
./bin/code-review --template combined --ci-mode --verbose --allow-dirty
```

## Best Practices

1. **Start with warnings only** - Don't fail builds initially
2. **Review critical files first** - Focus on security-sensitive code  
3. **Combine with human review** - AI is supplementary, not replacement
4. **Monitor token usage** - Set up billing alerts for API costs
5. **Customize templates** - Adjust for your tech stack and standards

## Cost Optimization

- Use `--no-cache` in CI for consistent results
- Review only changed files (done automatically)
- Use `combined` template instead of `all` for efficiency
- Set file size limits to avoid reviewing generated code

The CI integration transforms your code review process by providing instant feedback on every pull request while maintaining team productivity.
