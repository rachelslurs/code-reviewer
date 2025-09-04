export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  complexity: 'low' | 'medium' | 'high';
  recommendedModel: string;
  costEstimate: number;
}

export interface ModelLimits {
  maxInputTokens: number;
  maxOutputTokens: number;
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    requestsPerDay?: number;
  };
  pricing: {
    inputPer1K: number;
    outputPer1K: number;
  };
}

export const MODEL_LIMITS: Record<string, ModelLimits> = {
  'claude-sonnet': {
    maxInputTokens: 200000,
    maxOutputTokens: 8192,
    rateLimit: {
      requestsPerMinute: 5,
      tokensPerMinute: 40000,
      requestsPerDay: 1000
    },
    pricing: {
      inputPer1K: 3.0,   // $3 per million input tokens
      outputPer1K: 15.0  // $15 per million output tokens
    }
  },
  'claude-haiku': {
    maxInputTokens: 200000,
    maxOutputTokens: 4096,
    rateLimit: {
      requestsPerMinute: 5,
      tokensPerMinute: 50000,
      requestsPerDay: 1000
    },
    pricing: {
      inputPer1K: 0.25,  // $0.25 per million input tokens
      outputPer1K: 1.25  // $1.25 per million output tokens
    }
  },
  'gemini-pro': {
    maxInputTokens: 2000000,
    maxOutputTokens: 8192,
    rateLimit: {
      requestsPerMinute: 2,     // Very restrictive free tier
      tokensPerMinute: 32000,
      requestsPerDay: 50
    },
    pricing: {
      inputPer1K: 0.0,   // Free tier
      outputPer1K: 0.0
    }
  },
  'gemini-flash': {
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    rateLimit: {
      requestsPerMinute: 15,    // Much more generous
      tokensPerMinute: 1000000,
      requestsPerDay: 1500
    },
    pricing: {
      inputPer1K: 0.0,   // Free tier
      outputPer1K: 0.0
    }
  }
};

export class TokenEstimator {
  /**
   * Estimate tokens for a review request
   */
  static estimateTokens(
    code: string, 
    systemPrompt: string, 
    filename: string,
    template: string
  ): TokenEstimate {
    // Base token estimation (roughly 4 characters per token)
    const codeTokens = Math.ceil(code.length / 4);
    const promptTokens = Math.ceil(systemPrompt.length / 4);
    const filenameTokens = Math.ceil(filename.length / 4);
    
    const inputTokens = codeTokens + promptTokens + filenameTokens + 50; // 50 for formatting
    
    // Estimate output tokens based on code complexity and template
    const outputTokens = this.estimateOutputTokens(code, template);
    
    const totalTokens = inputTokens + outputTokens;
    const complexity = this.assessComplexity(code, totalTokens);
    
    return {
      inputTokens,
      outputTokens,
      totalTokens,
      complexity,
      recommendedModel: this.recommendModel(totalTokens, complexity, template),
      costEstimate: this.estimateCost(inputTokens, outputTokens, 'claude-sonnet') // Default cost estimate
    };
  }

  /**
   * Estimate output tokens based on code characteristics
   */
  private static estimateOutputTokens(code: string, template: string): number {
    const baseOutput = 200; // Minimum response
    
    // Code complexity factors
    const lines = code.split('\n').length;
    const functions = (code.match(/function|const.*=>|class /g) || []).length;
    const imports = (code.match(/import|require/g) || []).length;
    const complexPatterns = (code.match(/async|await|Promise|try|catch|if|for|while/g) || []).length;
    
    // Template-specific multipliers
    const templateMultipliers = {
      'quality': 1.5,       // Detailed quality analysis
      'security': 2.0,      // Comprehensive security review
      'performance': 1.3,   // Performance optimization suggestions
      'typescript': 1.2,    // Type checking is usually concise
      'combined': 2.5       // Most comprehensive
    };
    
    const multiplier = templateMultipliers[template as keyof typeof templateMultipliers] || 1.0;
    
    // Calculate based on complexity
    const complexityScore = (lines * 2) + (functions * 50) + (imports * 10) + (complexPatterns * 15);
    const estimatedOutput = Math.min(baseOutput + complexityScore * multiplier, 4000); // Cap at 4K tokens
    
    return Math.ceil(estimatedOutput);
  }

  /**
   * Assess code complexity
   */
  private static assessComplexity(code: string, totalTokens: number): 'low' | 'medium' | 'high' {
    const lines = code.split('\n').length;
    const cyclomatic = (code.match(/if|for|while|switch|case|catch|\?|&&|\|\|/g) || []).length;
    
    if (totalTokens > 3000 || lines > 200 || cyclomatic > 20) {
      return 'high';
    } else if (totalTokens > 1000 || lines > 50 || cyclomatic > 5) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Recommend optimal model based on token estimate and requirements
   */
  private static recommendModel(
    totalTokens: number, 
    complexity: 'low' | 'medium' | 'high',
    template: string
  ): string {
    // For free tier optimization, prefer Gemini Flash for most cases
    if (totalTokens < 1000 && complexity === 'low') {
      return 'gemini-flash';  // Fast and free
    }
    
    if (template === 'security' || complexity === 'high') {
      return 'claude-sonnet';  // Best for security and complex analysis
    }
    
    if (template === 'typescript' || (totalTokens < 2000 && complexity === 'medium')) {
      return 'gemini-flash';  // Good balance for medium complexity
    }
    
    if (totalTokens > 10000) {
      return 'gemini-pro';  // Handles large inputs better
    }
    
    return 'gemini-flash';  // Default to free tier
  }

  /**
   * Check if request fits within model limits
   */
  static fitsWithinLimits(estimate: TokenEstimate, modelKey: string): {
    fits: boolean;
    issues: string[];
    alternatives: string[];
  } {
    const limits = MODEL_LIMITS[modelKey];
    if (!limits) {
      return { fits: false, issues: ['Unknown model'], alternatives: [] };
    }

    const issues: string[] = [];
    const alternatives: string[] = [];

    if (estimate.inputTokens > limits.maxInputTokens) {
      issues.push(`Input tokens (${estimate.inputTokens.toLocaleString()}) exceed limit (${limits.maxInputTokens.toLocaleString()})`);
    }

    if (estimate.outputTokens > limits.maxOutputTokens) {
      issues.push(`Estimated output tokens (${estimate.outputTokens.toLocaleString()}) exceed limit (${limits.maxOutputTokens.toLocaleString()})`);
    }

    // Suggest alternatives if current model won't work
    if (issues.length > 0) {
      Object.keys(MODEL_LIMITS).forEach(key => {
        const altLimits = MODEL_LIMITS[key];
        if (estimate.inputTokens <= altLimits.maxInputTokens && 
            estimate.outputTokens <= altLimits.maxOutputTokens) {
          alternatives.push(key);
        }
      });
    }

    return {
      fits: issues.length === 0,
      issues,
      alternatives
    };
  }

  /**
   * Estimate cost for specific model
   */
  private static estimateCost(inputTokens: number, outputTokens: number, modelKey: string): number {
    const limits = MODEL_LIMITS[modelKey];
    if (!limits) return 0;

    const inputCost = (inputTokens / 1000) * (limits.pricing.inputPer1K / 1000);
    const outputCost = (outputTokens / 1000) * (limits.pricing.outputPer1K / 1000);
    
    return inputCost + outputCost;
  }

  /**
   * Get rate limit status for model
   */
  static getRateLimitInfo(modelKey: string): ModelLimits['rateLimit'] | null {
    return MODEL_LIMITS[modelKey]?.rateLimit || null;
  }

  /**
   * Display token estimate summary
   */
  static displayEstimate(estimate: TokenEstimate, modelKey: string): void {
    const limits = MODEL_LIMITS[modelKey];
    const fitsCheck = this.fitsWithinLimits(estimate, modelKey);
    
    console.log(`\n📊 Token Estimate for ${modelKey}:`);
    console.log(`   Input tokens: ${estimate.inputTokens.toLocaleString()}`);
    console.log(`   Output tokens: ~${estimate.outputTokens.toLocaleString()}`);
    console.log(`   Total tokens: ~${estimate.totalTokens.toLocaleString()}`);
    console.log(`   Complexity: ${estimate.complexity}`);
    
    if (limits) {
      console.log(`   Model limits: ${limits.maxInputTokens.toLocaleString()} input, ${limits.maxOutputTokens.toLocaleString()} output`);
      console.log(`   Rate limit: ${limits.rateLimit.requestsPerMinute}/min, ${limits.rateLimit.tokensPerMinute.toLocaleString()} tokens/min`);
    }
    
    if (estimate.costEstimate > 0) {
      console.log(`   Estimated cost: $${estimate.costEstimate.toFixed(4)}`);
    } else {
      console.log(`   Cost: Free tier`);
    }
    
    if (!fitsCheck.fits) {
      console.log(`   ⚠️ Issues: ${fitsCheck.issues.join(', ')}`);
      if (fitsCheck.alternatives.length > 0) {
        console.log(`   💡 Try: ${fitsCheck.alternatives.join(', ')}`);
      }
    } else {
      console.log(`   ✅ Fits within model limits`);
    }
    
    if (estimate.recommendedModel !== modelKey) {
      console.log(`   🎯 Recommended: ${estimate.recommendedModel} (better fit)`);
    }
  }
}
