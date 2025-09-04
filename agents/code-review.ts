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
import { InteractiveSelector } from '../src/utils/interactive-selector.js';
import { FileWatcher } from '../src/utils/file-watcher.js';
import { OutputFormatter } from '../src/utils/output-formatter.js';

// CLI Options Interface
interface CLIOptions {
  // Core options
  template: 'quality' | 'security' | 'performance' | 'typescript' | 'combined' | 'all';
  output: 'terminal' | 'markdown' | 'json' | 'html';
  outputFile?: string;
  
  // Multi-model options
  multiModel: boolean;
  compareModels: boolean;
  model?: string;
  autoFallback: boolean;
  
  // Performance & efficiency
  incremental: boolean;
  compareWith: string;
  resume: boolean;
  noCache: boolean;
  clearCache: boolean;
  
  // Developer experience
  interactive: boolean;
  watch: boolean;
  ciMode: boolean;
  yes: boolean;
  allowDirty: boolean;
  
  // Status & config
  status: boolean;
  config: boolean;
  setup: boolean;
  help: boolean;
  
  // Target path
  targetPath: string;
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const options = parseArguments(args);
  
  // Handle special commands that exit early
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  
  if (options.config) {
    showConfig();
    process.exit(0);
  }
  
  if (options.setup) {
    await setupWizard();
    process.exit(0);
  }
  
  if (options.clearCache) {
    const cacheManager = new CacheManager();
    cacheManager.clearCache();
    console.log('✅ Cache cleared successfully!');
    process.exit(0);
  }
  
  if (options.status) {
    await showModelStatus();
    process.exit(0);
  }
  
  // Load configuration
  const configManager = new ConfigManager();
  const config = configManager.load();
  
  // Override config with CLI options
  const effectiveConfig = {
    ...config,
    defaultTemplate: options.template as any,
    outputFormat: options.output,
    outputFile: options.outputFile
  };
  
  // Check git status if required
  const gitManager = new GitManager();
  const effectiveRequireCleanGit = config.requireCleanGit && !options.allowDirty;
  const gitCheck = gitManager.checkWorkingDirectory(effectiveRequireCleanGit);
  
  if (!gitCheck.clean) {
    console.error(`❌ ${gitCheck.message}`);
    console.error('   Use --allow-dirty to bypass this check');
    process.exit(1);
  }
  
  // Determine authentication and model requirements
  const authInfo = await determineAuthentication(options, config);
  
  // Display startup information
  displayStartupInfo(options, gitManager, authInfo);
  
  // Scan files
  console.log('\n📂 Scanning files...');
  const scanner = new FileScanner(effectiveConfig);
  const sessionManager = new ReviewSessionManager();
  
  try {
    const scanResult = scanner.scanPath(options.targetPath);
    
    if (scanResult.files.length === 0) {
      console.log('❌ No reviewable files found.');
      process.exit(0);
    }
    
    let filesToReview = scanResult.files;
    
    // Apply incremental filtering if requested
    if (options.incremental) {
      filesToReview = sessionManager.getIncrementalFiles(scanResult.files, {
        compareWith: options.compareWith,
        includeUntracked: false,
        includeStaged: false
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
    
    // Interactive file selection (after incremental filtering)
    if (options.interactive && !options.ciMode) {
      const selection = await InteractiveSelector.selectFiles(filesToReview);
      if (selection.cancelled) {
        console.log('Review cancelled.');
        process.exit(0);
      }
      filesToReview = selection.selectedFiles;
      
      if (filesToReview.length === 0) {
        console.log('No files selected for review.');
        process.exit(0);
      }
    }
    
    // Ask for confirmation (skip in CI mode or if interactive selection already happened)
    if (!options.yes && !options.ciMode && !options.interactive) {
      const shouldContinue = await askConfirmation(
        `\nProceed with review of ${filesToReview.length} files?`
      );
      if (!shouldContinue) {
        console.log('Review cancelled.');
        process.exit(0);
      }
    }
    
    // Initialize reviewer based on options
    const reviewer: any = await initializeReviewer(options, authInfo, config);
    
    // Initialize session management
    const session = await sessionManager.startSession(
      filesToReview,
      options.template,
      options.targetPath,
      {
        outputFormat: options.output,
        outputFile: options.outputFile,
        noCache: options.noCache,
        resume: options.resume
      }
    );
    
    // Handle watch mode
    if (options.watch) {
      const reviewTemplate = getTemplates(options.template)[0];
      const watcher = new FileWatcher({
        template: reviewTemplate,
        config: effectiveConfig,
        reviewer,
        debounceMs: 2000
      });
      
      await watcher.startWatching([options.targetPath]);
      return; // Keep watching (process stays alive)
    }
    
    // Get files to review (from session if resuming)
    const finalFilesToReview = options.resume ? sessionManager.getRemainingFiles() : filesToReview;
    
    if (finalFilesToReview.length === 0) {
      console.log('✅ All files already completed!');
      const completedResults = sessionManager.getCompletedResults();
      if (completedResults.length > 0) {
        reviewer.printReviewSummary(completedResults);
      }
      sessionManager.completeSession();
      process.exit(0);
    }
    
    // Run reviews
    const allResults: any[] = await runReviews(
      reviewer,
      finalFilesToReview,
      options.template,
      sessionManager
    );
    
    // Complete the session
    sessionManager.completeSession();
    
    // Handle results based on output format
    await handleResults(allResults, options, reviewer);
    
    // In CI mode, set exit code based on issue severity
    if (options.ciMode) {
      const exitCode = determineExitCode(allResults);
      process.exit(exitCode);
    }
    
  } catch (error) {
    console.error('❌ Error during review:', error);
    process.exit(1);
  }
  
  // Ensure clean exit
  setTimeout(() => {
    console.log('\n✅ Review completed successfully!');
    process.exit(0);
  }, 500);
}

function parseArguments(args: string[]): CLIOptions {
  const options: CLIOptions = {
    // Core options
    template: 'quality',
    output: 'terminal',
    
    // Multi-model options
    multiModel: false,
    compareModels: false,
    autoFallback: false,
    
    // Performance & efficiency
    incremental: false,
    compareWith: 'last-commit',
    resume: false,
    noCache: false,
    clearCache: false,
    
    // Developer experience
    interactive: false,
    watch: false,
    ciMode: false,
    yes: false,
    allowDirty: false,
    
    // Status & config
    status: false,
    config: false,
    setup: false,
    help: false,
    
    // Target path
    targetPath: '.'
  };
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--config':
        options.config = true;
        break;
      case '--setup':
        options.setup = true;
        break;
      case '--clear-cache':
        options.clearCache = true;
        break;
      case '--status':
      case '--model-status':
        options.status = true;
        break;
      case '--template':
        if (i + 1 < args.length) {
          options.template = args[++i] as any;
        }
        break;
      case '--output':
        if (i + 1 < args.length) {
          options.output = args[++i] as any;
        }
        break;
      case '--output-file':
        if (i + 1 < args.length) {
          options.outputFile = args[++i];
        }
        break;
      case '--model':
        if (i + 1 < args.length) {
          options.model = args[++i];
        }
        break;
      case '--compare-with':
        if (i + 1 < args.length) {
          options.compareWith = args[++i];
        }
        break;
      case '--multi-model':
        options.multiModel = true;
        break;
      case '--compare-models':
        options.compareModels = true;
        break;
      case '--auto-fallback':
        options.autoFallback = true;
        break;
      case '--incremental':
      case '--changed-only':
        options.incremental = true;
        break;
      case '--resume':
        options.resume = true;
        break;
      case '--no-cache':
        options.noCache = true;
        break;
      case '--interactive':
      case '-i':
        options.interactive = true;
        break;
      case '--watch':
      case '-w':
        options.watch = true;
        break;
      case '--ci-mode':
        options.ciMode = true;
        break;
      case '--yes':
      case '-y':
        options.yes = true;
        break;
      case '--allow-dirty':
      case '--no-git-check':
        options.allowDirty = true;
        break;
      default:
        // If it's not a flag and doesn't start with --, it's likely the target path
        if (!arg.startsWith('--') && !arg.startsWith('-')) {
          options.targetPath = arg;
        }
        break;
    }
  }
  
  return options;
}

async function determineAuthentication(options: CLIOptions, config: any) {
  console.log('\n🔍 Checking authentication...');
  
  const hasClaudeCode = checkClaudeCodeAuth();
  const hasApiKey = !!(config.apiKey || process.env.ANTHROPIC_API_KEY);
  const hasGeminiKey = !!(config.geminiApiKey || process.env.GEMINI_API_KEY);
  
  // Determine which models we need
  let needsClaude = false;
  let needsGemini = false;
  let modelFallbackChain: string[] = [];
  
  if (options.autoFallback) {
    modelFallbackChain = getModelPriority(options.template);
    needsClaude = modelFallbackChain.some(m => m.startsWith('claude-'));
    needsGemini = modelFallbackChain.some(m => m.startsWith('gemini-'));
  } else if (options.model) {
    needsClaude = options.model.startsWith('claude-');
    needsGemini = options.model.startsWith('gemini-');
    modelFallbackChain = [options.model];
  } else if (options.multiModel || options.compareModels) {
    needsClaude = true;
    needsGemini = true;
  } else {
    needsClaude = true;
    modelFallbackChain = ['claude-sonnet'];
  }
  
  // Check authentication
  const claudeAvailable = hasClaudeCode || hasApiKey;
  const geminiAvailable = hasGeminiKey;
  
  if (options.autoFallback) {
    // Filter fallback chain to only include models we have auth for
    const availableModels = modelFallbackChain.filter(model => {
      if (model.startsWith('claude-')) return claudeAvailable;
      if (model.startsWith('gemini-')) return geminiAvailable;
      return false;
    });
    
    if (availableModels.length === 0) {
      console.error('❌ No authentication available for any fallback models:');
      if (needsClaude && !claudeAvailable) {
        console.error('   Claude: claude setup-token OR set ANTHROPIC_API_KEY');
      }
      if (needsGemini && !geminiAvailable) {
        console.error('   Gemini: set GEMINI_API_KEY (get from: https://aistudio.google.com/app/apikey)');
      }
      process.exit(1);
    }
    
    modelFallbackChain = availableModels;
    console.log(`✅ Available models: ${modelFallbackChain.join(' → ')}`);
  } else {
    // Strict authentication check for non-fallback modes
    const errors = [];
    
    if (needsClaude && !claudeAvailable) {
      errors.push('Claude authentication required:');
      errors.push('  • claude setup-token (recommended) OR');
      errors.push('  • Set ANTHROPIC_API_KEY environment variable');
    }
    
    if (needsGemini && !geminiAvailable) {
      errors.push('Gemini authentication required:');
      errors.push('  • Set GEMINI_API_KEY environment variable');
      errors.push('  • Get API key from: https://aistudio.google.com/app/apikey');
    }
    
    if (errors.length > 0) {
      console.error('❌ Missing required authentication:');
      errors.forEach(error => console.error('   ' + error));
      console.error('\n💡 Try --auto-fallback to use any available models');
      console.error('💡 For Gemini-only: code-review --model gemini-flash');
      console.error('💡 For Claude-only: code-review --model claude-sonnet');
      process.exit(1);
    }
  }
  
  // Show authentication methods
  const authMethods = [];
  if (hasClaudeCode && needsClaude) {
    authMethods.push('🔐 Claude Code (subscription)');
  } else if (hasApiKey && needsClaude) {
    authMethods.push('🔑 Claude API');
  }
  
  if (hasGeminiKey && needsGemini) {
    authMethods.push('🔑 Gemini API');
  }
  
  if (authMethods.length > 0) {
    console.log(`✅ Authentication: ${authMethods.join(', ')}`);
  }
  
  if (options.autoFallback) {
    console.log(`🎆 Auto-fallback: Will try models until one works`);
  } else if (options.model) {
    console.log(`🎯 Model: ${options.model}`);
  }
  
  return {
    hasClaudeCode,
    hasApiKey,
    hasGeminiKey,
    claudeAvailable,
    geminiAvailable,
    modelFallbackChain,
    apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    geminiApiKey: config.geminiApiKey || process.env.GEMINI_API_KEY
  };
}

function displayStartupInfo(options: CLIOptions, gitManager: GitManager, authInfo: any) {
  console.log('🤖 Code Review Agent');
  console.log(`📁 Target: ${options.targetPath}`);
  console.log(`🎯 Template: ${options.template}`);
  
  if (gitManager.isGitRepo()) {
    console.log(`🌿 Branch: ${gitManager.getCurrentBranch()}`);
    if (options.allowDirty && gitManager.hasUncommittedChanges()) {
      console.log(`⚠️  Git: Dirty working directory (allowed)`);
    } else if (gitManager.hasUncommittedChanges()) {
      console.log(`✅ Git: Clean working directory`);
    }
  }
}

async function initializeReviewer(options: CLIOptions, authInfo: any, config: any) {
  if (options.autoFallback) {
    // Auto-fallback reviewer using multi-model infrastructure
    const fallbackConfig = {
      primaryModel: authInfo.modelFallbackChain[0],
      fallbackModels: authInfo.modelFallbackChain.slice(1),
      comparisonMode: false,
      timeout: 60000,
      maxRetries: authInfo.modelFallbackChain.length,
      autoFallback: true,
      templateMappings: {
        'security': 'claude-sonnet',
        'quality': 'gemini-flash',
        'performance': 'gemini-flash', 
        'typescript': 'gemini-flash',
        'combined': 'claude-sonnet'
      }
    };
    
    console.log(`🚀 Initializing auto-fallback reviewer with ${authInfo.modelFallbackChain.length} models`);
    
    return new MultiModelReviewer(
      {
        anthropic: authInfo.hasClaudeCode ? undefined : authInfo.apiKey,
        gemini: authInfo.geminiApiKey
      },
      authInfo.hasClaudeCode,
      fallbackConfig
    );
  } else if (options.multiModel || options.compareModels) {
    // Multi-model reviewer
    const multiModelConfig = {
      ...config.multiModel!,
      comparisonMode: options.compareModels || config.multiModel!.comparisonMode
    };
    
    if (options.model) {
      multiModelConfig.primaryModel = options.model;
    }
    
    return new MultiModelReviewer(
      {
        anthropic: authInfo.hasClaudeCode ? undefined : authInfo.apiKey,
        gemini: authInfo.geminiApiKey
      },
      authInfo.hasClaudeCode,
      multiModelConfig
    );
  } else {
    // Traditional single model reviewer
    const targetModel = options.model || authInfo.modelFallbackChain[0] || 'claude-sonnet';
    
    if (targetModel.startsWith('gemini-')) {
      // For Gemini-only mode, use MultiModelReviewer with Gemini config
      const geminiConfig = {
        primaryModel: targetModel,
        fallbackModels: [],
        comparisonMode: false,
        timeout: 60000,
        maxRetries: 3,
        templateMappings: {
          'security': 'claude-sonnet',
          'quality': 'gemini-flash',
          'performance': 'gemini-flash', 
          'typescript': 'gemini-flash',
          'combined': 'claude-sonnet'
        }
      };
      
      return new MultiModelReviewer(
        {
          anthropic: undefined,
          gemini: authInfo.geminiApiKey
        },
        false,
        geminiConfig
      );
    } else {
      // Traditional Claude reviewer
      return new CodeReviewer(
        authInfo.hasClaudeCode ? undefined : authInfo.apiKey,
        authInfo.hasClaudeCode,
        !options.noCache
      );
    }
  }
}

async function runReviews(reviewer: any, filesToReview: any[], template: string, sessionManager: ReviewSessionManager) {
  const templates = getTemplates(template);
  const allResults: any[] = [];
  
  // Add any previously completed results
  const previousResults = sessionManager.getCompletedResults();
  allResults.push(...previousResults);
  
  for (const reviewTemplate of templates) {
    console.log(`\n🎆 Running ${reviewTemplate.name} review...`);
    
    const results = await reviewer.reviewMultipleFiles(
      filesToReview,
      reviewTemplate,
      3, // Concurrency level
      (current: number, total: number, result: any) => {
        const status = result.hasIssues ? '🔍 Issues found' : '✅ Clean';
        const progress = sessionManager.getProgress();
        console.log(`[${progress.completed + current}/${progress.total}] ${result.filePath}: ${status}`);
      }
    );
    
    // Update session progress
    sessionManager.markFilesCompleted(results);
    allResults.push(...results);
  }
  
  return allResults;
}

async function handleResults(allResults: any[], options: CLIOptions, reviewer: any) {
  if (options.output === 'terminal') {
    // Skip detailed results since we're streaming them
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL SUMMARY (Detailed results streamed above)');
    console.log('='.repeat(80));
    reviewer.printReviewSummary(allResults);
  } else {
    // For non-terminal formats, save to file
    console.log('\n' + '='.repeat(80));
    console.log(`📊 GENERATING ${options.output.toUpperCase()} REPORT`);
    console.log('='.repeat(80));
    
    await OutputFormatter.saveResults(allResults, {
      format: options.output,
      outputFile: options.outputFile,
      includeMetadata: true
    });
    
    reviewer.printReviewSummary(allResults);
  }
}

function determineExitCode(allResults: any[]): number {
  const criticalIssues = allResults.filter(r => 
    r.hasIssues && (r.feedback.includes('Critical') || r.feedback.includes('🚨'))
  ).length;
  
  const highIssues = allResults.filter(r => 
    r.hasIssues && (r.feedback.includes('High') || r.feedback.includes('⚠️')) && 
    !(r.feedback.includes('Critical') || r.feedback.includes('🚨'))
  ).length;
  
  if (criticalIssues > 0) {
    console.error(`\n❌ CI: Build failed due to ${criticalIssues} critical issues`);
    return 1;
  } else if (highIssues > 0) {
    console.log(`\n⚠️ CI: Warning - ${highIssues} high priority issues found`);
    return 0; // Exit 0 for warnings (don't fail build)
  }
  
  return 0;
}

function getModelPriority(template: string): string[] {
  const priorities: { [key: string]: string[] } = {
    'security': ['claude-sonnet', 'claude-haiku', 'gemini-pro', 'gemini-flash'],
    'combined': ['claude-sonnet', 'gemini-pro', 'claude-haiku', 'gemini-flash'], 
    'quality': ['gemini-flash', 'claude-haiku', 'gemini-pro', 'claude-sonnet'],
    'performance': ['gemini-flash', 'gemini-pro', 'claude-haiku', 'claude-sonnet'],
    'typescript': ['gemini-flash', 'claude-haiku', 'gemini-pro', 'claude-sonnet']
  };
  return priorities[template] || priorities['quality'];
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

function printHelp(): void {
  console.log(`
🤖 Code Review Agent

USAGE:
  code-review [path] [options]

ARGUMENTS:
  path                 Path to file or directory to review (default: current directory)

CORE OPTIONS:
  --template <name>    Review template: quality, security, performance, typescript, combined, all
  --output <format>    Output format: terminal, markdown, json, html
  --output-file <file> Save results to file

MULTI-MODEL OPTIONS:
  --multi-model        Enable smart multi-model selection
  --compare-models     Compare results from multiple AI models
  --model <name>       Force specific model: claude-sonnet, claude-haiku, gemini-pro, gemini-flash
  --auto-fallback      Smart model selection with automatic fallbacks when models unavailable

PERFORMANCE & EFFICIENCY:
  --incremental        Only review changed files
  --compare-with <ref> Compare with branch/commit
  --resume             Resume interrupted review session
  --no-cache           Disable caching
  --clear-cache        Clear review cache

DEVELOPER EXPERIENCE:
  --interactive, -i    Interactive file selection
  --watch, -w          Watch mode for continuous review
  --ci-mode            CI-optimized mode (no prompts, exit codes)
  --yes, -y            Skip confirmation prompts
  --allow-dirty        Allow uncommitted changes

STATUS & CONFIG:
  --status             Show model status and rate limits
  --model-status       Alias for --status
  --config             Show current configuration
  --setup              Run interactive setup wizard
  --help, -h           Show this help message

EXAMPLES:
  code-review                                    # Review current directory with default template
  code-review ./src                              # Review src directory
  code-review --template security ./src          # Security-focused review
  code-review --multi-model --template combined ./src  # Comprehensive multi-model review
  code-review --interactive --template quality ./src   # Interactive file selection
  code-review --watch --template combined ./src        # Watch mode for continuous development
  code-review --auto-fallback --template security ./src # Auto-fallback model selection
  code-review --incremental --template combined ./     # Incremental review (only changed files)
  code-review --resume ./src                           # Resume interrupted review
  code-review --status                               # Check model status and rate limits
  code-review --ci-mode --output json ./src           # CI mode with JSON output

CONFIGURATION:
  Configuration is stored in .codereview.json in your project root.
  Use --setup to create or modify configuration interactively.

AUTHENTICATION:
  Claude Code (recommended):
    claude setup-token                # Authenticate with your subscription
  
  Direct API (alternative):
    ANTHROPIC_API_KEY              # Environment variable
    GEMINI_API_KEY                 # Environment variable (optional but recommended)
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
  console.log(`   Gemini API Key: ${config.geminiApiKey ? '✅ Set in config' : process.env.GEMINI_API_KEY ? '✅ Set in environment' : '❌ Not set'}`);
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

  // Gemini API Key
  const geminiApiKey = await askInput(
    'Enter your Gemini API key (or press Enter to skip):',
    currentConfig.geminiApiKey
  );

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
    ...(geminiApiKey && { geminiApiKey }),
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

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
