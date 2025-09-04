import { TokenEstimator, MODEL_LIMITS } from './token-estimator.js';

export interface ModelStatus {
  modelKey: string;
  modelName: string;
  available: boolean;
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    requestsPerDay?: number;
  };
  currentUsage: {
    requestsThisMinute: number;
    tokensThisMinute: number;
    requestsToday: number;
  };
  costInfo: {
    inputPer1K: number;
    outputPer1K: number;
    isFree: boolean;
  };
  status: 'available' | 'rate_limited' | 'unavailable';
  nextAvailableIn?: number; // seconds
}

export class ModelStatusChecker {
  private requestHistory: Map<string, number[]> = new Map();
  private tokenHistory: Map<string, { timestamp: number; tokens: number }[]> = new Map();

  /**
   * Get status for all available models
   */
  async getModelStatuses(availableModels: string[]): Promise<ModelStatus[]> {
    const statuses: ModelStatus[] = [];
    
    for (const modelKey of availableModels) {
      const status = await this.getModelStatus(modelKey);
      statuses.push(status);
    }
    
    return statuses;
  }

  /**
   * Get status for a specific model
   */
  async getModelStatus(modelKey: string): Promise<ModelStatus> {
    const limits = MODEL_LIMITS[modelKey];
    const modelInfo = TokenEstimator.getRateLimitInfo(modelKey);
    
    if (!limits || !modelInfo) {
      return {
        modelKey,
        modelName: modelKey,
        available: false,
        rateLimit: { requestsPerMinute: 0, tokensPerMinute: 0 },
        currentUsage: { requestsThisMinute: 0, tokensThisMinute: 0, requestsToday: 0 },
        costInfo: { inputPer1K: 0, outputPer1K: 0, isFree: true },
        status: 'unavailable'
      };
    }

    const currentUsage = this.getCurrentUsage(modelKey);
    const status = this.determineStatus(modelKey, limits, currentUsage);
    
    return {
      modelKey,
      modelName: this.getDisplayName(modelKey),
      available: true,
      rateLimit: limits.rateLimit,
      currentUsage,
      costInfo: {
        inputPer1K: limits.pricing.inputPer1K,
        outputPer1K: limits.pricing.outputPer1K,
        isFree: limits.pricing.inputPer1K === 0 && limits.pricing.outputPer1K === 0
      },
      status: status.status,
      nextAvailableIn: status.nextAvailableIn
    };
  }

  /**
   * Record a request for rate limiting tracking
   */
  recordRequest(modelKey: string, tokensUsed: number): void {
    const now = Date.now();
    
    // Record request
    if (!this.requestHistory.has(modelKey)) {
      this.requestHistory.set(modelKey, []);
    }
    this.requestHistory.get(modelKey)!.push(now);
    
    // Record tokens
    if (!this.tokenHistory.has(modelKey)) {
      this.tokenHistory.set(modelKey, []);
    }
    this.tokenHistory.get(modelKey)!.push({ timestamp: now, tokens: tokensUsed });
    
    // Clean old entries
    this.cleanOldEntries(modelKey);
  }

  /**
   * Get current usage for a model
   */
  private getCurrentUsage(modelKey: string): ModelStatus['currentUsage'] {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;

    const requests = this.requestHistory.get(modelKey) || [];
    const tokens = this.tokenHistory.get(modelKey) || [];

    const requestsThisMinute = requests.filter(time => time > oneMinuteAgo).length;
    const tokensThisMinute = tokens
      .filter(entry => entry.timestamp > oneMinuteAgo)
      .reduce((sum, entry) => sum + entry.tokens, 0);
    const requestsToday = requests.filter(time => time > oneDayAgo).length;

    return {
      requestsThisMinute,
      tokensThisMinute,
      requestsToday
    };
  }

  /**
   * Determine if model is available or rate limited
   */
  private determineStatus(
    modelKey: string, 
    limits: typeof MODEL_LIMITS[string], 
    usage: ModelStatus['currentUsage']
  ): { status: ModelStatus['status']; nextAvailableIn?: number } {
    const now = Date.now();
    
    // Check requests per minute
    if (usage.requestsThisMinute >= limits.rateLimit.requestsPerMinute) {
      const requests = this.requestHistory.get(modelKey) || [];
      const oldestRecentRequest = Math.min(...requests.filter(time => time > now - 60000));
      const nextAvailableIn = Math.ceil((oldestRecentRequest + 60000 - now) / 1000);
      
      return { status: 'rate_limited', nextAvailableIn };
    }
    
    // Check tokens per minute
    if (usage.tokensThisMinute >= limits.rateLimit.tokensPerMinute) {
      const tokens = this.tokenHistory.get(modelKey) || [];
      const oldestRecentToken = Math.min(...tokens
        .filter(entry => entry.timestamp > now - 60000)
        .map(entry => entry.timestamp));
      const nextAvailableIn = Math.ceil((oldestRecentToken + 60000 - now) / 1000);
      
      return { status: 'rate_limited', nextAvailableIn };
    }
    
    // Check daily limits if they exist
    if (limits.rateLimit.requestsPerDay && usage.requestsToday >= limits.rateLimit.requestsPerDay) {
      return { status: 'rate_limited', nextAvailableIn: undefined }; // Need to wait until tomorrow
    }
    
    return { status: 'available' };
  }

  /**
   * Clean old entries to prevent memory leaks
   */
  private cleanOldEntries(modelKey: string): void {
    const now = Date.now();
    const oneDayAgo = now - 86400000;
    
    // Clean request history (keep 1 day)
    const requests = this.requestHistory.get(modelKey) || [];
    this.requestHistory.set(modelKey, requests.filter(time => time > oneDayAgo));
    
    // Clean token history (keep 1 day)
    const tokens = this.tokenHistory.get(modelKey) || [];
    this.tokenHistory.set(modelKey, tokens.filter(entry => entry.timestamp > oneDayAgo));
  }

  /**
   * Get display name for model
   */
  private getDisplayName(modelKey: string): string {
    const names: Record<string, string> = {
      'claude-sonnet': 'Claude 3.5 Sonnet',
      'claude-haiku': 'Claude 3.5 Haiku',
      'gemini-pro': 'Gemini 1.5 Pro',
      'gemini-flash': 'Gemini 1.5 Flash'
    };
    return names[modelKey] || modelKey;
  }

  /**
   * Display comprehensive status report
   */
  displayStatusReport(statuses: ModelStatus[]): void {
    console.log('\n🤖 AI Model Status Report');
    console.log('='.repeat(80));
    console.log(`📅 Generated: ${new Date().toLocaleString()}`);
    
    // Add important disclaimer
    console.log('\n⚠️  IMPORTANT: This shows usage from this tool only, not account-wide usage');
    console.log('📊 Check provider dashboards for complete usage across all applications\n');
    console.log();

    // Group by provider
    const claudeModels = statuses.filter(s => s.modelKey.startsWith('claude-'));
    const geminiModels = statuses.filter(s => s.modelKey.startsWith('gemini-'));

    if (claudeModels.length > 0) {
      console.log('🔹 Claude Models (Anthropic)');
      console.log('-'.repeat(40));
      claudeModels.forEach(status => this.displayModelStatus(status));
      console.log();
    }

    if (geminiModels.length > 0) {
      console.log('🔸 Gemini Models (Google)');
      console.log('-'.repeat(40));
      geminiModels.forEach(status => this.displayModelStatus(status));
      console.log();
    }

    // Summary
    const available = statuses.filter(s => s.status === 'available').length;
    const rateLimited = statuses.filter(s => s.status === 'rate_limited').length;
    const unavailable = statuses.filter(s => s.status === 'unavailable').length;

    console.log('📊 Summary:');
    console.log(`   ✅ Available: ${available} models`);
    console.log(`   ⏰ Rate Limited: ${rateLimited} models`);
    console.log(`   ❌ Unavailable: ${unavailable} models`);
    
    // Add provider dashboard links
    console.log('\n🔗 Provider Usage Dashboards:');
    console.log('   📊 Anthropic (Claude): https://console.anthropic.com/settings/usage');
    console.log('   📊 Google (Gemini): https://aistudio.google.com/app/apikey');
    console.log('   📊 Claude Code: No usage dashboard (subscription-based)');
    
    console.log('='.repeat(80));
  }

  /**
   * Display status for individual model
   */
  private displayModelStatus(status: ModelStatus): void {
    const statusIcon = this.getStatusIcon(status.status);
    const costDisplay = status.costInfo.isFree ? 'Free' : `$${status.costInfo.inputPer1K}/$${status.costInfo.outputPer1K} per 1K tokens`;
    
    console.log(`${statusIcon} ${status.modelName}`);
    console.log(`   Status: ${this.getStatusText(status)}`);
    console.log(`   Usage: ${status.currentUsage.requestsThisMinute}/${status.rateLimit.requestsPerMinute} requests/min, ${status.currentUsage.tokensThisMinute.toLocaleString()}/${status.rateLimit.tokensPerMinute.toLocaleString()} tokens/min`);
    
    if (status.rateLimit.requestsPerDay) {
      console.log(`   Daily: ${status.currentUsage.requestsToday}/${status.rateLimit.requestsPerDay} requests`);
    }
    
    console.log(`   Cost: ${costDisplay}`);
    
    if (status.nextAvailableIn) {
      console.log(`   Next available: ${status.nextAvailableIn}s`);
    }
    
    console.log();
  }

  private getStatusIcon(status: ModelStatus['status']): string {
    switch (status) {
      case 'available': return '✅';
      case 'rate_limited': return '⏰';
      case 'unavailable': return '❌';
      default: return '❓';
    }
  }

  private getStatusText(status: ModelStatus): string {
    switch (status.status) {
      case 'available': return 'Ready for use';
      case 'rate_limited': return 'Rate limited';
      case 'unavailable': return 'Not available';
      default: return 'Unknown';
    }
  }

  /**
   * Get recommendations based on current status
   */
  getRecommendations(statuses: ModelStatus[]): string[] {
    const recommendations: string[] = [];
    
    const available = statuses.filter(s => s.status === 'available');
    const freeAvailable = available.filter(s => s.costInfo.isFree);
    const paidAvailable = available.filter(s => !s.costInfo.isFree);
    
    if (available.length === 0) {
      recommendations.push('⚠️ No models currently available - wait for rate limits to reset');
      recommendations.push('🔍 Check if you\'re hitting limits in other applications');
    } else if (freeAvailable.length > 0) {
      recommendations.push(`💡 Use free models: ${freeAvailable.map(s => s.modelName).join(', ')}`);
    }
    
    if (paidAvailable.length > 0 && freeAvailable.length === 0) {
      recommendations.push(`💳 Consider paid models: ${paidAvailable.map(s => s.modelName).join(', ')}`);
    }
    
    const rateLimited = statuses.filter(s => s.status === 'rate_limited');
    if (rateLimited.length > 0) {
      const nextAvailable = Math.min(...rateLimited
        .filter(s => s.nextAvailableIn)
        .map(s => s.nextAvailableIn!));
      
      if (nextAvailable < Infinity) {
        recommendations.push(`⏰ Rate limits reset in ${nextAvailable}s`);
      }
      
      recommendations.push('📊 Note: Rate limits may be lower due to external API usage');
    }
    
    return recommendations;
  }
}
