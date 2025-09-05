/**
 * Enhanced error handling utility for the Code Review Agent
 * Provides user-friendly error messages and actionable solutions
 */

export interface ErrorContext {
  operation: string;
  filePath?: string;
  template?: string;
  authMethod?: 'claude-code' | 'api-key';
}

export class ErrorHandler {
  static handleAnthropicAPIError(error: any, context: ErrorContext): never {
    console.error('\n❌ Code Review Failed\n');

    // Parse Anthropic API errors
    if (error.status === 400 && error.error?.error) {
      const apiError = error.error.error;
      
      if (apiError.type === 'invalid_request_error') {
        if (apiError.message.includes('credit balance is too low')) {
          console.error('🏦 Insufficient API Credits');
          console.error('   Your Anthropic API credit balance is too low.\n');
          console.error('   💡 Quick fixes:');
          console.error('   • Add credits: https://console.anthropic.com/settings/billing');
          console.error('   • Switch to Claude Code: run `claude setup-token`');
          console.error('   • Use a different API key with available credits\n');
          process.exit(1);
        }
        
        if (apiError.message.includes('api key')) {
          console.error('🔑 Invalid API Key');
          console.error('   Your Anthropic API key is invalid or expired.\n');
          console.error('   💡 Solutions:');
          console.error('   • Check your API key at: https://console.anthropic.com/settings/keys');
          console.error('   • Use Claude Code instead: run `claude setup-token`');
          console.error('   • Set a valid API key: export ANTHROPIC_API_KEY=your-key\n');
          process.exit(1);
        }
        
        if (apiError.message.includes('max_tokens')) {
          console.error('📏 Token Limit Exceeded');
          console.error(`   File is too large to process: ${context.filePath || 'unknown'}\n`);
          console.error('   💡 Try:');
          console.error('   • Split large files into smaller chunks');
          console.error('   • Use a more specific template instead of "combined"');
          console.error('   • Exclude this file with .gitignore patterns\n');
          process.exit(1);
        }
      }
      
      if (apiError.type === 'rate_limit_error') {
        console.error('🚦 Rate Limit Exceeded');
        console.error('   You\'ve hit the Anthropic API rate limit.\n');
        console.error('   💡 Solutions:');
        console.error('   • Wait a few minutes and try again');
        console.error('   • Reduce concurrency with fewer files at once');
        console.error('   • Upgrade your API plan for higher limits\n');
        process.exit(1);
      }
    }

    // Generic API errors
    if (error.status === 401) {
      console.error('🔐 Authentication Failed');
      console.error('   API authentication was rejected.\n');
      console.error('   💡 Check:');
      console.error('   • API key is correct and active');
      console.error('   • Account has sufficient permissions');
      console.error('   • Try Claude Code: run `claude setup-token`\n');
      process.exit(1);
    }

    if (error.status === 429) {
      console.error('🚦 Too Many Requests');
      console.error('   Rate limit exceeded. Please wait before trying again.\n');
      process.exit(1);
    }

    if (error.status >= 500) {
      console.error('🌐 Anthropic API Service Error');
      console.error('   The Anthropic API is experiencing issues.\n');
      console.error('   💡 Try:');
      console.error('   • Wait a few minutes and retry');
      console.error('   • Check Anthropic status: https://status.anthropic.com');
      console.error('   • Use Claude Code if available\n');
      process.exit(1);
    }

    // Fallback for unknown API errors
    console.error('🔌 API Error');
    console.error(`   ${error.error?.error?.message || error.message || 'Unknown API error'}\n`);
    console.error('   💡 Try:');
    console.error('   • Check your internet connection');
    console.error('   • Verify your API key is valid');
    console.error('   • Use Claude Code: run `claude setup-token`\n');
    process.exit(1);
  }

  static handleClaudeCodeError(error: any, context: ErrorContext): never {
    console.error('\n❌ Claude Code Error\n');

    const stderr = error.stderr?.toString() || '';
    const stdout = error.stdout?.toString() || '';
    const message = error.message || '';

    // Command not found
    if (message.includes('claude: not found') || stderr.includes('command not found')) {
      console.error('🚫 Claude Code Not Installed');
      console.error('   The `claude` command is not available.\n');
      console.error('   💡 Solutions:');
      console.error('   • Install Claude Code from: https://claude.ai/download');
      console.error('   • Add Claude to your PATH');
      console.error('   • Use API key instead: set ANTHROPIC_API_KEY\n');
      process.exit(1);
    }

    // Authentication errors
    if (stdout.includes('authentication') || stdout.includes('setup-token')) {
      console.error('🔐 Claude Code Authentication Required');
      console.error('   You need to authenticate with Claude Code.\n');
      console.error('   💡 Quick fix:');
      console.error('   • Run: claude setup-token');
      console.error('   • Or use API key: set ANTHROPIC_API_KEY\n');
      process.exit(1);
    }

    // Rate limits (max_tokens usually means auth worked but hit limits)
    if (stdout.includes('max_tokens')) {
      console.error('📏 File Too Large for Claude Code');
      console.error(`   File exceeds token limits: ${context.filePath || 'unknown'}\n`);
      console.error('   💡 Try:');
      console.error('   • Use API with higher limits');
      console.error('   • Split large files into smaller pieces');
      console.error('   • Use a more focused template\n');
      process.exit(1);
    }

    // Timeout errors
    if (error.code === 'ETIMEDOUT' || message.includes('timeout')) {
      console.error('⏱️ Claude Code Timeout');
      console.error('   Operation took too long to complete.\n');
      console.error('   💡 Try:');
      console.error('   • Review smaller files');
      console.error('   • Check your internet connection');
      console.error('   • Use API key for better reliability\n');
      process.exit(1);
    }

    // Generic Claude Code errors
    console.error('🤖 Claude Code Error');
    console.error(`   ${message}\n`);
    if (stderr) {
      console.error(`   Details: ${stderr.trim()}\n`);
    }
    console.error('   💡 Try:');
    console.error('   • Run: claude setup-token');
    console.error('   • Use API key: set ANTHROPIC_API_KEY');
    console.error('   • Check Claude Code is up to date\n');
    process.exit(1);
  }

  static handleNetworkError(error: any, context: ErrorContext): never {
    console.error('\n❌ Network Error\n');

    if (error.code === 'ECONNREFUSED') {
      console.error('🌐 Connection Refused');
      console.error('   Cannot connect to the Anthropic API.\n');
      console.error('   💡 Check:');
      console.error('   • Your internet connection');
      console.error('   • Firewall/proxy settings');
      console.error('   • Anthropic API status\n');
      process.exit(1);
    }

    if (error.code === 'ENOTFOUND') {
      console.error('🔍 DNS Resolution Failed');
      console.error('   Cannot resolve Anthropic API hostname.\n');
      console.error('   💡 Check:');
      console.error('   • Internet connection');
      console.error('   • DNS settings');
      console.error('   • Try again in a few minutes\n');
      process.exit(1);
    }

    if (error.code === 'ETIMEDOUT') {
      console.error('⏱️ Connection Timeout');
      console.error('   Request to Anthropic API timed out.\n');
      console.error('   💡 Try:');
      console.error('   • Check internet connection');
      console.error('   • Review smaller files');
      console.error('   • Try again later\n');
      process.exit(1);
    }

    // Generic network error
    console.error('🌐 Network Issue');
    console.error(`   ${error.message || 'Unknown network error'}\n`);
    console.error('   💡 Check your internet connection and try again.\n');
    process.exit(1);
  }

  static handleAuthenticationError(context: ErrorContext): never {
    console.error('\n❌ Authentication Error\n');
    console.error('🔐 No Valid Authentication Method');
    console.error('   Neither Claude Code nor API key authentication is available.\n');
    console.error('   💡 Choose one:');
    console.error('   \n   Option 1 - Claude Code (Recommended):');
    console.error('   • Run: claude setup-token');
    console.error('   • Higher rate limits with subscription');
    console.error('   \n   Option 2 - API Key:');
    console.error('   • Get key: https://console.anthropic.com/settings/keys');
    console.error('   • Set: export ANTHROPIC_API_KEY=your-key');
    console.error('   • Or use: code-review --setup\n');
    process.exit(1);
  }

  static handleFileError(error: any, filePath: string): void {
    console.error(`\n⚠️ File Error: ${filePath}`);
    
    if (error.code === 'ENOENT') {
      console.error('   File not found or not accessible');
    } else if (error.code === 'EACCES') {
      console.error('   Permission denied');
    } else if (error.code === 'EISDIR') {
      console.error('   Expected file but found directory');
    } else {
      console.error(`   ${error.message || 'Unknown file error'}`);
    }
    
    console.error('   Skipping this file and continuing...\n');
  }

  static handleGenericError(error: any, context: ErrorContext): never {
    console.error('\n❌ Unexpected Error\n');
    console.error(`📍 Context: ${context.operation}`);
    if (context.filePath) {
      console.error(`📄 File: ${context.filePath}`);
    }
    console.error(`💥 Error: ${error.message || 'Unknown error'}\n`);
    
    console.error('   💡 Try:');
    console.error('   • Check the file exists and is readable');
    console.error('   • Verify your internet connection');
    console.error('   • Run with --allow-dirty if git issues');
    console.error('   • Report this error if it persists\n');
    
    // Only show stack trace in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }

  static warnNonCritical(message: string, suggestion?: string): void {
    console.warn(`\n⚠️ ${message}`);
    if (suggestion) {
      console.warn(`   💡 ${suggestion}`);
    }
    console.warn();
  }
}
