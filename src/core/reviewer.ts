import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { FileInfo } from './file-scanner.js';
import { TokenTracker } from './token-tracker.js';
import { ReviewTemplate } from '../templates/quality.js';
import { CacheManager } from '../utils/cache-manager.js';
import { ModelStatusChecker } from '../utils/model-status-checker.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { AuthManager } from '../utils/auth-manager.js';

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
  authMethod: 'claude-code' | 'api-key' | 'oauth-token';
}

export class CodeReviewer {
  private anthropic?: Anthropic;
  private tokenTracker: TokenTracker;
  private useClaudeCode: boolean;
  private cacheManager: CacheManager;
  private statusChecker: ModelStatusChecker;
  private authMethod: 'claude-code' | 'api-key' | 'oauth-token';

  constructor(apiKey?: string, forceClaudeCode?: boolean, enableCache: boolean = true) {
    this.tokenTracker = new TokenTracker();
    this.cacheManager = enableCache ? new CacheManager() : null as any;
    this.statusChecker = new ModelStatusChecker();
    
    // Check all available authentication methods
    const auth = AuthManager.checkAuthentication();
    
    // Use the forceClaudeCode flag if provided, otherwise use best available
    if (forceClaudeCode && auth.claudeCodeAvailable) {
      this.useClaudeCode = true;
      this.authMethod = 'claude-code';
      console.log('✅ Using Claude Code authentication');
    } else if (auth.preferredMethod === 'claude-code' && auth.claudeCodeAvailable) {
      this.useClaudeCode = true;
      this.authMethod = 'claude-code';
      console.log('✅ Using Claude Code authentication');
    } else if (auth.preferredMethod === 'oauth-token' && auth.oauthTokenAvailable) {
      this.useClaudeCode = false;
      this.authMethod = 'oauth-token';
      console.log('🎫 Using Claude OAuth Token authentication');
      
      // Initialize Anthropic client with OAuth token
      this.anthropic = new Anthropic({
        apiKey: 'dummy', // Required by SDK but not used with OAuth
        defaultHeaders: {
          'Authorization': `Bearer ${process.env.CLAUDE_CODE_OAUTH_TOKEN}`
        }
      });
    } else if ((auth.preferredMethod === 'api-key' && auth.apiKeyAvailable) || apiKey) {
      this.useClaudeCode = false;
      this.authMethod = 'api-key';
      console.log('🔑 Using API key authentication');
      
      const key = apiKey || process.env.ANTHROPIC_API_KEY;
      this.anthropic = new Anthropic({ apiKey: key });
    } else {
      ErrorHandler.handleAuthenticationError({
        operation: 'CodeReviewer initialization'
      });
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
    console.log(`   Template: ${template.description}`);
    console.log(`   File size: ${this.formatBytes(file.size)} (estimated processing time: 30-90 seconds)`);

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
        timeout: 120000 // 2 minutes timeout (was 60 seconds)
      });

      // Clean up temp file
      unlinkSync(promptPath);

      // Estimate token usage (since Claude Code doesn't return exact counts)
      const estimatedInputTokens = Math.ceil(fullPrompt.length / 4);
      const estimatedOutputTokens = Math.ceil(result.length / 4);

      this.tokenTracker.recordUsage(estimatedInputTokens, estimatedOutputTokens);
      
      // Record usage for status tracking
      this.statusChecker.recordRequest('claude-sonnet', estimatedInputTokens + estimatedOutputTokens);

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
        authMethod: this.authMethod
      };

    } catch (error) {
      ErrorHandler.handleClaudeCodeError(error, {
        operation: 'reviewing file with Claude Code',
        filePath: file.relativePath,
        template: template.name,
        authMethod: 'claude-code'
      });
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
      
      // Record usage for status tracking
      this.statusChecker.recordRequest('claude-sonnet', tokensUsed.input + tokensUsed.output);
      
      const hasIssues = this.detectIssues(feedback);

      console.log(`✅ Review complete (${tokensUsed.input + tokensUsed.output} tokens)`);

      return {
        filePath: file.relativePath,
        template: template.name,
        feedback,
        tokensUsed,
        timestamp: new Date(),
        hasIssues,
        authMethod: this.authMethod
      };

    } catch (error) {
      // Check if it's a network error
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        ErrorHandler.handleNetworkError(error, {
          operation: 'API request to Anthropic',
          filePath: file.relativePath,
          template: template.name,
          authMethod: 'api-key'
        });
      }
      
      // Check if it's an Anthropic API error
      if (error.status || error.error) {
        ErrorHandler.handleAnthropicAPIError(error, {
          operation: 'reviewing file with Anthropic API',
          filePath: file.relativePath,
          template: template.name,
          authMethod: 'api-key'
        });
      }
      
      // Generic error fallback
      ErrorHandler.handleGenericError(error, {
        operation: 'reviewing file with API',
        filePath: file.relativePath,
        template: template.name,
        authMethod: 'api-key'
      });
    }
  }

  async reviewMultipleFiles(
    files: FileInfo[],
    template: ReviewTemplate,
    concurrency: number = 3,
    onProgress?: (current: number, total: number, result: ReviewResult) => void
  ): Promise<ReviewResult[]> {
    const results: ReviewResult[] = [];
    
    // Separate cached and uncached files
    const { cachedFiles, uncachedFiles, stats } = this.cacheManager 
      ? this.cacheManager.separateFiles(files, template.name)
      : { cachedFiles: [], uncachedFiles: files, stats: { totalFiles: files.length, cachedFiles: 0, newFiles: files.length, changedFiles: 0, timeSaved: '0s' } };
    
    console.log(`\n🚀 Starting review of ${files.length} files with ${template.name} template (${concurrency} concurrent)\n`);
    
    // Show cache stats
    if (this.cacheManager && files.length > 1) {
      this.cacheManager.printCacheStats(stats);
      console.log();
    }
    
    // Add cached results immediately
    cachedFiles.forEach(({ result }, index) => {
      results.push(result);
      console.log(`💾 [CACHED] ${result.filePath}: ${result.hasIssues ? '🔍 Issues found' : '✅ Clean'}`);
      
      if (onProgress) {
        onProgress(index + 1, files.length, result);
      }
    });
    
    if (cachedFiles.length > 0 && uncachedFiles.length > 0) {
      console.log(`\n🔄 Now reviewing ${uncachedFiles.length} changed/new files...\n`);
    }

    // Process uncached files in parallel batches
    let processedCount = cachedFiles.length;
    for (let i = 0; i < uncachedFiles.length; i += concurrency) {
      const batch = uncachedFiles.slice(i, i + concurrency);
      console.log(`\n📦 Processing batch ${Math.floor(i/concurrency) + 1}: ${batch.map(f => f.relativePath).join(', ')}`);
      
      const batchPromises = batch.map(async (file, batchIndex) => {
        try {
          const result = await this.reviewFile(file, template);
          
          // Cache the result
          if (this.cacheManager) {
            this.cacheManager.cacheResult(file, template.name, result);
          }
          
          // Stream result immediately
          this.streamResult(result, processedCount + batchIndex + 1, files.length);
          
          if (onProgress) {
            onProgress(processedCount + batchIndex + 1, files.length, result);
          }
          
          return result;
        } catch (error) {
          ErrorHandler.handleFileError(error, file.relativePath);
          return null;
        }
      });

      // Wait for entire batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null) as ReviewResult[]);
      processedCount += batchResults.length;
      
      // Brief pause only for API key users and only between batches
      if (i + concurrency < uncachedFiles.length && !this.useClaudeCode) {
        console.log('⏸️  Brief pause between batches...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Save cache to disk
    if (this.cacheManager) {
      this.cacheManager.finalize();
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

  private streamResult(result: ReviewResult, current: number, total: number): void {
    const status = result.hasIssues ? '🔍 Issues found' : '✅ Clean';
    const tokens = (result.tokensUsed.input + result.tokensUsed.output).toLocaleString();
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📝 STREAMING RESULT [${current}/${total}]`);
    console.log(`${'='.repeat(80)}`);
    console.log(`File: ${result.filePath}`);
    console.log(`Template: ${result.template}`);
    console.log(`Status: ${status}`);
    console.log(`Tokens: ${tokens}`);
    console.log(`\n${'-'.repeat(60)}`);
    console.log(result.feedback);
    console.log(`${'-'.repeat(60)}\n`);
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
