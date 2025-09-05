#!/bin/bash

# 📊 Generate PR Comment from JSON Results
# Converts code review JSON output into markdown for PR comments

set -e

RESULTS_FILE="$1"
OUTPUT_FILE="${2:-pr-comment.md}"

if [ ! -f "$RESULTS_FILE" ]; then
    echo "❌ Results file not found: $RESULTS_FILE"
    exit 1
fi

echo "📝 Generating PR comment from: $RESULTS_FILE"

# Extract basic statistics
TOTAL_FILES=$(jq -r '.metadata.totalFiles' "$RESULTS_FILE")
FILES_WITH_ISSUES=$(jq -r '.metadata.filesWithIssues' "$RESULTS_FILE")
TOTAL_TOKENS=$(jq -r '.metadata.totalTokensUsed' "$RESULTS_FILE")
TEMPLATES=$(jq -r '.metadata.templates | join(", ")' "$RESULTS_FILE")

# Count issue severities by looking for keywords in feedback
CRITICAL_ISSUES=$(jq -r '.results[] | select(.hasIssues == true) | .feedback' "$RESULTS_FILE" | grep -i "critical\|🚨" | wc -l || echo "0")
HIGH_ISSUES=$(jq -r '.results[] | select(.hasIssues == true) | .feedback' "$RESULTS_FILE" | grep -i "high\|⚠️" | wc -l || echo "0")

# Generate markdown comment
cat > "$OUTPUT_FILE" << EOF
## 🤖 Code Review Results

### 📊 Summary
- **Files reviewed:** $TOTAL_FILES
- **Files with issues:** $FILES_WITH_ISSUES
- **Files clean:** $((TOTAL_FILES - FILES_WITH_ISSUES))
- **Templates used:** $TEMPLATES
- **Tokens used:** $(printf "%'d" $TOTAL_TOKENS)

EOF

# Add issue breakdown if there are issues
if [ "$FILES_WITH_ISSUES" -gt 0 ]; then
    cat >> "$OUTPUT_FILE" << EOF
### 🚨 Issues Found

EOF

    # Add critical issues section
    if [ "$CRITICAL_ISSUES" -gt 0 ]; then
        cat >> "$OUTPUT_FILE" << EOF
<details>
<summary>🚨 Critical Issues ($CRITICAL_ISSUES)</summary>

EOF
        # Extract and format critical issues
        jq -r '.results[] | select(.hasIssues == true) | select(.feedback | test("Critical|🚨"; "i")) | "**\(.filePath):**\n\(.feedback | split("\n")[0:3] | join("\n"))\n"' "$RESULTS_FILE" >> "$OUTPUT_FILE"
        
        cat >> "$OUTPUT_FILE" << EOF

</details>

EOF
    fi

    # Add high priority issues section  
    if [ "$HIGH_ISSUES" -gt 0 ]; then
        cat >> "$OUTPUT_FILE" << EOF
<details>
<summary>⚠️ High Priority Issues ($HIGH_ISSUES)</summary>

EOF
        # Extract and format high priority issues
        jq -r '.results[] | select(.hasIssues == true) | select(.feedback | test("High|⚠️"; "i")) | select(.feedback | test("Critical|🚨"; "i") | not) | "**\(.filePath):**\n\(.feedback | split("\n")[0:3] | join("\n"))\n"' "$RESULTS_FILE" >> "$OUTPUT_FILE"
        
        cat >> "$OUTPUT_FILE" << EOF

</details>

EOF
    fi

    # Add other issues section
    cat >> "$OUTPUT_FILE" << EOF
<details>
<summary>📋 All Review Details</summary>

EOF
    # Add detailed results for each file
    jq -r '.results[] | "### \(.filePath)\n**Template:** \(.template)\n**Status:** \(if .hasIssues then "🔍 Issues Found" else "✅ Clean" end)\n**Tokens:** \(.tokensUsed.input + .tokensUsed.output)\n\n\(.feedback)\n\n---\n"' "$RESULTS_FILE" >> "$OUTPUT_FILE"
    
    cat >> "$OUTPUT_FILE" << EOF

</details>
EOF

else
    cat >> "$OUTPUT_FILE" << EOF
### ✅ No Issues Found

All files passed the code review! 🎉

EOF
fi

# Add footer
cat >> "$OUTPUT_FILE" << EOF

---
*Review completed using \`$TEMPLATES\` template(s) • $(printf "%'d" $TOTAL_TOKENS) tokens used*
EOF

echo "✅ PR comment generated: $OUTPUT_FILE"

# Show preview
echo ""
echo "📝 Comment preview:"
echo "===================="
head -20 "$OUTPUT_FILE"
if [ $(wc -l < "$OUTPUT_FILE") -gt 20 ]; then
    echo "... (truncated, see $OUTPUT_FILE for full content)"
fi
