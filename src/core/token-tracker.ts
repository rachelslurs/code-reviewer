export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

export interface RateLimit {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerDay: number;
  tokensPerDay: number;
}

export class TokenTracker {
  private usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cost: 0
  };

  private readonly rateLimits: RateLimit = {
    requestsPerMinute: 5,
    tokensPerMinute: 40000,
    requestsPerDay: 1000,
    tokensPerDay: 500000
  };

  private requestTimes: number[] = [];
  private tokenUsageMinute: number[] = [];

  constructor() {}

  recordUsage(inputTokens: number, outputTokens: number): void {
    const totalTokens = inputTokens + outputTokens;
    
    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;
    this.usage.totalTokens += totalTokens;
    this.usage.cost += this.calculateCost(inputTokens, outputTokens);

    const now = Date.now();
    this.requestTimes.push(now);
    this.tokenUsageMinute.push(totalTokens);

    // Clean old entries (older than 1 minute)
    const oneMinuteAgo = now - 60000;
    this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);
    this.tokenUsageMinute = this.tokenUsageMinute.filter((_, index) => 
      this.requestTimes[index] !== undefined
    );
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    // Claude Sonnet 4 pricing (as of early 2025)
    const inputCostPer1K = 0.003;  // $3 per million tokens
    const outputCostPer1K = 0.015; // $15 per million tokens

    return (inputTokens * inputCostPer1K / 1000) + (outputTokens * outputCostPer1K / 1000);
  }

  canMakeRequest(estimatedTokens: number): { allowed: boolean; waitTime?: number; reason?: string } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Check requests per minute
    const recentRequests = this.requestTimes.filter(time => time > oneMinuteAgo).length;
    if (recentRequests >= this.rateLimits.requestsPerMinute) {
      const oldestRequest = Math.min(...this.requestTimes.filter(time => time > oneMinuteAgo));
      const waitTime = Math.ceil((oldestRequest + 60000 - now) / 1000);
      return { 
        allowed: false, 
        waitTime, 
        reason: `Rate limit: ${this.rateLimits.requestsPerMinute} requests per minute` 
      };
    }

    // Check tokens per minute
    const recentTokens = this.tokenUsageMinute
      .filter((_, index) => this.requestTimes[index] > oneMinuteAgo)
      .reduce((sum, tokens) => sum + tokens, 0);
    
    if (recentTokens + estimatedTokens > this.rateLimits.tokensPerMinute) {
      const oldestTokenUsage = this.requestTimes
        .filter(time => time > oneMinuteAgo)
        .sort()[0];
      const waitTime = Math.ceil((oldestTokenUsage + 60000 - now) / 1000);
      return { 
        allowed: false, 
        waitTime,
        reason: `Rate limit: ${this.rateLimits.tokensPerMinute} tokens per minute`
      };
    }

    return { allowed: true };
  }

  getUsageSummary(): TokenUsage {
    return { ...this.usage };
  }

  printUsageSummary(): void {
    console.log(`\n💰 Token Usage Summary:`);
    console.log(`   Input tokens: ${this.usage.inputTokens.toLocaleString()}`);
    console.log(`   Output tokens: ${this.usage.outputTokens.toLocaleString()}`);
    console.log(`   Total tokens: ${this.usage.totalTokens.toLocaleString()}`);
    console.log(`   Estimated cost: $${this.usage.cost.toFixed(4)}`);
  }

  printRateLimit(waitTime: number, reason: string): void {
    console.log(`\n⏱️  Rate Limit Hit:`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Wait time: ${waitTime} seconds`);
    console.log(`   Estimated time: ${new Date(Date.now() + waitTime * 1000).toLocaleTimeString()}`);
  }

  async waitForRateLimit(waitTime: number): Promise<void> {
    console.log(`\n⏳ Waiting ${waitTime} seconds for rate limit...`);
    
    // Show countdown
    for (let i = waitTime; i > 0; i--) {
      process.stdout.write(`\r⏳ ${i} seconds remaining...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    process.stdout.write('\r✅ Rate limit cleared!            \n');
  }

  // Multi-model compatibility methods
  addTokens(inputTokens: number, outputTokens: number, provider: string): void {
    this.recordUsage(inputTokens, outputTokens);
  }

  getStats(): { totalTokens: number; providerBreakdown: Record<string, number> } {
    return {
      totalTokens: this.usage.totalTokens,
      providerBreakdown: {
        'total': this.usage.totalTokens
      }
    };
  }
}
