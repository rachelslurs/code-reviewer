#!/usr/bin/env bun

import { execSync } from 'child_process';
import { ConfigManager } from '../src/utils/config.js';
import { GitManager } from '../src/utils/git.js';
import { FileScanner } from '../src/core/file-scanner.js';
import { CodeReviewer } from '../src/core/reviewer.js';
import { qualityTemplate } from '../src/templates/quality.js';
import { securityTemplate } from '../src/templates/security.js';
import { performanceTemplate } from '../src/templates/performance.js';
import { typescriptTemplate } from '../src/templates/typescript.js';
import { combinedTemplate } from '../src/templates/combined.js';
import { CacheManager } from '../src/utils/cache-manager.js';
import { MultiModelReviewer } from '../src/core/multi-model-reviewer.js';
import { ReviewSessionManager } from '../src/utils/session-manager.js';
import { ModelStatusChecker } from '../src/utils/model-status-checker.js';
import { OutputFormatter } from '../src/utils/output-formatter.js';

async function main() {
  const args = process.argv.slice(2);
  
  // Handle help
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // Handle config commands
  if (args.includes('--config')) {
    showConfig();
    process.exit(0);
  }

  if (args.includes('--setup')) {
    await setupWizard();
    process.exit(0);
  }
  // Handle cache clearing first (before other logic)
  if (args.includes('--clear-cache')) {
    const cacheManager = new CacheManager();
    cacheManager.clearCache();
    process.exit(0);
  }
  
  // Handle model status command
  if (args.includes('--model-status') || args.includes('--status')) {
    await showModelStatus();
    process.exit(0);
  }

  // Load config
  const configManager = new ConfigManager();
  const config = configManager.load();

  // Check authentication methods (prioritize Claude Code)
  console.log('\n🔍 Checking authentication...');
  const hasClaudeCode = checkClaudeCodeAuth();
  const hasApiKey = !!(config.apiKey || process.env.ANTHROPIC_API_KEY);

  if (!hasClaudeCode && !hasApiKey) {
    console.error('❌ No authentication found. Either:');
    console.error('   1. Authenticate with Claude Code (recommended): claude setup-token');
    console.error('   2. Set API key with: code-review --setup');
    console.error('   3. Set ANTHROPIC_API_KEY environment variable');
    process.exit(1);
  }

  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  
  if (hasClaudeCode) {
    console.log('🔐 Using Claude Code authentication (subscription benefits applied)');
  } else {
    console.log('🔑 Using direct API key');
  }

  // Parse arguments more carefully
  const templateIndex = args.indexOf('--template');
  let template = config.defaultTemplate;
  if (templateIndex !== -1 && templateIndex < args.length - 1) {
    template = args[templateIndex + 1];
  }
  
  // Parse output format
  const outputIndex = args.indexOf('--output');
  let outputFormat = config.outputFormat;
  if (outputIndex !== -1 && outputIndex < args.length - 1) {
    outputFormat = args[outputIndex + 1] as 'terminal' | 'markdown' | 'json' | 'html';
  }
  
  // Parse output file
  const outputFileIndex = args.indexOf('--output-file');
  let outputFile = config.outputFile;
  if (outputFileIndex !== -1 && outputFileIndex < args.length - 1) {
    outputFile = args[outputFileIndex + 1];
  }
  
  // Remove format args to find the target path
  const filteredArgs = args.filter((arg, index) => {
    if (arg === '--template') return false;
    if (templateIndex !== -1 && index === templateIndex + 1) return false;
    if (arg === '--output') return false;
    if (outputIndex !== -1 && index === outputIndex + 1) return false;
    if (arg === '--output-file') return false;
    if (outputFileIndex !== -1 && index === outputFileIndex + 1) return false;
    return !arg.startsWith('--') && arg !== '-y';
  });
  
  const targetPath = filteredArgs[0] || '.';
  
  // Check for git override flags
  const allowDirty = args.includes('--allow-dirty') || args.includes('--no-git-check');
  const effectiveRequireCleanGit = config.requireCleanGit && !allowDirty;
  
  // Check cache options
  const noCache = args.includes('--no-cache');
  
  // Multi-model options
  const useMultiModel = args.includes('--multi-model');
  const comparisonMode = args.includes('--compare-models');
  const modelIndex = args.indexOf('--model');
  const specificModel = modelIndex !== -1 && modelIndex < args.length - 1 
    ? args[modelIndex + 1] 
    : null;
    
  // Session management and incremental options
  const resume = args.includes('--resume');
  const incremental = args.includes('--incremental') || args.includes('--changed-only');
  
  // Parse incremental options
  const compareWithIndex = args.indexOf('--compare-with');
  const compareWith = compareWithIndex !== -1 && compareWithIndex < args.length - 1 
    ? args[compareWithIndex + 1] 
    : 'last-commit';
    
  const includeUntracked = args.includes('--include-untracked');
  const includeStaged = args.includes('--include-staged');

  // Validate template
  const availableTemplates = ['quality', 'security', 'performance', 'typescript', 'combined', 'all'];
  if (!availableTemplates.includes(template)) {
    console.error(`❌ Template '${template}' not available. Available templates: ${availableTemplates.join(', ')}`);
    process.exit(1);
  }

  // Check git status if required
  const gitManager = new GitManager();
  const gitCheck = gitManager.checkWorkingDirectory(effectiveRequireCleanGit);
  if (!gitCheck.clean) {
    console.error(`❌ ${gitCheck.message}`);
    console.error('   Use --allow-dirty to bypass this check');
    process.exit(1);
  }

  console.log('🤖 Code Review Agent');
  console.log(`📁 Target: ${targetPath}`);
  console.log(`🎯 Template: ${template}`);
  
  if (gitManager.isGitRepo()) {
    console.log(`🌿 Branch: ${gitManager.getCurrentBranch()}`);
    if (allowDirty && gitManager.hasUncommittedChanges()) {
      console.log(`⚠️  Git: Dirty working directory (allowed)`);
    } else if (gitManager.hasUncommittedChanges()) {
      console.log(`✅ Git: Clean working directory`);
    }
  }

  // Scan files
  console.log('\n📂 Scanning files...');
  const scanner = new FileScanner(config);
  const sessionManager = new ReviewSessionManager();
  
  try {
    const scanResult = scanner.scanPath(targetPath);
    
    if (scanResult.files.length === 0) {
      console.log('❌ No reviewable files found.');
      process.exit(0);
    }
    
    let filesToReview = scanResult.files;
    
    // Apply incremental filtering if requested
    if (incremental) {
      filesToReview = sessionManager.getIncrementalFiles(scanResult.files, {
        compareWith,
        includeUntracked,
        includeStaged
      });
      
      if (filesToReview.length === 0) {
        console.log('✅ No changed files to review!');
        process.exit(0);
      }
    }

    scanner.printScanSummary({ 
      ...scanResult, 
      files: filesToReview 
    });

    // Ask for confirmation
    if (!args.includes('--yes') && !args.includes('-y')) {
      const shouldContinue = await askConfirmation(
        `\nProceed with review of ${filesToReview.length} files?`
      );
      if (!shouldContinue) {
        console.log('Review cancelled.');
        process.exit(0);
      }
    }

    // Start review - choose between single model or multi-model
    let reviewer: any;
    
    if (useMultiModel || comparisonMode) {
      // Multi-model reviewer
      const geminiApiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      
      if (!hasClaudeCode && !apiKey && !geminiApiKey) {
        console.error('❌ Multi-model mode requires at least one API key');
        console.error('   Set GEMINI_API_KEY for Gemini models');
        process.exit(1);
      }
      
      // Configure multi-model settings
      const multiModelConfig = {
        ...config.multiModel!,
        comparisonMode: comparisonMode || config.multiModel!.comparisonMode
      };
      
      if (specificModel) {
        multiModelConfig.primaryModel = specificModel;
      }
      
      reviewer = new MultiModelReviewer(
        {
          anthropic: hasClaudeCode ? undefined : apiKey,
          gemini: geminiApiKey
        },
        hasClaudeCode,
        multiModelConfig
      );
    } else {
      // Traditional single model reviewer
      reviewer = new CodeReviewer(
        hasClaudeCode ? undefined : apiKey,
        hasClaudeCode,
        !noCache
      );
    }
    
    // Initialize session management
    const session = await sessionManager.startSession(
      filesToReview,
      template,
      targetPath,
      {
        outputFormat,
        outputFile,
        noCache,
        resume
      }
    );
    
    // Get files to review (from session if resuming)
    const finalFilesToReview = resume ? sessionManager.getRemainingFiles() : filesToReview;
    
    if (finalFilesToReview.length === 0) {
      console.log('✅ All files already completed!');
      const completedResults = sessionManager.getCompletedResults();
      if (completedResults.length > 0) {
        reviewer.printReviewSummary(completedResults);
      }
      sessionManager.completeSession();
      process.exit(0);
    }
    
    // Select review template(s)
    const templates = getTemplates(template);
    const allResults: any[] = [];
    
    // Add any previously completed results
    const previousResults = sessionManager.getCompletedResults();
    allResults.push(...previousResults);
    
    for (const reviewTemplate of templates) {
      console.log(`\n🎆 Running ${reviewTemplate.name} review...`);
      
      const results = await reviewer.reviewMultipleFiles(
        finalFilesToReview,
        reviewTemplate,
        3, // Concurrency level
        (current, total, result) => {
          const status = result.hasIssues ? '🔍 Issues found' : '✅ Clean';
          const progress = sessionManager.getProgress();
          console.log(`[${progress.completed + current}/${progress.total}] ${result.filePath}: ${status}`);
        }
      );
      
      // Update session progress
      sessionManager.markFilesCompleted(results);
      allResults.push(...results);
    }
    
    // Complete the session
    sessionManager.completeSession();

    // Handle results based on output format
    if (outputFormat === 'terminal') {
      // Skip detailed results since we're streaming them
      console.log('\n' + '='.repeat(80));
      console.log('📊 FINAL SUMMARY (Detailed results streamed above)');
      console.log('='.repeat(80));
      reviewer.printReviewSummary(allResults);
    } else {
      // For non-terminal formats, save to file
      console.log('\n' + '='.repeat(80));
      console.log(`📊 GENERATING ${outputFormat.toUpperCase()} REPORT`);
      console.log('='.repeat(80));
      
      await OutputFormatter.saveResults(allResults, {
        format: outputFormat,
        outputFile: outputFile,
        includeMetadata: true
      });
      
      reviewer.printReviewSummary(allResults);
    }

  } catch (error) {
    console.error('❌ Error during review:', error);
    process.exit(1);
  }

  // Ensure clean exit
  setTimeout(() => {
    console.log('\n✅ Review completed successfully!');
    process.exit(0);
  }, 500); // Give a brief moment for any final operations
}

function printHelp(): void {
  console.log(`
🤖 Code Review Agent

USAGE:
  code-review [path] [options]

ARGUMENTS:
  path                 Path to file or directory to review (default: current directory)

OPTIONS:
  --template <name>    Review template to use (default: quality)
                       Available: quality
  --yes, -y           Skip confirmation prompt
  --config            Show current configuration
  --setup             Run interactive setup wizard
  --status            Show model status and rate limits
  --model-status      Alias for --status
  --help, -h          Show this help message

EXAMPLES:
  code-review                          # Review current directory with default template
  code-review ./src                    # Review src directory
  code-review component.tsx            # Review single file
  code-review --template quality ./src # Review with specific template
  code-review --setup                  # Configure API key and settings

CONFIGURATION:
  Configuration is stored in .codereview.json in your project root.
  Use --setup to create or modify configuration interactively.

AUTHENTICATION:
  Claude Code (recommended):
    claude setup-token                # Authenticate with your subscription
  
  Direct API (alternative):
    ANTHROPIC_API_KEY              # Environment variable
    code-review --setup            # Interactive configuration
`);
}

function showConfig(): void {
  const configManager = new ConfigManager();
  const config = configManager.load();
  const hasClaudeCode = checkClaudeCodeAuth();
  
  console.log('\n📋 Current Configuration:');
  console.log(`   Config file: ${configManager.exists() ? '✅ Found' : '❌ Not found (using defaults)'}`);  
  console.log(`   Claude Code auth: ${hasClaudeCode ? '✅ Authenticated' : '❌ Not authenticated'}`);  
  console.log(`   API Key: ${config.apiKey ? '✅ Set in config' : process.env.ANTHROPIC_API_KEY ? '✅ Set in environment' : '❌ Not set'}`);
  console.log(`   Max file size: ${Math.round(config.maxFileSize / 1024)}KB`);
  console.log(`   Default template: ${config.defaultTemplate}`);
  console.log(`   Output format: ${config.outputFormat}`);
  console.log(`   Require clean git: ${config.requireCleanGit ? '✅' : '❌'}`);
  console.log(`   Ignore patterns: ${config.ignorePatterns.length} patterns`);
}

async function showModelStatus(): Promise<void> {
  console.log('\n🔍 Checking model status...');
  
  const configManager = new ConfigManager();
  const config = configManager.load();
  const hasClaudeCode = checkClaudeCodeAuth();
  
  // Initialize status checker
  const statusChecker = new ModelStatusChecker();
  
  // Determine available models based on authentication
  const availableModels = [];
  
  if (hasClaudeCode || config.apiKey || process.env.ANTHROPIC_API_KEY) {
    availableModels.push('claude-sonnet', 'claude-haiku');
  }
  
  if (config.geminiApiKey || process.env.GEMINI_API_KEY) {
    availableModels.push('gemini-pro', 'gemini-flash');
  }
  
  if (availableModels.length === 0) {
    console.error('❌ No API keys configured. Use --setup to configure authentication.');
    return;
  }
  
  try {
    // Get status for all models
    const statuses = await statusChecker.getModelStatuses(availableModels);
    
    // Display comprehensive report
    statusChecker.displayStatusReport(statuses);
    
    // Show recommendations
    const recommendations = statusChecker.getRecommendations(statuses);
    if (recommendations.length > 0) {
      console.log('💡 Recommendations:');
      recommendations.forEach(rec => console.log(`   ${rec}`));
      console.log();
    }
    
  } catch (error) {
    console.error('❌ Error checking model status:', error);
  }
}

async function setupWizard(): Promise<void> {
  console.log('\n🛠️  Code Review Agent Setup\n');
  
  const configManager = new ConfigManager();
  const currentConfig = configManager.load();
  const hasClaudeCode = checkClaudeCodeAuth();

  // Show authentication status
  if (hasClaudeCode) {
    console.log('✅ Claude Code authentication detected - you\'re all set!');
    console.log('   Using your subscription with higher rate limits.\n');
  } else {
    console.log('❌ Claude Code not authenticated');
    console.log('   Recommended: Run `claude setup-token` to use your subscription benefits');
    console.log('   Alternative: Set up an API key below\n');
  }

  // API Key (optional if Claude Code is authenticated)
  let apiKey = '';
  if (!hasClaudeCode || await askConfirmation('Do you want to set up an API key anyway?', false)) {
    apiKey = await askInput(
      'Enter your Anthropic API key (or press Enter to skip):',
      currentConfig.apiKey
    );
  }

  // Max file size
  const maxFileSizeKB = await askInput(
    `Maximum file size in KB (current: ${Math.round(currentConfig.maxFileSize / 1024)}):`,
    Math.round(currentConfig.maxFileSize / 1024).toString()
  );

  // Default template
  const defaultTemplate = await askInput(
    `Default review template (current: ${currentConfig.defaultTemplate}):`,
    currentConfig.defaultTemplate
  );

  // Require clean git
  const requireCleanGit = await askConfirmation(
    `Require clean git working directory before review? (current: ${currentConfig.requireCleanGit})`,
    currentConfig.requireCleanGit
  );

  // Save configuration
  const newConfig = {
    ...currentConfig,
    ...(apiKey && { apiKey }),
    maxFileSize: parseInt(maxFileSizeKB) * 1024,
    defaultTemplate: defaultTemplate as any,
    requireCleanGit
  };

  configManager.save(newConfig);
  console.log('\n✅ Configuration saved!');
}

// Helper functions for user input
async function askInput(question: string, defaultValue?: string): Promise<string> {
  process.stdout.write(`${question} ${defaultValue ? `[${defaultValue}] ` : ''}`);
  
  return new Promise((resolve) => {
    process.stdin.once('data', (data) => {
      const input = data.toString().trim();
      resolve(input || defaultValue || '');
    });
  });
}

async function askConfirmation(question: string, defaultValue: boolean = true): Promise<boolean> {
  const defaultText = defaultValue ? '[Y/n]' : '[y/N]';
  process.stdout.write(`${question} ${defaultText} `);
  
  return new Promise((resolve) => {
    process.stdin.once('data', (data) => {
      const input = data.toString().trim().toLowerCase();
      if (input === '') {
        resolve(defaultValue);
      } else {
        resolve(input === 'y' || input === 'yes');
      }
    });
  });
}

function getTemplates(templateName: string) {
  switch (templateName) {
    case 'quality':
      return [qualityTemplate];
    case 'security':
      return [securityTemplate];
    case 'performance':
      return [performanceTemplate];
    case 'typescript':
      return [typescriptTemplate];
    case 'combined':
      return [combinedTemplate];
    case 'all':
      return [qualityTemplate, securityTemplate, performanceTemplate, typescriptTemplate];
    default:
      throw new Error(`Unknown template: ${templateName}`);
  }
}

function checkClaudeCodeAuth(): boolean {
  try {
    // Check if claude command exists and get version
    const version = execSync('claude --version', { 
      encoding: 'utf8', 
      stdio: 'pipe',
      timeout: 5000
    });
    
    console.log(`🔍 Detected Claude Code: ${version.trim()}`);
    
    // Test authentication using a simple model alias that should exist
    const testResult = execSync('echo "Hello" | claude --print --model sonnet', {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 15000 // 15 second timeout for API call
    });
    
    // Check if we got a successful response (any text response means auth worked)
    const lowerResult = testResult.toLowerCase();
    const hasAuthError = lowerResult.includes('authentication') ||
                        lowerResult.includes('unauthorized') ||
                        lowerResult.includes('not authenticated') ||
                        lowerResult.includes('setup-token') ||
                        lowerResult.includes('login required');
    
    // Max tokens error means auth worked, just wrong model limits
    const hasMaxTokensError = lowerResult.includes('max_tokens');
    
    const isAuthenticated = !hasAuthError || hasMaxTokensError;
    
    console.log(`🔐 Authentication test: ${isAuthenticated ? 'Passed' : 'Failed - run claude setup-token'}`);
    return isAuthenticated;
    
  } catch (error: any) {
    console.log(`❌ Claude Code check failed: ${error.message}`);
    
    // Show more details about the error
    if (error.stderr) {
      console.log(`   stderr: ${error.stderr.toString()}`);
    }
    if (error.stdout) {
      console.log(`   stdout: ${error.stdout.toString()}`);
      
      // Check if the error is just max_tokens (which means auth actually works)
      const stdout = error.stdout.toString().toLowerCase();
      if (stdout.includes('max_tokens')) {
        console.log(`🔐 Authentication actually works (just a max_tokens limit issue)`);
        return true;
      }
      
      // Check if it's a model not found error (which also means auth works)
      if (stdout.includes('not_found_error') && stdout.includes('model')) {
        console.log(`🔐 Authentication works (just wrong model name)`);
        return true;
      }
    }
    
    return false;
  }
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
