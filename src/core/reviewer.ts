import { execSync } from 'child_process';
import { FileInfo } from './file-scanner.js';
import { TokenTracker } from './token-tracker.js';
import { ReviewTemplate } from '../templates/quality.js';

export interface ReviewResult {
  filePath: string;
  template: string;
  feedback: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  timestamp: Date;
  hasIssues: boolean;
}

export class CodeReviewer {
  private tokenTracker: TokenTracker;
  private useClaudeCode: boolean;

  constructor(apiKey?: string) {
    this.tokenTracker = new TokenTracker();
    
    // Check if Claude Code is available and authenticated
    this.useClaudeCode = this.checkClaudeCodeAuth();
    
    if (!this.useClaudeCode && !apiKey) {
      throw new Error('No authentication method available. Either provide an API key or authenticate with Claude Code.');
    }
  }

  private checkClaudeCodeAuth(): boolean {
    try {
      const result = execSync('claude auth status', { 
        encoding: 'utf8', 
        stdio: 'pipe' 
      });
      return result.includes('authenticated') || result.includes('logged in');
    } catch (error) {
      return false;
    }
  }

  async reviewFile(
    file: FileInfo, 
    template: ReviewTemplate
  ): Promise<ReviewResult> {
    console.log(`\n🔍 Reviewing ${file.relativePath} with ${template.name} template...`);

    if (this.useClaudeCode) {
      return this.reviewWithClaudeCode(file, template);
    } else {
      // Fallback to direct API (your existing implementation)
      return this.reviewWithAPI(file, template);
    }
  }

  private async reviewWithClaudeCode(
    file: FileInfo,
    template: ReviewTemplate
  ): Promise<ReviewResult> {
    // Create a temporary prompt file
    const promptPath = `/tmp/review-prompt-${Date.now()}.txt`;
    const userPrompt = this.buildUserPrompt(file);
    const fullPrompt = `${template.systemPrompt}\n\n${userPrompt}`;

    try {
      // Write prompt to file
      const fs = await import('fs');
      fs.writeFileSync(promptPath, fullPrompt);

      // Use Claude Code to get response
      const result = execSync(`claude chat --file "${promptPath}" --model claude-3-sonnet-20241022`, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        stdio: 'pipe'
      });

      // Clean up temp file
      fs.unlinkSync(promptPath);

      // Estimate token usage (since Claude Code doesn't return exact counts)
      const estimatedInputTokens = Math.ceil(fullPrompt.length / 4);
      const estimatedOutputTokens = Math.ceil(result.length / 4);

      this.tokenTracker.recordUsage(estimatedInputTokens, estimatedOutputTokens);

      const hasIssues = this.detectIssues(result);

      console.log(`✅ Review complete (estimated ${estimatedInputTokens + estimatedOutputTokens} tokens)`);

      return {
        filePath: file.relativePath,
        template: template.name,
        feedback: result.trim(),
        tokensUsed: {
          input: estimatedInputTokens,
          output: estimatedOutputTokens
        },
        timestamp: new Date(),
        hasIssues
      };

    } catch (error) {
      console.error(`❌ Error reviewing ${file.relativePath} with Claude Code:`, error);
      throw error;
    }
  }

  private async reviewWithAPI(file: FileInfo, template: ReviewTemplate): Promise<ReviewResult> {
    // Your existing Anthropic SDK implementation goes here
    throw new Error('API key method not implemented yet - please authenticate with Claude Code');
  }

  // ... rest of your existing methods stay the same
  async reviewMultipleFiles(
    files: FileInfo[],
    template: ReviewTemplate,
    onProgress?: (current: number, total: number, result: ReviewResult) => void
  ): Promise<ReviewResult[]> {
    const results: ReviewResult[] = [];

    console.log(`\n🚀 Starting review of ${files.length} files with ${template.name} template\n`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        const result = await this.reviewFile(file, template);
        results.push(result);

        if (onProgress) {
          onProgress(i + 1, files.length, result);
        }

        // Brief pause between requests to be respectful
        if (i < files.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`Failed to review ${file.relativePath}, skipping...`);
        // Continue with other files
      }
    }

    return results;
  }

  private buildUserPrompt(file: FileInfo): string {
    return `Please review the following ${file.extension} file:

**File:** \`${file.relativePath}\`
**Size:** ${this.formatBytes(file.size)}

\`\`\`${file.extension.slice(1)}
${file.content}
\`\`\`

Please provide a thorough code review focusing on the areas mentioned in your instructions.`;
  }

  private detectIssues(feedback: string): boolean {
    const issueIndicators = [
      'issue', 'problem', 'error', 'warning', 'concern',
      'should', 'could', 'recommend', 'suggest', 'improve',
      'missing', 'unnecessary', 'inefficient', 'unclear',
      '🚨', '⚠️', '❌', '🔴'
    ];

    const lowerFeedback = feedback.toLowerCase();
    return issueIndicators.some(indicator => lowerFeedback.includes(indicator));
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)}${units[unitIndex]}`;
  }

  getTokenTracker(): TokenTracker {
    return this.tokenTracker;
  }

  printReviewSummary(results: ReviewResult[]): void {
    const totalFiles = results.length;
    const filesWithIssues = results.filter(r => r.hasIssues).length;
    const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed.input + r.tokensUsed.output, 0);

    console.log(`\n📋 Review Summary:`);
    console.log(`   Files reviewed: ${totalFiles}`);
    console.log(`   Files with issues: ${filesWithIssues}`);
    console.log(`   Files clean: ${totalFiles - filesWithIssues}`);
    console.log(`   Total tokens used: ${totalTokens.toLocaleString()}`);
    console.log(`   Authentication: ${this.useClaudeCode ? '✅ Claude Code' : '🔑 Direct API'}`);

    this.tokenTracker.printUsageSummary();
  }
}
