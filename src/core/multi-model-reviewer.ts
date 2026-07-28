import { FileInfo } from './file-scanner.js';
import { ReviewTemplate } from '../templates/quality.js';
import { MultiModelProvider, ModelConfig, ModelResponse, ReviewRequest } from './multi-model-provider.js';
import { TokenTracker } from './token-tracker.js';
import { ModelStatusChecker } from '../utils/model-status-checker.js';
import type { StructuredReview } from './review-schema.js';
import { formatIssueStatus, summarizeVerdicts } from './reviewer.js';

export interface MultiModelReviewResult {
  filePath: string;
  template: string;
  /**
   * null when the review failed and no verdict was reached. Collapsing that into
   * false would report an unreviewed file as clean.
   */
  hasIssues: boolean | null;
  /** Rendered review text. Never empty, so text consumers keep working. */
  feedback: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  timestamp: Date;
  authMethod: string;
  modelUsed: string;
  responseTime: number;
  comparisonResults?: ModelResponse[]; // If comparison mode enabled
  /** null when the transport produced no structured output, or when it failed. */
  review: StructuredReview | null;
  /** Present only on failure. Absent is the success signal, so check truthiness. */
  error?: string;
}

export class MultiModelReviewer {
  private provider: MultiModelProvider;
  private tokenTracker: TokenTracker;
  private config: ModelConfig;
  private statusChecker: ModelStatusChecker;

  constructor(
    apiKeys: { anthropic?: string; gemini?: string },
    useClaudeCode: boolean = false,
    config: ModelConfig
  ) {
    this.config = config;
    this.provider = new MultiModelProvider(config, apiKeys, useClaudeCode);
    this.tokenTracker = new TokenTracker();
    this.statusChecker = new ModelStatusChecker();

    console.log('🤖 Multi-Model AI Code Reviewer initialized');
    
    const available = this.provider.getAvailableModels();
    console.log(`📱 Available models: ${available.map(m => this.provider.getModelInfo(m)?.name || m).join(', ')}`);
    
    if (config.comparisonMode) {
      console.log('🔬 Comparison mode enabled - will use multiple models');
    } else {
      console.log(`🎯 Smart model selection enabled - using optimal model per template`);
    }
  }

  /**
   * Review a single file with optimal model selection
   */
  async reviewFile(file: FileInfo, template: ReviewTemplate): Promise<MultiModelReviewResult> {
    console.log(`\n🔍 Reviewing: ${file.relativePath}`);
    
    const request: ReviewRequest = {
      code: file.content,
      filename: file.relativePath,
      systemPrompt: template.systemPrompt,
      template: template.name
    };

    try {
      if (this.config.comparisonMode) {
        return await this.reviewWithComparison(request, template);
      } else {
        return await this.reviewWithOptimalModel(request, template);
      }
    } catch (error) {
      console.error(`❌ Failed to review ${file.relativePath}:`, error);
      
      // A file that threw was not reviewed. Reporting hasIssues: false here would
      // have called it clean, which is the failure this whole path guards against.
      const message = `Error reviewing file: ${error instanceof Error ? error.message : String(error)}`;
      return {
        filePath: file.relativePath,
        template: template.name,
        hasIssues: null,
        feedback: message,
        tokensUsed: { input: 0, output: 0 },
        timestamp: new Date(),
        authMethod: 'multi-model',
        modelUsed: 'error',
        responseTime: 0,
        review: null,
        error: message
      };
    }
  }

  /**
   * Review with optimal model selection
   */
  private async reviewWithOptimalModel(request: ReviewRequest, template: ReviewTemplate): Promise<MultiModelReviewResult> {
    const modelResult = await this.provider.reviewCode(request);
    
    // Track tokens
    this.tokenTracker.addTokens(
      modelResult.tokensUsed.input,
      modelResult.tokensUsed.output,
      modelResult.provider
    );
    
    // Record usage for status tracking
    const modelKey = this.getModelKey(modelResult.model);
    this.statusChecker.recordRequest(modelKey, modelResult.tokensUsed.input + modelResult.tokensUsed.output);

    const hasIssues = this.resolveVerdict(modelResult.review, modelResult.error, modelResult.content);

    console.log(
      modelResult.error
        ? `⚠️  ${request.filename}: ${modelResult.error}`
        : `✅ ${request.filename} reviewed by ${this.provider.getModelInfo(this.getModelKey(modelResult.model))?.name} (${modelResult.responseTime}ms)`
    );

    return {
      filePath: request.filename,
      template: template.name,
      hasIssues,
      feedback: modelResult.content,
      tokensUsed: modelResult.tokensUsed,
      timestamp: new Date(),
      authMethod: 'multi-model',
      modelUsed: modelResult.model,
      responseTime: modelResult.responseTime,
      review: modelResult.review,
      ...(modelResult.error ? { error: modelResult.error } : {})
    };
  }

  /**
   * Review with multiple models for comparison
   */
  private async reviewWithComparison(request: ReviewRequest, template: ReviewTemplate): Promise<MultiModelReviewResult> {
    const results = await this.provider.compareModels(request); // Let it auto-select available models
    
    if (results.length === 0) {
      throw new Error('All available models failed in comparison mode');
    }
    
    // Track tokens for all models
    results.forEach(result => {
      this.tokenTracker.addTokens(
        result.tokensUsed.input,
        result.tokensUsed.output,
        result.provider
      );
      
      // Record usage for status tracking
      const modelKey = this.getModelKey(result.model);
      this.statusChecker.recordRequest(modelKey, result.tokensUsed.input + result.tokensUsed.output);
    });

    // Prefer a model that actually produced a review. compareModels only drops
    // models that throw, so results[0] can carry an error while later entries hold
    // valid reviews; promoting it unconditionally would discard them and mark the
    // whole file failed.
    const primaryResult = results.find(r => r.review !== null) ?? results[0];
    const comparisonSummary = this.provider.generateComparisonSummary(results);
    
    // primaryResult.content is rendered from its structured review when there is
    // one, so this concatenation still has real text on both sides.
    const combinedFeedback = primaryResult.content + comparisonSummary;
    const hasIssues = this.resolveVerdict(primaryResult.review, primaryResult.error, combinedFeedback);
    
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    const totalTokens = results.reduce((sum, r) => ({
      input: sum.input + r.tokensUsed.input,
      output: sum.output + r.tokensUsed.output
    }), { input: 0, output: 0 });

    console.log(`✅ ${request.filename} compared across ${results.length} models (avg ${Math.round(avgResponseTime)}ms)`);
    
    return {
      filePath: request.filename,
      template: template.name,
      hasIssues,
      feedback: combinedFeedback,
      tokensUsed: totalTokens,
      timestamp: new Date(),
      authMethod: 'multi-model-comparison',
      review: primaryResult.review,
      ...(primaryResult.error ? { error: primaryResult.error } : {}),
      modelUsed: results.map(r => r.model).join('+'),
      responseTime: avgResponseTime,
      comparisonResults: results
    };
  }

  /**
   * Review multiple files with progress tracking
   */
  async reviewMultipleFiles(
    files: FileInfo[],
    template: ReviewTemplate,
    concurrency: number = 2, // Lower concurrency for multi-model to avoid rate limits
    onProgress?: (current: number, total: number, result: MultiModelReviewResult) => void
  ): Promise<MultiModelReviewResult[]> {
    const results: MultiModelReviewResult[] = [];
    
    console.log(`\n🚀 Starting multi-model review of ${files.length} files with ${template.name} template`);
    
    if (this.config.comparisonMode) {
      console.log(`🔬 Comparison mode: Each file will be reviewed by multiple models`);
    } else {
      console.log(`🎯 Smart mode: Using ${this.provider.getOptimalModel(template.name)} for ${template.name} reviews`);
    }

    // Process files in parallel batches with lower concurrency for API limits
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      console.log(`\n📦 Processing batch ${Math.floor(i/concurrency) + 1}: ${batch.map(f => f.relativePath).join(', ')}`);
      
      const batchPromises = batch.map(async (file, batchIndex) => {
        try {
          const result = await this.reviewFile(file, template);
          
          // Stream result immediately
          this.streamResult(result, i + batchIndex + 1, files.length);
          
          if (onProgress) {
            onProgress(i + batchIndex + 1, files.length, result);
          }
          
          return result;
        } catch (error) {
          console.error(`Failed to review ${file.relativePath}, skipping...`);
          return null;
        }
      });

      // Wait for entire batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null) as MultiModelReviewResult[]);
      
      // Brief pause between batches to respect API limits
      if (i + concurrency < files.length) {
        console.log('⏸️  Brief pause between batches...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Stream individual result as it completes
   */
  private streamResult(result: MultiModelReviewResult, current: number, total: number): void {
    const status = formatIssueStatus(result.hasIssues);
    const model = this.provider.getModelInfo(this.getModelKey(result.modelUsed))?.name || result.modelUsed;
    
    console.log(`\n[${'='.repeat(60)}]`);
    console.log(`📄 [${current}/${total}] ${result.filePath}`);
    console.log(`🤖 Model: ${model} (${result.responseTime}ms)`);
    console.log(`📊 Status: ${status}`);
    console.log(`🎫 Tokens: ${(result.tokensUsed.input + result.tokensUsed.output).toLocaleString()}`);
    
    // Printed on failure too. Gating on hasIssues alone would show a status line
    // and suppress the body, which is where the failure explanation lives.
    if (result.hasIssues !== false) {
      console.log(`\n${'-'.repeat(50)}`);
      console.log(result.feedback);
      console.log(`${'-'.repeat(50)}`);
    }
  }

  /**
   * Print review summary
   */
  printReviewSummary(results: MultiModelReviewResult[]): void {
    const verdicts = summarizeVerdicts(results);
    const modelsUsed = [...new Set(results.map(r => r.modelUsed))];

    console.log('\n📊 MULTI-MODEL REVIEW SUMMARY');
    console.log('='.repeat(50));
    console.log(`📁 Files reviewed: ${verdicts.total}`);
    console.log(`🔍 Files with issues: ${verdicts.withIssues}`);
    console.log(`✅ Clean files: ${verdicts.clean}`);
    if (verdicts.failed > 0) {
      console.log(`⚠️  Files that failed to review: ${verdicts.failed}`);
    }
    console.log(`🤖 Models used: ${modelsUsed.map(m => this.getModelDisplayName(m)).join(', ')}`);
    
    // Show token usage by provider
    const tokenStats = this.tokenTracker.getStats();
    if (tokenStats.totalTokens > 0) {
      console.log(`🎫 Total tokens: ${tokenStats.totalTokens.toLocaleString()}`);
      
      Object.entries(tokenStats.providerBreakdown).forEach(([provider, tokens]) => {
        console.log(`   ${provider}: ${tokens.toLocaleString()} tokens`);
      });
    }
    
    // Performance stats
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    console.log(`⚡ Average response time: ${Math.round(avgResponseTime)}ms`);
    
    if (results.some(r => r.comparisonResults)) {
      console.log(`🔬 Comparison mode was used for enhanced accuracy`);
    }
    
    console.log('='.repeat(50));
  }

  /**
   * Get available models for display
   */
  getAvailableModels(): string[] {
    return this.provider.getAvailableModels();
  }

  /**
   * Get model configuration
   */
  getModelConfig(): ModelConfig {
    return this.config;
  }

  /**
   * Enable/disable comparison mode
   */
  setComparisonMode(enabled: boolean): void {
    this.config.comparisonMode = enabled;
    console.log(`🔬 Comparison mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Three-way verdict. Keyword matching is only trustworthy on the legacy text
   * path: this list contains 'error' and 'problem', so a failure diagnostic routed
   * through it would report issues by accident.
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
    const issueKeywords = [
      'issue', 'problem', 'error', 'warning', 'bug', 'vulnerability',
      'security', 'performance', 'improvement', 'consider', 'should',
      'could', 'might', 'potential', 'risk', 'concern'
    ];
    
    const lowerFeedback = feedback.toLowerCase();
    return issueKeywords.some(keyword => lowerFeedback.includes(keyword));
  }

  private getModelKey(modelName: string): string {
    // Convert model name back to key for lookups
    for (const modelKey of this.provider.getAvailableModels()) {
      const model = this.provider.getModelInfo(modelKey);
      if (model?.model === modelName) {
        return modelKey;
      }
    }
    return modelName;
  }

  private getModelDisplayName(modelName: string): string {
    if (modelName.includes('+')) {
      // Multiple models in comparison mode
      const models = modelName.split('+');
      return models.map(m => this.provider.getModelInfo(this.getModelKey(m))?.name || m).join(' + ');
    }
    
    const modelInfo = this.provider.getModelInfo(this.getModelKey(modelName));
    return modelInfo?.name || modelName;
  }
}
