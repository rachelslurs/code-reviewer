# Team Configuration Examples

## Enterprise Setup (.codereview.json)
```json
{
  "maxFileSize": 102400,
  "outputFormat": "json",
  "defaultTemplate": "combined",
  "requireCleanGit": false,
  "ignorePatterns": [
    "node_modules/**",
    "dist/**",
    "build/**",
    "coverage/**",
    "*.test.ts",
    "*.spec.ts",
    "__mocks__/**",
    "*.d.ts"
  ]
}
```

## GitHub Repository Settings

Add these repository secrets for production use:
- `ANTHROPIC_API_KEY`: Your production API key with appropriate rate limits

## Branch Protection Rules

Require the "AI Code Review" check:
1. Settings → Branches → Add rule
2. Branch name pattern: `main` or `develop`  
3. ✅ Require status checks to pass
4. ✅ Require branches to be up to date
5. Select: "AI Code Review"

This ensures all code changes get AI review before merging.
