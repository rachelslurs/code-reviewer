import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, type ResponseSchema } from '@google/generative-ai';
import { TokenEstimator, MODEL_LIMITS } from '../utils/token-estimator.js';
import {
  anthropicInputSchema,
  geminiResponseSchema,
  normalizeReviewResponse,
  renderStructuredReviewAsText,
  SUBMIT_REVIEW_TOOL_NAME,
  STRUCTURED_OUTPUT_INSTRUCTION,
  type StructuredReview,
} from './review-schema.js';

const DEFAULT_MAX_OUTPUT_TOKENS = 4000;

/**
 * A model that truncates at its own cap will truncate again on retry, because the
 * fallback chain changes the model but not this ceiling. Reading the per-model limit
 * is what buys headroom; the override exists so verification needs no source edit.
 */
function resolveMaxTokens(modelKey: string): number {
  const override = Number(process.env.CODE_REVIEW_MAX_TOKENS);
  if (Number.isFinite(override) && override > 0) return override;
  return MODEL_LIMITS[modelKey]?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
}

function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface ModelProvider {
  name: string;
  model: string;
  strengths: string[];
  costTier: 'free' | 'low' | 'medium' | 'high';
  speedTier: 'fast' | 'medium' | 'slow';
}

export interface ReviewRequest {
  code: string;
  filename: string;
  systemPrompt: string;
  template: string;
}

export interface ModelResponse {
  /**
   * Rendered review text. Never empty: under forced tool use the API returns no text
   * block, so this is generated from `review` rather than read off the response.
   * Consumers that scan free text, such as findConsensusIssues, depend on it.
   */
  content: string;
  model: string;
  provider: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  responseTime: number;
  confidence?: number;
  /** null when the transport produced no structured output, or when it failed. */
  review: StructuredReview | null;
  /** Present only on failure. Absent is the success signal, so check truthiness. */
  error?: string;
}

// Model versions - update these when Anthropic releases newer versions
// Check: https://docs.anthropic.com/en/docs/about-claude/model-deprecations
const CLAUDE_MODELS = {
  SONNET: 'claude-3-5-sonnet-20241220', // Current stable version
  HAIKU: 'claude-3-5-haiku-20241220'    // Current stable version
};

export const AVAILABLE_MODELS: Record<string, ModelProvider> = {
  'claude-sonnet': {
    name: 'Claude Sonnet',
    model: CLAUDE_MODELS.SONNET,
    strengths: ['Security analysis', 'Architecture review', 'Cross-file context', 'Documentation'],
    costTier: 'medium',
    speedTier: 'medium'
  },
  'claude-haiku': {
    name: 'Claude Haiku',
    model: CLAUDE_MODELS.HAIKU,
    strengths: ['Quick feedback', 'Code style', 'Basic quality checks'],
    costTier: 'low',
    speedTier: 'fast'
  },
  'gemini-pro': {
    name: 'Gemini Pro',
    model: 'gemini-1.5-pro',
    strengths: ['Individual file analysis', 'Performance optimization', 'Bug detection', 'Detailed code review'],
    costTier: 'medium',
    speedTier: 'medium'
  },
  'gemini-flash': {
    name: 'Gemini Flash',
    model: 'gemini-1.5-flash',
    strengths: ['Fast reviews', 'Code quality', 'Pattern detection'],
    costTier: 'low',
    speedTier: 'fast'
  }
};

export interface ModelConfig {
  primaryModel: string;
  fallbackModels: string[];
  templateMappings: Record<string, string>;
  comparisonMode: boolean;
  maxRetries: number;
  timeout: number;
}

export class MultiModelProvider {
  private anthropic?: Anthropic;
  private gemini?: GoogleGenerativeAI;
  private config: ModelConfig;
  private useClaudeCode: boolean;

  constructor(config: ModelConfig, apiKeys: { anthropic?: string; gemini?: string }, useClaudeCode = false) {
    this.config = config;
    this.useClaudeCode = useClaudeCode;

    console.log('🔍 Multi-model initialization:');
    console.log(`   Claude Code available: ${useClaudeCode}`);
    console.log(`   Anthropic API key: ${apiKeys.anthropic ? 'Yes' : 'No'}`);
    console.log(`   Gemini API key: ${apiKeys.gemini ? 'Yes (' + apiKeys.gemini.slice(0, 8) + '...)' : 'No'}`);

    // Initialize Anthropic (Claude Code or API key)
    if (!useClaudeCode && apiKeys.anthropic) {
      this.anthropic = new Anthropic({ apiKey: apiKeys.anthropic });
    }

    // Initialize Gemini
    if (apiKeys.gemini) {
      try {
        this.gemini = new GoogleGenerativeAI(apiKeys.gemini);
        console.log('✅ Gemini client initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize Gemini client:', error);
      }
    } else {
      console.log('⚠️ No Gemini API key provided');
    }
  }

  /**
   * Get the best model for a specific template/task
   */
  getOptimalModel(template: string): string {
    const availableModels = this.getAvailableModels();
    
    // Check template-specific mappings first
    if (this.config.templateMappings[template] && availableModels.includes(this.config.templateMappings[template])) {
      return this.config.templateMappings[template];
    }

    // Smart defaults based on template type (but only if available)
    const smartMappings: Record<string, string> = {
      'security': 'claude-sonnet',      // Claude excels at security
      'quality': 'gemini-pro',          // Gemini great for code quality
      'performance': 'gemini-pro',       // Gemini strong on performance
      'typescript': 'gemini-flash',      // Fast for type checking
      'combined': 'claude-sonnet',       // Claude better for comprehensive reviews
    };

    const preferredModel = smartMappings[template];
    if (preferredModel && availableModels.includes(preferredModel)) {
      return preferredModel;
    }

    // Fallback to primary model if available, otherwise first available model
    if (availableModels.includes(this.config.primaryModel)) {
      return this.config.primaryModel;
    }
    
    if (availableModels.length > 0) {
      return availableModels[0];
    }
    
    throw new Error('No models available');
  }

  /**
   * Get optimal model considering token requirements
   */
  getOptimalModelWithTokens(template: string, estimate: any): string {
    const availableModels = this.getAvailableModels();
    
    // First try the token estimator's recommendation if available
    if (estimate.recommendedModel && availableModels.includes(estimate.recommendedModel)) {
      const fitsCheck = TokenEstimator.fitsWithinLimits(estimate, estimate.recommendedModel);
      if (fitsCheck.fits) {
        return estimate.recommendedModel;
      }
    }
    
    // Fall back to template-based selection, but check token limits
    const templateChoice = this.getOptimalModel(template);
    const fitsCheck = TokenEstimator.fitsWithinLimits(estimate, templateChoice);
    
    if (fitsCheck.fits) {
      return templateChoice;
    }
    
    // Find any available model that can handle the tokens
    for (const modelKey of availableModels) {
      const modelCheck = TokenEstimator.fitsWithinLimits(estimate, modelKey);
      if (modelCheck.fits) {
        console.log(`📊 Selecting ${modelKey} based on token limits`);
        return modelKey;
      }
    }
    
    // Last resort - return first available model and let it fail gracefully
    console.warn('⚠️ No models can handle estimated token load, using first available');
    return availableModels[0] || this.config.primaryModel;
  }

  /**
   * Review code with the optimal model
   */
  async reviewCode(request: ReviewRequest): Promise<ModelResponse> {
    // Estimate tokens and get smart model recommendation
    const estimate = TokenEstimator.estimateTokens(
      request.code,
      request.systemPrompt,
      request.filename,
      request.template
    );
    
    const optimalModel = this.getOptimalModelWithTokens(request.template, estimate);
    console.log(`🤖 Using ${AVAILABLE_MODELS[optimalModel]?.name || optimalModel} for ${request.template} review`);
    
    // Display token estimate
    TokenEstimator.displayEstimate(estimate, optimalModel);

    try {
      return await this.callModel(optimalModel, request);
    } catch (error) {
      console.warn(`⚠️ ${optimalModel} failed, trying fallback...`);
      
      // Try fallback models that can handle the token load
      for (const fallbackModel of this.config.fallbackModels) {
        if (fallbackModel !== optimalModel && this.getAvailableModels().includes(fallbackModel)) {
          const fallbackCheck = TokenEstimator.fitsWithinLimits(estimate, fallbackModel);
          if (fallbackCheck.fits) {
            try {
              console.log(`🔄 Fallback to ${AVAILABLE_MODELS[fallbackModel]?.name || fallbackModel}`);
              return await this.callModel(fallbackModel, request);
            } catch (fallbackError) {
              console.warn(`⚠️ ${fallbackModel} also failed`);
              continue;
            }
          } else {
            console.warn(`⚠️ ${fallbackModel} skipped (token limit exceeded)`);
          }
        }
      }
      
      throw new Error(`All suitable models failed for ${request.filename}`);
    }
  }

  /**
   * Compare results from multiple models
   */
  async compareModels(request: ReviewRequest, models?: string[]): Promise<ModelResponse[]> {
    const availableModels = this.getAvailableModels();
    const modelsToUse = models ? models.filter(m => availableModels.includes(m)) : availableModels;
    const actualModels = modelsToUse.slice(0, Math.min(3, modelsToUse.length)); // Compare up to 3 models
    
    console.log(`🔬 Comparing ${actualModels.length} available models for ${request.filename}`);
    
    const promises = actualModels.map(async (model) => {
      try {
        return await this.callModel(model, request);
      } catch (error) {
        console.warn(`⚠️ ${model} failed in comparison`);
        return null;
      }
    });

    const results = await Promise.all(promises);
    return results.filter((result): result is ModelResponse => result !== null);
  }

  /**
   * Call a specific model
   */
  private async callModel(modelKey: string, request: ReviewRequest): Promise<ModelResponse> {
    const startTime = Date.now();
    const model = AVAILABLE_MODELS[modelKey];
    
    if (!model) {
      throw new Error(`Unknown model: ${modelKey}`);
    }

    if (modelKey.startsWith('claude-')) {
      return await this.callClaude(model, request, startTime, modelKey);
    } else if (modelKey.startsWith('gemini-')) {
      return await this.callGemini(model, request, startTime, modelKey);
    } else {
      throw new Error(`Unsupported model provider: ${modelKey}`);
    }
  }

  /**
   * Call Claude models
   */
  private async callClaude(model: ModelProvider, request: ReviewRequest, startTime: number, modelKey: string): Promise<ModelResponse> {
    if (this.useClaudeCode) {
      // Use Claude Code CLI with proper syntax
      const { execSync } = require('child_process');
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      // Create temporary file for the prompt
      const tempDir = os.tmpdir();
      const promptFile = path.join(tempDir, `prompt-${Date.now()}.txt`);

      try {
        const fullPrompt = `${request.systemPrompt}\n\nFile: ${request.filename}\n\nCode:\n${request.code}`;
        fs.writeFileSync(promptFile, fullPrompt);

        // Use claude chat with stdin instead of --file
        const result = execSync(
          `claude chat --model ${model.model} < "${promptFile}"`,
          { encoding: 'utf8', timeout: this.config.timeout, shell: true }
        );

        // Clean up
        fs.unlinkSync(promptFile);

        return {
          content: result.trim(),
          model: model.model,
          provider: 'claude',
          tokensUsed: { input: 0, output: 0 }, // Claude Code doesn't report tokens
          responseTime: Date.now() - startTime,
          // The CLI exposes no tool-use surface, so this path is text-only by
          // transport. Absent `error` keeps it a success, not a failure.
          review: null
        };
      } catch (error) {
        // Clean up on error
        try { fs.unlinkSync(promptFile); } catch {}
        throw error;
      }
    } else {
      // Use Anthropic API
      if (!this.anthropic) {
        throw new Error('Anthropic API key not configured');
      }

      const response = await this.anthropic.messages.create({
        model: model.model,
        max_tokens: resolveMaxTokens(modelKey),
        system: `${request.systemPrompt}\n\n${STRUCTURED_OUTPUT_INSTRUCTION}`,
        tools: [{
          name: SUBMIT_REVIEW_TOOL_NAME,
          description: 'Submit the structured code review.',
          input_schema: anthropicInputSchema as Anthropic.Tool.InputSchema
        }],
        tool_choice: { type: 'tool', name: SUBMIT_REVIEW_TOOL_NAME },
        messages: [{
          role: 'user',
          content: `File: ${request.filename}\n\n${request.code}`
        }]
      });

      const tokensUsed = {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens
      };

      const base = {
        model: model.model,
        provider: 'claude',
        tokensUsed,
        responseTime: Date.now() - startTime
      };

      // Truncation and schema violation are different failures and only one of them
      // is worth another call, so they must not collapse into the same branch.
      // Retrying truncation would reissue an identical request under an identical
      // cap, so it is reported rather than thrown into the fallback chain.
      if (response.stop_reason === 'max_tokens') {
        const error = `Response truncated at ${tokensUsed.output} output tokens for ${model.model}. Raise CODE_REVIEW_MAX_TOKENS or review a smaller file.`;
        return { ...base, content: error, review: null, error };
      }

      const toolUse = response.content.find(block => block.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        const error = `${model.model} returned no ${SUBMIT_REVIEW_TOOL_NAME} tool call.`;
        return { ...base, content: error, review: null, error };
      }

      const review = normalizeReviewResponse(toolUse.input);
      if (!review) {
        const error = `${model.model} returned a ${SUBMIT_REVIEW_TOOL_NAME} payload that does not match the review schema.`;
        return { ...base, content: error, review: null, error };
      }

      // Forced tool use means there is no text block to read. Rendering here keeps
      // every downstream consumer of `content` working.
      return { ...base, content: renderStructuredReviewAsText(review), review };
    }
  }

  /**
   * Call Gemini models
   */
  private async callGemini(model: ModelProvider, request: ReviewRequest, startTime: number, modelKey: string): Promise<ModelResponse> {
    if (!this.gemini) {
      throw new Error('Gemini API key not configured');
    }

    try {
      const geminiModel = this.gemini.getGenerativeModel({
        model: model.model,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: geminiResponseSchema as unknown as ResponseSchema,
          maxOutputTokens: resolveMaxTokens(modelKey)
        }
      });

      const prompt = `${request.systemPrompt}\n\n${STRUCTURED_OUTPUT_INSTRUCTION}\n\nFile: ${request.filename}\n\nCode:\n\`\`\`\n${request.code}\n\`\`\``;

      console.log(`🔬 Calling Gemini API with model: ${model.model}`);

      const result = await geminiModel.generateContent(prompt);
      const response = await result.response;
      const raw = response.text();

      console.log(`✅ Gemini responded successfully (${raw.length} chars)`);

      // Gemini doesn't provide token counts in the same way, estimate
      const base = {
        model: model.model,
        provider: 'gemini',
        tokensUsed: {
          input: Math.ceil(prompt.length / 4),
          output: Math.ceil(raw.length / 4)
        },
        responseTime: Date.now() - startTime
      };

      const review = normalizeReviewResponse(parseJsonOrNull(raw));
      if (!review) {
        const error = `${model.model} returned a response that does not match the review schema.`;
        // Unlike the Anthropic path there is real text here, so keep it: malformed
        // JSON is still readable and more useful than the diagnostic alone.
        return { ...base, content: raw.trim() || error, review: null, error };
      }

      return { ...base, content: renderStructuredReviewAsText(review), review };
    } catch (error) {
      const message = errorMessage(error);

      // Handle rate limiting specifically
      if (message.includes('429')) {
        console.warn(`🕰️ Gemini rate limit hit`);
        throw new Error(`Gemini rate limit exceeded - try again later or use --model claude-sonnet`);
      }

      console.error(`❌ Gemini API error:`, message);
      throw error;
    }
  }

  /**
   * Get available models based on configured API keys
   */
  getAvailableModels(): string[] {
    const available = [];
    
    if (this.useClaudeCode || this.anthropic) {
      available.push('claude-sonnet', 'claude-haiku');
    }
    
    if (this.gemini) {
      available.push('gemini-pro', 'gemini-flash');
    }
    
    return available;
  }

  /**
   * Get model information
   */
  getModelInfo(modelKey: string): ModelProvider | undefined {
    return AVAILABLE_MODELS[modelKey];
  }

  /**
   * Generate comparison summary
   */
  generateComparisonSummary(results: ModelResponse[]): string {
    if (results.length < 2) return '';

    let summary = '\n## 🔬 Multi-Model Comparison\n\n';
    
    results.forEach((result, index) => {
      const model = AVAILABLE_MODELS[Object.keys(AVAILABLE_MODELS).find(key => 
        AVAILABLE_MODELS[key].model === result.model
      ) || ''];
      
      summary += `### ${model?.name || result.model} (${result.responseTime}ms)\n`;
      summary += `**Strengths:** ${model?.strengths.join(', ') || 'N/A'}\n`;
      summary += `**Tokens:** ${(result.tokensUsed.input + result.tokensUsed.output).toLocaleString()}\n\n`;
    });

    // Find consensus issues (mentioned by multiple models)
    const consensusKeywords = this.findConsensusIssues(results);
    if (consensusKeywords.length > 0) {
      summary += `### 🎯 Consensus Issues\n`;
      summary += `Multiple models identified: ${consensusKeywords.join(', ')}\n\n`;
    }

    return summary;
  }

  private findConsensusIssues(results: ModelResponse[]): string[] {
    const keywords = ['security', 'performance', 'bug', 'error', 'vulnerability', 'issue', 'problem'];
    const consensus: string[] = [];

    keywords.forEach(keyword => {
      const mentionCount = results.filter(result => 
        result.content.toLowerCase().includes(keyword)
      ).length;
      
      if (mentionCount >= Math.ceil(results.length / 2)) {
        consensus.push(keyword);
      }
    });

    return consensus;
  }
}
