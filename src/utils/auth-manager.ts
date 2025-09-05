/**
 * Enhanced authentication utility for the Code Review Agent
 * Supports Claude Code and API keys for all environments
 */

export interface AuthConfig {
  claudeCodeAvailable: boolean;
  apiKeyAvailable: boolean;
  preferredMethod: 'claude-code' | 'api-key';
  authMethod?: string;
}

export class AuthManager {
  /**
   * Check all available authentication methods and return the best option
   */
  static checkAuthentication(): AuthConfig {
    const claudeCodeAvailable = this.checkClaudeCodeAuth();
    const apiKeyAvailable = !!(process.env.ANTHROPIC_API_KEY);

    // Determine preferred method
    let preferredMethod: 'claude-code' | 'api-key';
    
    if (claudeCodeAvailable) {
      preferredMethod = 'claude-code';
    } else if (apiKeyAvailable) {
      preferredMethod = 'api-key';
    } else {
      preferredMethod = 'api-key'; // Will fail, but let error handler deal with it
    }

    return {
      claudeCodeAvailable,
      apiKeyAvailable,
      preferredMethod
    };
  }

  /**
   * Get the appropriate API key for Anthropic client
   */
  static getAnthropicConfig(): { apiKey?: string } {
    const auth = this.checkAuthentication();
    
    if (auth.preferredMethod === 'api-key' && auth.apiKeyAvailable) {
      return {
        apiKey: process.env.ANTHROPIC_API_KEY
      };
    }
    
    return {};
  }

  /**
   * Check if Claude Code CLI is available and authenticated
   */
  private static checkClaudeCodeAuth(): boolean {
    try {
      // Check if claude command exists first
      const version = execSync('claude --version', { 
        encoding: 'utf8', 
        stdio: 'pipe',
        timeout: 5000
      });
      
      // Test authentication using a simple model alias
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

  /**
   * Get a user-friendly description of the current authentication method
   */
  static getAuthDescription(): string {
    const auth = this.checkAuthentication();
    
    switch (auth.preferredMethod) {
      case 'claude-code':
        return '🔐 Claude Code (subscription)';
      case 'api-key':
        return '🔑 Anthropic API Key';
      default:
        return '❌ No Authentication';
    }
  }

  /**
   * Validate that we have some form of authentication available
   */
  static validateAuthentication(): boolean {
    const auth = this.checkAuthentication();
    return auth.claudeCodeAvailable || auth.apiKeyAvailable;
  }

  /**
   * Get setup instructions for missing authentication
   */
  static getSetupInstructions(): string[] {
    const auth = this.checkAuthentication();
    const instructions: string[] = [];

    if (!auth.claudeCodeAvailable && !auth.apiKeyAvailable) {
      instructions.push('No authentication method available. Choose one:');
      instructions.push('');
      instructions.push('Option 1 - Claude Code (Recommended for Local Development):');
      instructions.push('  • Run: claude setup-token');
      instructions.push('  • Higher rate limits with subscription');
      instructions.push('  • No API key needed');
      instructions.push('');
      instructions.push('Option 2 - API Key (Universal - Works Everywhere):');
      instructions.push('  • Get key: https://console.anthropic.com/settings/keys');
      instructions.push('  • Set: export ANTHROPIC_API_KEY=your-key');
      instructions.push('  • Works in any environment (local, CI/CD, etc.)');
    }

    return instructions;
  }
}

// Re-export for compatibility
import { execSync } from 'child_process';
