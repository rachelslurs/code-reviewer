import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
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
  authMethod: 'claude-code' | 'api-key';
}

export class CodeReviewer {
  private anthropic?: Anthropic;
  private tokenTracker: TokenTracker;
  private useClaudeCode: boolean;

  constructor(apiKey?: string, forceClaudeCode?: boolean) {
    console.log(`🛠️  Debug: CodeReviewer constructor called with apiKey: ${apiKey ? 'provided' : 'undefined'}, forceClaudeCode: ${forceClaudeCode}`);
    
    this.tokenTracker = new TokenTracker();
    
    // Use the forceClaudeCode flag if provided, otherwise check authentication
    this.useClaudeCode = forceClaudeCode || this.checkClaudeCodeAuth();
    console.log(`🛠️  Debug: Claude Code will be used: ${this.useClaudeCode}`);
    
    if (this.useClaudeCode) {
      console.log('✅ Using Claude Code authentication');
    } else if (apiKey) {
      console.log('🔑 Using API key authentication');
      this.anthropic = new Anthropic({ apiKey });
    } else {
      console.log('❌ No authentication method available');
      throw new Error('No authentication method available. Either authenticate with Claude Code or provide an API key.');
    }
  }

  private checkClaudeCodeAuth(): boolean {
    try {
      // Test authentication using a simple model alias that should exist
      const testResult = execSync('echo "auth test" | claude --print --model sonnet', {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 15000
      });
      
      const lowerResult = testResult.toLowerCase();
      const hasAuthError = lowerResult.includes('authentication') ||
                          lowerResult.includes('unauthorized') ||
                          lowerResult.includes('not authenticated') ||
                          lowerResult.includes('setup-token');
      
      // Max tokens error means auth worked
      const hasMaxTokensError = lowerResult.includes('max_tokens');
      
      return !hasAuthError || hasMaxTokensError;
    } catch (error: any) {
      // Check if the error is just max_tokens (which means auth actually works)
      if (error.stdout && error.stdout.toString().toLowerCase().includes('max_tokens')) {
        return true;
      }
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
      writeFileSync(promptPath, fullPrompt);

      // Use Claude Code to get response (no max-tokens since it's not supported)
      const result = execSync(`cat "${promptPath}" | claude --print --model sonnet`, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        stdio: 'pipe',
        timeout: 60000 // 60 second timeout
      });

      // Clean up temp file
      unlinkSync(promptPath);

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
        hasIssues,
        authMethod: 'claude-code'
      };

    } catch (error) {
      console.error(`❌ Error reviewing ${file.relativePath} with Claude Code:`, error);
      throw error;
    }
  }

  private async reviewWithAPI(file: FileInfo, template: ReviewTemplate): Promise<ReviewResult> {
    // Estimate tokens (rough approximation)
    const estimatedTokens = Math.ceil(file.content.length / 4) + 1000;

    // Check rate limits
    const rateLimitCheck = this.tokenTracker.canMakeRequest(estimatedTokens);
    if (!rateLimitCheck.allowed && rateLimitCheck.waitTime) {
      this.tokenTracker.printRateLimit(rateLimitCheck.waitTime, rateLimitCheck.reason!);
      await this.tokenTracker.waitForRateLimit(rateLimitCheck.waitTime);
    }

    const userPrompt = this.buildUserPrompt(file);

    try {
      const response = await this.anthropic!.messages.create({
        model: 'claude-3-sonnet-20241022',
        max_tokens: 4000,
        system: template.systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const feedback = response.content[0]?.type === 'text' 
        ? response.content[0].text 
        : 'No feedback generated';

      const tokensUsed = {
        input: response.usage?.input_tokens || 0,
        output: response.usage?.output_tokens || 0
      };

      this.tokenTracker.recordUsage(tokensUsed.input, tokensUsed.output);
      const hasIssues = this.detectIssues(feedback);

      console.log(`✅ Review complete (${tokensUsed.input + tokensUsed.output} tokens)`);

      return {
        filePath: file.relativePath,
        template: template.name,
        feedback,
        tokensUsed,
        timestamp: new Date(),
        hasIssues,
        authMethod: 'api-key'
      };

    } catch (error) {
      console.error(`❌ Error reviewing ${file.relativePath}:`, error);
      throw error;
    }
  }

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
    console.log(`   Authentication method: ${this.useClaudeCode ? '✅ Claude Code' : '🔑 API Key'}`);

    this.tokenTracker.printUsageSummary();
  }
}
