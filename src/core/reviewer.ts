import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';

import { FileInfo } from './file-scanner.js';
import { TokenTracker } from './token-tracker.js';
import { ReviewTemplate } from '../templates/quality.js';
import { CacheManager } from '../utils/cache-manager.js';
import { ModelStatusChecker } from '../utils/model-status-checker.js';
import { resolveMaxTokens } from '../utils/token-estimator.js';
import { reviewViaClaudeCli, probeClaudeCodeAuth, cliModelAlias } from './claude-cli.js';
import { AVAILABLE_MODELS } from './multi-model-provider.js';
import {
  anthropicInputSchema,
  normalizeReviewResponse,
  renderStructuredReviewAsText,
  describeSchemaMismatch,
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

export interface VerdictCounts {
  total: number;
  withIssues: number;
  /** Reviews that never reached a verdict. Excluded from `clean`, not folded in. */
  failed: number;
  clean: number;
}

/**
 * Counts the three verdict states in one place.
 *
 * The same three lines were copy-pasted into six call sites across three files,
 * and four of them had the null case wrong before it was fixed one site at a time.
 * A seventh site now inherits the null handling instead of having to remember it.
 */
export function summarizeVerdicts(
  results: ReadonlyArray<{ hasIssues: boolean | null }>,
): VerdictCounts {
  const total = results.length;
  const withIssues = results.filter(r => r.hasIssues === true).length;
  const failed = results.filter(r => r.hasIssues === null).length;
  return { total, withIssues, failed, clean: total - withIssues - failed };
}

export class CodeReviewer {
  private anthropic?: Anthropic;
  private tokenTracker: TokenTracker;
  private useClaudeCode: boolean;
  private cacheManager: CacheManager;
  private statusChecker: ModelStatusChecker;
  /** Key into AVAILABLE_MODELS. Without this --model never reached the request. */
  private modelKey: string;

  constructor(
    apiKey?: string,
    forceClaudeCode?: boolean,
    enableCache: boolean = true,
    modelKey: string = 'claude-sonnet',
  ) {
    // Nothing validates --model against AVAILABLE_MODELS upstream; only the
    // claude-/gemini- prefix is checked. An unrecognised key used to substitute
    // Sonnet's model id while still asking resolveMaxTokens about the bad key,
    // which missed MODEL_LIMITS and capped every review at 4000 tokens. Resolving
    // once here keeps the id, the token cap and the usage bucket on one key.
    if (AVAILABLE_MODELS[modelKey]) {
      this.modelKey = modelKey;
    } else {
      console.warn(`⚠️  Unknown model '${modelKey}'. Falling back to claude-sonnet.`);
      this.modelKey = 'claude-sonnet';
    }

    this.tokenTracker = new TokenTracker();
    this.cacheManager = enableCache ? new CacheManager() : null as any;
    this.statusChecker = new ModelStatusChecker();
    
    // An explicit false means the caller already decided against the CLI path, so
    // re-probing here would override it. Callers pass the result of their own
    // probe, so the undefined case is the only one that needs to ask.
    this.useClaudeCode = forceClaudeCode ?? this.checkClaudeCodeAuth();
    
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
    return probeClaudeCodeAuth();
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
    const userPrompt = this.buildUserPrompt(file);
    const fullPrompt = `${template.systemPrompt}\n\n${userPrompt}`;

    try {
      // Subscription path: --json-schema reaches the same schema as forced tool
      // use, so this returns structured findings rather than free text.
      // Derived from modelKey rather than hardcoded. Pinning 'sonnet' meant
      // --model claude-haiku ran Sonnet at Sonnet cost while recording that token
      // count against haiku's bucket below, so --status throttled the wrong model.
      const cli = reviewViaClaudeCli(
        `${fullPrompt}\n\n${STRUCTURED_OUTPUT_INSTRUCTION}`,
        cliModelAlias(this.modelKey),
        120000
      );

      // The CLI reports real usage, so these are no longer length/4 guesses.
      const tokensUsed = cli.tokensUsed;
      this.tokenTracker.recordUsage(tokensUsed.input, tokensUsed.output);
      this.statusChecker.recordRequest(this.modelKey, tokensUsed.input + tokensUsed.output);

      if (cli.costUsd > 0) {
        console.log(`   💳 Subscription usage: $${cli.costUsd.toFixed(4)} equivalent`);
      }

      const feedback = cli.review
        ? renderStructuredReviewAsText(cli.review)
        : describeSchemaMismatch(cli.error ?? 'Claude CLI returned no review.', cli.rawPayload);

      console.log(
        cli.review
          ? `✅ Review complete (${tokensUsed.input + tokensUsed.output} tokens)`
          : `⚠️  Review failed: ${cli.error}`
      );

      return {
        filePath: file.relativePath,
        template: template.name,
        feedback,
        tokensUsed,
        timestamp: new Date(),
        hasIssues: this.resolveVerdict(cli.review, cli.error, feedback),
        authMethod: 'claude-code',
        review: cli.review,
        ...(cli.error ? { error: cli.error } : {})
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
        model: AVAILABLE_MODELS[this.modelKey].model,
        max_tokens: resolveMaxTokens(this.modelKey),
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
          feedback = describeSchemaMismatch(error, toolUse.input);
        }
      }

      this.tokenTracker.recordUsage(tokensUsed.input, tokensUsed.output);
      
      // Record usage for status tracking
      this.statusChecker.recordRequest(this.modelKey, tokensUsed.input + tokensUsed.output);
      
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
          
          // Only cache a review that reached a verdict. The cache keys on file
          // content, so storing a failure would replay it on every later run until
          // the file changes or the 7-day prune, turning one transient timeout into
          // a permanently unreviewed file.
          if (this.cacheManager && result.hasIssues !== null) {
            this.cacheManager.cacheResult(file, template.name, result);
          }
          
          // Stream result immediately
          this.streamResult(result, processedCount + batchIndex + 1, files.length);
          
          if (onProgress) {
            onProgress(processedCount + batchIndex + 1, files.length, result);
          }
          
          return result;
        } catch (error) {
          // Returning null here dropped the file from the results array entirely,
          // so the summary counted 8 of 10 with no sign the other 2 were never
          // reviewed. A null verdict keeps it visible everywhere downstream.
          const message = `Error reviewing file: ${error instanceof Error ? error.message : String(error)}`;
          console.error(`❌ ${file.relativePath}: ${message}`);
          const failed: ReviewResult = {
            filePath: file.relativePath,
            template: template.name,
            feedback: message,
            tokensUsed: { input: 0, output: 0 },
            timestamp: new Date(),
            hasIssues: null,
            authMethod: this.useClaudeCode ? 'claude-code' : 'api-key',
            review: null,
            error: message,
          };
          this.streamResult(failed, processedCount + batchIndex + 1, files.length);
          if (onProgress) {
            onProgress(processedCount + batchIndex + 1, files.length, failed);
          }
          return failed;
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
    const verdicts = summarizeVerdicts(results);
    const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed.input + r.tokensUsed.output, 0);

    console.log(`\n📋 Review Summary:`);
    console.log(`   Files reviewed: ${verdicts.total}`);
    console.log(`   Files with issues: ${verdicts.withIssues}`);
    console.log(`   Files clean: ${verdicts.clean}`);
    if (verdicts.failed > 0) {
      console.log(`   Files that failed to review: ${verdicts.failed}`);
    }
    console.log(`   Total tokens used: ${totalTokens.toLocaleString()}`);
    console.log(`   Authentication method: ${this.useClaudeCode ? '✅ Claude Code' : '🔑 API Key'}`);

    this.tokenTracker.printUsageSummary();
  }
}
