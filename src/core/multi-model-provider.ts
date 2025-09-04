import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TokenEstimator } from '../utils/token-estimator.js';

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
  content: string;
  model: string;
  provider: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  responseTime: number;
  confidence?: number;
}

export const AVAILABLE_MODELS: Record<string, ModelProvider> = {
  'claude-sonnet': {
    name: 'Claude Sonnet',
    model: 'claude-3-5-sonnet-20241022',
    strengths: ['Security analysis', 'Architecture review', 'Cross-file context', 'Documentation'],
    costTier: 'medium',
    speedTier: 'medium'
  },
  'claude-haiku': {
    name: 'Claude Haiku',
    model: 'claude-3-5-haiku-20241022',
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
      return await this.callClaude(model, request, startTime);
    } else if (modelKey.startsWith('gemini-')) {
      return await this.callGemini(model, request, startTime);
    } else {
      throw new Error(`Unsupported model provider: ${modelKey}`);
    }
  }

  /**
   * Call Claude models
   */
  private async callClaude(model: ModelProvider, request: ReviewRequest, startTime: number): Promise<ModelResponse> {
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
          responseTime: Date.now() - startTime
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
        max_tokens: 4000,
        system: request.systemPrompt,
        messages: [{
          role: 'user',
          content: `File: ${request.filename}\n\n${request.code}`
        }]
      });

      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('\n');

      return {
        content,
        model: model.model,
        provider: 'claude',
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens
        },
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Call Gemini models
   */
  private async callGemini(model: ModelProvider, request: ReviewRequest, startTime: number): Promise<ModelResponse> {
    if (!this.gemini) {
      throw new Error('Gemini API key not configured');
    }

    try {
      const geminiModel = this.gemini.getGenerativeModel({ model: model.model });
      
      const prompt = `${request.systemPrompt}\n\nFile: ${request.filename}\n\nCode:\n\`\`\`\n${request.code}\n\`\`\`\n\nProvide your code review:`;

      console.log(`🔬 Calling Gemini API with model: ${model.model}`);
      
      const result = await geminiModel.generateContent(prompt);
      const response = await result.response;
      const content = response.text();

      console.log(`✅ Gemini responded successfully (${content.length} chars)`);

      // Gemini doesn't provide token counts in the same way, estimate
      const estimatedInputTokens = Math.ceil(prompt.length / 4);
      const estimatedOutputTokens = Math.ceil(content.length / 4);

      return {
        content,
        model: model.model,
        provider: 'gemini',
        tokensUsed: {
          input: estimatedInputTokens,
          output: estimatedOutputTokens
        },
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      // Handle rate limiting specifically
      if (error.message && error.message.includes('429')) {
        console.warn(`🕰️ Gemini rate limit hit - will retry in 30s`);
        // For now, just throw - but could implement retry logic here
        throw new Error(`Gemini rate limit exceeded - try again later or use --model claude-sonnet`);
      }
      
      console.error(`❌ Gemini API error:`, error.message || error);
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
