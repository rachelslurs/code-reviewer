import { ReviewResult } from '../core/reviewer.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

export interface OutputOptions {
  format: 'terminal' | 'markdown' | 'json' | 'html';
  outputFile?: string;
  includeMetadata?: boolean;
}

export class OutputFormatter {
  static async formatResults(
    results: ReviewResult[],
    options: OutputOptions
  ): Promise<string> {
    switch (options.format) {
      case 'markdown':
        return this.formatMarkdown(results, options);
      case 'json':
        return this.formatJSON(results, options);
      case 'html':
        return this.formatHTML(results, options);
      case 'terminal':
      default:
        return this.formatTerminal(results, options);
    }
  }

  static async saveResults(
    results: ReviewResult[],
    options: OutputOptions
  ): Promise<void> {
    const formattedOutput = await this.formatResults(results, options);
    
    if (options.outputFile) {
      writeFileSync(options.outputFile, formattedOutput, 'utf8');
      console.log(`📄 Results saved to: ${options.outputFile}`);
    } else {
      // Default file names based on format
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
      const defaultFile = `code-review-${timestamp}.${this.getFileExtension(options.format)}`;
      writeFileSync(defaultFile, formattedOutput, 'utf8');
      console.log(`📄 Results saved to: ${defaultFile}`);
    }
    
    // Force sync to ensure file is written
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private static formatMarkdown(results: ReviewResult[], options: OutputOptions): string {
    const timestamp = new Date().toISOString();
    const totalFiles = results.length;
    const filesWithIssues = results.filter(r => r.hasIssues).length;
    const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed.input + r.tokensUsed.output, 0);

    let markdown = `# Code Review Report

**Generated:** ${new Date().toLocaleString()}
**Files Reviewed:** ${totalFiles}
**Files with Issues:** ${filesWithIssues}
**Files Clean:** ${totalFiles - filesWithIssues}
**Total Tokens Used:** ${totalTokens.toLocaleString()}

---

`;

    // Group results by template
    const resultsByTemplate = this.groupByTemplate(results);
    
    Object.entries(resultsByTemplate).forEach(([template, templateResults]) => {
      markdown += `## 🎯 ${template.toUpperCase()} Review Results\n\n`;
      
      templateResults.forEach((result, index) => {
        const statusIcon = result.hasIssues ? '🔍' : '✅';
        const tokens = (result.tokensUsed.input + result.tokensUsed.output).toLocaleString();
        
        markdown += `### ${statusIcon} ${result.filePath}\n\n`;
        markdown += `**Status:** ${result.hasIssues ? 'Issues Found' : 'Clean'} | `;
        markdown += `**Tokens:** ${tokens} | `;
        markdown += `**Reviewed:** ${result.timestamp.toLocaleString()}\n\n`;
        
        // Format feedback with proper markdown
        const formattedFeedback = this.formatFeedbackForMarkdown(result.feedback);
        markdown += `${formattedFeedback}\n\n`;
        markdown += `---\n\n`;
      });
    });

    if (options.includeMetadata) {
      markdown += this.addMetadataSection(results);
    }

    return markdown;
  }

  private static formatJSON(results: ReviewResult[], options: OutputOptions): string {
    const reportData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalFiles: results.length,
        filesWithIssues: results.filter(r => r.hasIssues).length,
        totalTokensUsed: results.reduce((sum, r) => sum + r.tokensUsed.input + r.tokensUsed.output, 0),
        templates: [...new Set(results.map(r => r.template))]
      },
      results: results.map(result => ({
        filePath: result.filePath,
        template: result.template,
        hasIssues: result.hasIssues,
        feedback: result.feedback,
        tokensUsed: result.tokensUsed,
        timestamp: result.timestamp.toISOString(),
        authMethod: result.authMethod
      })),
      summary: {
        resultsByTemplate: this.groupByTemplate(results),
        issueDistribution: this.calculateIssueDistribution(results)
      }
    };

    return JSON.stringify(reportData, null, 2);
  }

  private static formatHTML(results: ReviewResult[], options: OutputOptions): string {
    const timestamp = new Date().toLocaleString();
    const totalFiles = results.length;
    const filesWithIssues = results.filter(r => r.hasIssues).length;
    const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed.input + r.tokensUsed.output, 0);

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Review Report - ${timestamp}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; line-height: 1.6; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #f8f9ff; padding: 20px; border-radius: 8px; text-align: center; border-left: 4px solid #667eea; }
        .stat-number { font-size: 2em; font-weight: bold; color: #667eea; }
        .result-item { background: white; border: 1px solid #e1e5e9; border-radius: 8px; margin-bottom: 20px; overflow: hidden; }
        .result-header { background: #f8f9ff; padding: 20px; border-bottom: 1px solid #e1e5e9; }
        .result-body { padding: 20px; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 16px; font-size: 0.8em; font-weight: 500; }
        .status-issues { background: #fff3cd; color: #856404; }
        .status-clean { background: #d1f2eb; color: #155724; }
        .feedback { background: #f8f9fa; padding: 15px; border-radius: 6px; white-space: pre-wrap; font-family: 'Monaco', monospace; font-size: 0.9em; }
        .template-section { margin-bottom: 40px; }
        .template-title { color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 Code Review Report</h1>
        <p>Generated on ${timestamp}</p>
    </div>
    
    <div class="summary">
        <div class="stat-card">
            <div class="stat-number">${totalFiles}</div>
            <div>Files Reviewed</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${filesWithIssues}</div>
            <div>Files with Issues</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${totalFiles - filesWithIssues}</div>
            <div>Clean Files</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${totalTokens.toLocaleString()}</div>
            <div>Tokens Used</div>
        </div>
    </div>
`;

    // Group results by template
    const resultsByTemplate = this.groupByTemplate(results);
    
    Object.entries(resultsByTemplate).forEach(([template, templateResults]) => {
      html += `    <div class="template-section">
        <h2 class="template-title">🎯 ${template.toUpperCase()} Review Results</h2>
`;
      
      templateResults.forEach((result) => {
        const statusClass = result.hasIssues ? 'status-issues' : 'status-clean';
        const statusText = result.hasIssues ? 'Issues Found' : 'Clean';
        const tokens = (result.tokensUsed.input + result.tokensUsed.output).toLocaleString();
        
        html += `        <div class="result-item">
            <div class="result-header">
                <h3>${result.filePath}</h3>
                <span class="status-badge ${statusClass}">${statusText}</span>
                <span style="margin-left: 15px; color: #6c757d;">Tokens: ${tokens}</span>
                <span style="margin-left: 15px; color: #6c757d;">Reviewed: ${result.timestamp.toLocaleString()}</span>
            </div>
            <div class="result-body">
                <div class="feedback">${this.escapeHtml(result.feedback)}</div>
            </div>
        </div>
`;
      });
      
      html += `    </div>
`;
    });

    html += `</body>
</html>`;

    return html;
  }

  private static formatTerminal(results: ReviewResult[], options: OutputOptions): string {
    // This is the existing terminal format - just return formatted text
    let output = '\n' + '='.repeat(80) + '\n';
    output += '📝 REVIEW RESULTS\n';
    output += '='.repeat(80) + '\n';

    results.forEach((result, index) => {
      output += `\n${index + 1}. ${result.filePath}\n`;
      output += `   Template: ${result.template}\n`;
      output += `   Status: ${result.hasIssues ? '🔍 Issues found' : '✅ Clean'}\n`;
      output += `   Tokens: ${(result.tokensUsed.input + result.tokensUsed.output).toLocaleString()}\n`;
      output += '\n' + '-'.repeat(60) + '\n';
      output += result.feedback + '\n';
      output += '-'.repeat(60) + '\n';
    });

    return output;
  }

  private static groupByTemplate(results: ReviewResult[]): Record<string, ReviewResult[]> {
    return results.reduce((acc, result) => {
      if (!acc[result.template]) {
        acc[result.template] = [];
      }
      acc[result.template].push(result);
      return acc;
    }, {} as Record<string, ReviewResult[]>);
  }

  private static calculateIssueDistribution(results: ReviewResult[]) {
    const totalFiles = results.length;
    const filesWithIssues = results.filter(r => r.hasIssues).length;
    
    return {
      totalFiles,
      filesWithIssues,
      filesClean: totalFiles - filesWithIssues,
      issueRate: ((filesWithIssues / totalFiles) * 100).toFixed(1) + '%'
    };
  }

  private static formatFeedbackForMarkdown(feedback: string): string {
    // Convert bullet points and formatting for better markdown display
    return feedback
      .replace(/^- /gm, '* ')  // Convert hyphens to asterisks for markdown
      .replace(/\*\*(.*?)\*\*/g, '**$1**')  // Ensure bold formatting
      .replace(/`([^`]+)`/g, '`$1`');  // Preserve code formatting
  }

  private static escapeHtml(text: string): string {
    const div = { innerHTML: text } as any;
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private static addMetadataSection(results: ReviewResult[]): string {
    return `## 📊 Metadata

**Authentication Methods Used:**
${[...new Set(results.map(r => r.authMethod))].map(method => `- ${method}`).join('\n')}

**Templates Applied:**
${[...new Set(results.map(r => r.template))].map(template => `- ${template}`).join('\n')}

**Token Usage by Template:**
${Object.entries(this.groupByTemplate(results)).map(([template, templateResults]) => {
  const tokens = templateResults.reduce((sum, r) => sum + r.tokensUsed.input + r.tokensUsed.output, 0);
  return `- ${template}: ${tokens.toLocaleString()} tokens`;
}).join('\n')}
`;
  }

  private static getFileExtension(format: string): string {
    switch (format) {
      case 'markdown': return 'md';
      case 'json': return 'json';
      case 'html': return 'html';
      default: return 'txt';
    }
  }
}
