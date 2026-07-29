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
import type { ModelConfig } from '../src/core/multi-model-provider.js';
import { ReviewSessionManager } from '../src/utils/session-manager.js';
import { ModelStatusChecker } from '../src/utils/model-status-checker.js';
import { InteractiveSelector } from '../src/utils/interactive-selector.js';
import { FileWatcher } from '../src/utils/file-watcher.js';
import { OutputFormatter } from '../src/utils/output-formatter.js';
import { probeClaudeCodeAuth, probeClaudeCodeCli } from '../src/core/claude-cli.js';
import { resolveTargetPath } from '../src/utils/cli-target.js';
import { SEVERITY_ORDER, type Severity } from '../src/core/review-schema.js';
import { describeGate, evaluateGate, parseSeverity } from '../src/core/severity-gate.js';

/**
 * Reads a boolean environment variable. A bare truthiness test on the raw string
 * treats "0" and "false" as enabled, which inverts the caller's intent for exactly
 * the values they are most likely to write.
 */
const TRUTHY = ['1', 'true', 'yes', 'on'];
const FALSY = ['0', 'false', 'no', 'off', ''];

function envFlag(name: string): boolean {
  const raw = process.env[name];
  if (raw === undefined) return false;
  const value = raw.trim().toLowerCase();
  if (TRUTHY.includes(value)) return true;
  // Anything unrecognised is off, and says so. Silently reading `=enabled` as off
  // would switch the run to a transport the caller was trying to avoid, with the
  // variable visibly set in their environment the whole time.
  if (!FALSY.includes(value)) {
    console.warn(`⚠️  Ignoring ${name}=${raw}: expected one of ${TRUTHY.join(', ')}. Treating as unset.`);
  }
  return false;
}

/**
 * Whether reviews should route through the Claude Code CLI rather than the API.
 *
 * An errored CLI is still worth attempting when it is the only transport there is,
 * and is not worth preferring over a working API key: the reviewer construction
 * below withholds the key whenever this returns true, so an exhausted subscription
 * would take the whole run down with a usable key sitting unread. The single-model
 * path has no fallback chain, so there is nothing downstream to recover it.
 */
function preferClaudeCodeForReview(hasApiKey: boolean): boolean {
  const { status, detail } = probeClaudeCodeCli();
  if (status === 'unavailable') return false;
  if (status === 'ready') return true;

  if (hasApiKey) {
    console.warn(`⚠️  Claude Code CLI reported an error (${detail}). Using the Anthropic API key instead.`);
    return false;
  }
  console.warn(`⚠️  Claude Code CLI reported an error (${detail}). Attempting it anyway, since no API key is set. The real message will surface on the first review.`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);

  // This CLI reads a flag's value as the following argument, so `--fail-on=critical`
  // matches nothing and would be dropped without a word. Silently ignoring it would
  // leave the severity gate switched off while the command line says otherwise.
  const equalsForm = args.find(arg => arg.startsWith('--') && arg.includes('='));
  if (equalsForm) {
    const [name, ...rest] = equalsForm.split('=');
    console.error(`❌ ${equalsForm}: this CLI takes a flag's value as a separate argument.`);
    console.error(`   Use: ${name} ${rest.join('=')}`);
    process.exit(1);
  }

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
  if (args.includes('--status')) {
    await showModelStatus();
    process.exit(0);
  }

  // Load config
  const configManager = new ConfigManager();
  const config = configManager.load();

  // Parse arguments more carefully
  const templateIndex = args.indexOf('--template');
  let template = config.defaultTemplate;
  if (templateIndex !== -1 && templateIndex < args.length - 1) {
    // getTemplates() already falls back for unrecognised names, so this preserves
    // the existing behaviour rather than adding validation.
    template = args[templateIndex + 1] as typeof template;
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
  
  // Validated before the auth probe so a bad value costs nothing.
  const failOnIndex = args.indexOf('--fail-on');
  let failOn: Severity | null = null;
  if (failOnIndex !== -1) {
    const raw = failOnIndex < args.length - 1 ? args[failOnIndex + 1] : '';
    failOn = parseSeverity(raw);
    if (failOn === null) {
      console.error(`❌ --fail-on ${raw || '(missing)'}: expected one of ${SEVERITY_ORDER.join(', ')}.`);
      process.exit(1);
    }
  }

  const targetPath = resolveTargetPath(args);
  
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
  
  // Developer experience options
  const ciMode = args.includes('--ci-mode');
  const interactive = args.includes('--interactive') || args.includes('-i');
  const watchMode = args.includes('--watch') || args.includes('-w');
  const autoFallback = args.includes('--auto-fallback');

  // Auto-fallback model priority by template
  const getModelPriority = (template: string): string[] => {
    const priorities: { [key: string]: string[] } = {
      'security': ['claude-sonnet', 'claude-haiku', 'gemini-pro', 'gemini-flash'],
      'combined': ['claude-sonnet', 'gemini-pro', 'claude-haiku', 'gemini-flash'], 
      'quality': ['gemini-flash', 'claude-haiku', 'gemini-pro', 'claude-sonnet'],
      'performance': ['gemini-flash', 'gemini-pro', 'claude-haiku', 'claude-sonnet'],
      'typescript': ['gemini-flash', 'claude-haiku', 'gemini-pro', 'claude-sonnet']
    };
    return priorities[template] || priorities['quality'];
  };

  // Determine which models we'll actually need
  let needsClaude = false;
  let needsGemini = false;
  let modelFallbackChain: string[] = [];
  
  if (autoFallback) {
    // Auto-fallback mode: determine priority chain and check what's available
    modelFallbackChain = getModelPriority(template);
    console.log(`🎯 Auto-fallback enabled for ${template} template`);
    console.log(`📋 Priority chain: ${modelFallbackChain.join(' → ')}`);
    
    // We might need both providers for fallback
    needsClaude = modelFallbackChain.some(m => m.startsWith('claude-'));
    needsGemini = modelFallbackChain.some(m => m.startsWith('gemini-'));
  } else if (specificModel) {
    // User specified a particular model
    needsClaude = specificModel.startsWith('claude-');
    needsGemini = specificModel.startsWith('gemini-');
    modelFallbackChain = [specificModel];
  } else if (useMultiModel || comparisonMode) {
    // Multi-model mode without specific model - might need both
    needsClaude = true;
    needsGemini = true;
  } else {
    // Default single model mode - use Claude
    needsClaude = true;
    modelFallbackChain = ['claude-sonnet'];
  }

  // Check authentication methods based on what we actually need
  console.log('\n🔍 Checking authentication...');
  // Claude Code auth wins everywhere it is detected, and the CLI construction below
  // withholds the API key when it does. Both transports produce structured output,
  // so this is a cost and latency switch: the CLI runs an agentic session costing
  // roughly six times a direct API call.
  const hasApiKey = needsClaude ? !!(config.apiKey || process.env.ANTHROPIC_API_KEY) : false;
  const hasClaudeCode = envFlag('CODE_REVIEW_FORCE_API')
    ? false
    : (needsClaude ? preferClaudeCodeForReview(hasApiKey) : false);
  const hasGeminiKey = needsGemini ? !!(config.geminiApiKey || process.env.GEMINI_API_KEY) : false;

  // In auto-fallback mode, we're more flexible about missing auth
  const claudeAvailable = hasClaudeCode || hasApiKey;
  const geminiAvailable = hasGeminiKey;
  
  if (autoFallback) {
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
    // Original strict authentication logic for non-fallback modes
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

  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  
  // Show what authentication we're using
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
  
  if (autoFallback) {
    console.log(`🎆 Auto-fallback: Will try models until one works`);
  } else if (specificModel) {
    console.log(`🎯 Model: ${specificModel}`);
  }

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

  // Set by the severity gate below. Declared out here so the exit at the end of
  // main() can read it; 1 stays reserved for the failure paths that exit directly.
  let exitCode = 0;

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
    
    // Interactive file selection (after incremental filtering)
    if (interactive && !ciMode) {
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
    if (!args.includes('--yes') && !args.includes('-y') && !ciMode && !interactive) {
      const shouldContinue = await askConfirmation(
        `\nProceed with review of ${filesToReview.length} files?`
      );
      if (!shouldContinue) {
        console.log('Review cancelled.');
        process.exit(0);
      }
    }

    // Start review - choose between single model, multi-model, or auto-fallback
    let reviewer: any;
    
    if (autoFallback) {
      // Auto-fallback reviewer using multi-model infrastructure
      const geminiApiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      
      // Configure auto-fallback settings
      const fallbackConfig = {
        primaryModel: modelFallbackChain[0], // Start with the first (preferred) model
        fallbackModels: modelFallbackChain.slice(1), // Rest are fallbacks
        comparisonMode: false, // We want fallback, not comparison
        timeout: 60000,
        maxRetries: modelFallbackChain.length,
        autoFallback: true, // Enable fallback mode
        // getOptimalModel dereferences this on every review, so an omitted value
        // throws before the first request is built.
        templateMappings: config.multiModel?.templateMappings ?? {}
      };
      
      console.log(`🚀 Initializing auto-fallback reviewer with ${modelFallbackChain.length} models`);
      
      reviewer = new MultiModelReviewer(
        {
          anthropic: hasClaudeCode ? undefined : apiKey,
          gemini: geminiApiKey
        },
        hasClaudeCode,
        fallbackConfig
      );
      
    } else if (useMultiModel || comparisonMode) {
      // Multi-model reviewer
      const geminiApiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      
      // Configure multi-model settings
      const multiModelConfig: ModelConfig = {
        ...config.multiModel!,
        comparisonMode: comparisonMode || config.multiModel!.comparisonMode
      };
      
      if (specificModel) {
        multiModelConfig.primaryModel = specificModel;
        multiModelConfig.explicitModel = specificModel;
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
      const targetModel = specificModel || modelFallbackChain[0] || 'claude-sonnet';
      
      if (targetModel.startsWith('gemini-')) {
        // For Gemini-only mode, use MultiModelReviewer with Gemini config
        const geminiApiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
        const geminiConfig = {
          primaryModel: targetModel,
          explicitModel: targetModel,
          comparisonMode: false,
          timeout: 60000,
          fallbackModels: config.multiModel?.fallbackModels ?? [],
          maxRetries: config.multiModel?.maxRetries ?? 2,
          templateMappings: config.multiModel?.templateMappings ?? {}
        };
        
        reviewer = new MultiModelReviewer(
          {
            anthropic: undefined, // No Claude needed
            gemini: geminiApiKey
          },
          false, // No Claude Code
          geminiConfig
        );
      } else {
        // Traditional Claude reviewer
        reviewer = new CodeReviewer(
          hasClaudeCode ? undefined : apiKey,
          hasClaudeCode,
          !noCache,
          targetModel
        );
      }
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
    
    // Handle watch mode
    if (watchMode) {
      const reviewTemplate = getTemplates(template)[0]; // Use first template for watch mode
      const watcher = new FileWatcher({
        template: reviewTemplate,
        config,
        reviewer,
        debounceMs: 2000 // 2 second debounce
      });
      
      await watcher.startWatching([targetPath]);
      return; // Keep watching (process stays alive)
    }
    
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
        (current: number, total: number, result: { hasIssues: boolean | null; filePath: string }) => {
          // A null verdict means the review failed. Collapsing it into the false
          // branch would report an unreviewed file as clean.
          const status = result.hasIssues === null
            ? '⚠️  Review failed'
            : result.hasIssues ? '🔍 Issues found' : '✅ Clean';
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

    // After the report is written, so a run that trips the gate still leaves its
    // JSON behind for whatever consumes it.
    if (failOn !== null) {
      const outcome = evaluateGate(
        allResults.map(result => ({
          hasIssues: result.hasIssues,
          findings: result.review?.findings ?? null,
        })),
        failOn,
      );
      console.log('\n' + describeGate(outcome, failOn));
      // 2 separates "the review ran and found something" from "the review broke",
      // which 1 already means everywhere else in this file.
      if (outcome.shouldFail) exitCode = outcome.reason === 'threshold' ? 2 : 1;
    }

  } catch (error) {
    console.error('❌ Error during review:', error);
    process.exit(1);
  }

  // Ensure clean exit
  setTimeout(() => {
    if (exitCode === 0) console.log('\n✅ Review completed successfully!');
    process.exit(exitCode);
  }, 500); // Give a brief moment for any final operations
}

function printHelp(): void {
  console.log(`
🤖 Code Review Agent

USAGE:
  code-review [path] [options]

ARGUMENTS:
  path                 Path to file or directory to review (default: current directory)

REVIEW:
  --template <name>       quality, security, performance, typescript, combined, all
                          (default: quality)
  --model <key>           claude-sonnet, claude-haiku, gemini-pro, gemini-flash
  --multi-model           Pick the model per template automatically
  --compare-models        Run several models on the same file and compare
  --auto-fallback         Fall through the model chain when one is unavailable

OUTPUT:
  --output <format>       terminal, markdown, json, html (default: terminal)
                          Only json exposes findings as data; the rest render prose
  --output-file <path>    Write the report to a file

SELECTING FILES:
  --interactive, -i       Choose files from a list
  --incremental           Only files changed since the last commit
  --changed-only          Alias for --incremental
  --compare-with <ref>    Diff against a branch or commit instead
  --include-untracked     Include untracked files in the diff
  --include-staged        Include staged files in the diff
  --watch, -w             Re-review on save

EFFICIENCY:
  --resume                Continue an interrupted session
  --no-cache              Skip the cache for this run
  --clear-cache           Delete the cache and exit

GIT:
  --allow-dirty           Run with uncommitted changes
  --no-git-check          Skip git checks entirely

OTHER:
  --fail-on <severity>    Exit 2 when findings reach critical, high, medium or low.
                          Without it the exit code is 0 whatever the review found
  --yes, -y               Skip the confirmation prompt
  --ci-mode               Non-interactive output for CI
  --config                Show current configuration
  --setup                 Run the interactive setup wizard
  --status                Show model status and rate limits
  --help, -h              Show this message

EXIT CODES:
  0                       Completed, nothing at or above --fail-on
  1                       The review could not be trusted: it failed to run, a file
                          returned no verdict, or the arguments were rejected
  2                       Completed, findings at or above --fail-on

  A flag's value is a separate argument: --fail-on critical, never --fail-on=critical.

ENVIRONMENT:
  ANTHROPIC_API_KEY       Claude API key, if not using the Claude Code CLI
  GEMINI_API_KEY          Gemini API key
  CODE_REVIEW_FORCE_API   Use the Anthropic API even when the CLI is authenticated.
                          Accepts 1, true, yes, on
  CODE_REVIEW_MAX_TOKENS  Output token cap per request, 1 to 16000

EXAMPLES:
  code-review                              # Current directory, default template
  code-review ./src --template security    # Security review of a directory
  code-review component.tsx                # Single file
  code-review --incremental --watch        # Changed files, re-run on save
  code-review --output json --output-file r.json ./src
  code-review ./src --fail-on critical     # Exit 2 if anything critical turns up
  code-review --setup                      # Configure keys and settings

CONFIGURATION:
  Configuration is stored in .codereview.json in your project root.
  Use --setup to create or modify configuration interactively.`);
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
  return probeClaudeCodeAuth();
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
