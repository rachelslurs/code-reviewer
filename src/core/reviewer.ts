import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { FileInfo } from './file-scanner.js';
import { TokenTracker } from './token-tracker.js';
import { ReviewTemplate } from '../templates/quality.js';
import { CacheManager } from '../utils/cache-manager.js';
import { ModelStatusChecker } from '../utils/model-status-checker.js';
import { resolveMaxTokens } from '../utils/token-estimator.js';
import {
  anthropicInputSchema,
  normalizeReviewResponse,
  renderStructuredReviewAsText,
  SUBMIT_REVIEW_TOOL_NAME,
  STRUCTURED_OUTPUT_INSTRUCTION,
  type StructuredReview,
} from './review-schema.js';

export interface ReviewResult {
  filePath: string;
  template: string;
  /** Rendered review text. Never empty, so text consumers keep working. */
  feedback: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  timestamp: Date;
  /**
   * null when the review failed and no verdict was reached. Collapsing that into
   * false would report an unreviewed file as clean.
   */
  hasIssues: boolean | null;
  authMethod: 'claude-code' | 'api-key';
  /** null when the transport produced no structured output, or when it failed. */
  review: StructuredReview | null;
  /** Present only on failure. Absent is the success signal, so check truthiness. */
  error?: string;
}

/** Formats a three-state verdict for display. */
export function formatIssueStatus(hasIssues: boolean | null): string {
  if (hasIssues === null) return '⚠️  Review failed';
  return hasIssues ? '🔍 Issues found' : '✅ Clean';
}

export class CodeReviewer {
  private anthropic?: Anthropic;
  private tokenTracker: TokenTracker;
  private useClaudeCode: boolean;
  private cacheManager: CacheManager;
  private statusChecker: ModelStatusChecker;

  constructor(apiKey?: string, forceClaudeCode?: boolean, enableCache: boolean = true) {
    this.tokenTracker = new TokenTracker();
    this.cacheManager = enableCache ? new CacheManager() : null as any;
    this.statusChecker = new ModelStatusChecker();
    
    // Use the forceClaudeCode flag if provided, otherwise check authentication
    this.useClaudeCode = forceClaudeCode || this.checkClaudeCodeAuth();
    
    if (this.useClaudeCode) {
      console.log('✅ Using Claude Code authentication');
    } else if (apiKey) {
      console.log('🔑 Using API key authentication');
      this.anthropic = new Anthropic({ apiKey });
    } else {
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
        authMethod: 'claude-code',
        // The CLI exposes no tool-use surface, so this path is text-only by
        // transport. Absent `error` keeps it a success, not a failure.
        review: null
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
        model: 'claude-sonnet-5',
        max_tokens: resolveMaxTokens('claude-sonnet'),
        system: `${template.systemPrompt}\n\n${STRUCTURED_OUTPUT_INSTRUCTION}`,
        tools: [{
          name: SUBMIT_REVIEW_TOOL_NAME,
          description: 'Submit the structured code review.',
          input_schema: anthropicInputSchema as Anthropic.Tool.InputSchema
        }],
        tool_choice: { type: 'tool', name: SUBMIT_REVIEW_TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const tokensUsed = {
        input: response.usage?.input_tokens || 0,
        output: response.usage?.output_tokens || 0
      };

      // Forced tool use leaves no text block, so feedback is rendered rather than
      // read. Each failure writes a visible message instead of an empty string.
      let review: StructuredReview | null = null;
      let error: string | undefined;
      let feedback: string;

      const toolUse = response.content.find(block => block.type === 'tool_use');

      if (response.stop_reason === 'max_tokens') {
        error = `Response truncated at ${tokensUsed.output} output tokens. Raise CODE_REVIEW_MAX_TOKENS or review a smaller file.`;
        feedback = error;
      } else if (!toolUse || toolUse.type !== 'tool_use') {
        error = `Model returned no ${SUBMIT_REVIEW_TOOL_NAME} tool call.`;
        feedback = error;
      } else {
        review = normalizeReviewResponse(toolUse.input);
        if (review) {
          feedback = renderStructuredReviewAsText(review);
        } else {
          error = `Model returned a ${SUBMIT_REVIEW_TOOL_NAME} payload that does not match the review schema.`;
          feedback = error;
        }
      }

      this.tokenTracker.recordUsage(tokensUsed.input, tokensUsed.output);
      
      // Record usage for status tracking
      this.statusChecker.recordRequest('claude-sonnet', tokensUsed.input + tokensUsed.output);
      
      const hasIssues = this.resolveVerdict(review, error, feedback);

      console.log(
        error
          ? `⚠️  Review failed: ${error}`
          : `✅ Review complete (${tokensUsed.input + tokensUsed.output} tokens)`
      );

      return {
        filePath: file.relativePath,
        template: template.name,
        feedback,
        tokensUsed,
        timestamp: new Date(),
        hasIssues,
        authMethod: 'api-key',
        review,
        ...(error ? { error } : {})
      };

    } catch (error) {
      console.error(`❌ Error reviewing ${file.relativePath}:`, error);
      throw error;
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
      console.log(`💾 [CACHED] ${result.filePath}: ${formatIssueStatus(result.hasIssues)}`);
      
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
          console.error(`Failed to review ${file.relativePath}, skipping...`);
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

  /**
   * Three-way verdict. Keyword matching is only trustworthy on the legacy text
   * path: a failure diagnostic contains 'error', 'problem' and 'missing', all of
   * which are in the list below, so a failed review must never reach it.
   */
  private resolveVerdict(
    review: StructuredReview | null,
    error: string | undefined,
    feedback: string
  ): boolean | null {
    if (error) return null;
    if (review) return review.findings.length > 0;
    return this.detectIssues(feedback);
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
    const status = formatIssueStatus(result.hasIssues);
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
    const filesWithIssues = results.filter(r => r.hasIssues === true).length;
    // Counted separately rather than folded into "clean", which is what a plain
    // truthiness filter would do to a review that never produced a verdict.
    const filesFailed = results.filter(r => r.hasIssues === null).length;
    const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed.input + r.tokensUsed.output, 0);

    console.log(`\n📋 Review Summary:`);
    console.log(`   Files reviewed: ${totalFiles}`);
    console.log(`   Files with issues: ${filesWithIssues}`);
    console.log(`   Files clean: ${totalFiles - filesWithIssues - filesFailed}`);
    if (filesFailed > 0) {
      console.log(`   Files that failed to review: ${filesFailed}`);
    }
    console.log(`   Total tokens used: ${totalTokens.toLocaleString()}`);
    console.log(`   Authentication method: ${this.useClaudeCode ? '✅ Claude Code' : '🔑 API Key'}`);

    this.tokenTracker.printUsageSummary();
  }
}
