import { watch } from 'fs';
import { join, extname } from 'path';
import { CodeReviewer } from '../core/reviewer.js';
import { FileScanner } from '../core/file-scanner.js';
import { ReviewTemplate } from '../templates/quality.js';
import { CodeReviewConfig } from './config.js';

export interface WatchOptions {
  template: ReviewTemplate;
  config: CodeReviewConfig;
  reviewer: CodeReviewer;
  extensions?: string[];
  debounceMs?: number;
  recursive?: boolean;
}

export class FileWatcher {
  private watchers: any[] = [];
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private isReviewing = false;

  constructor(private options: WatchOptions) {}

  async startWatching(paths: string[]): Promise<void> {
    console.log('👀 Watch mode starting...');
    console.log(`   Template: ${this.options.template.name}`);
    console.log(`   Extensions: ${this.getWatchedExtensions().join(', ')}`);
    console.log(`   Debounce: ${this.options.debounceMs || 2000}ms`);
    console.log(`   Paths: ${paths.join(', ')}`);
    
    for (const path of paths) {
      await this.watchPath(path);
    }
    
    console.log('\n✨ Watching for file changes... (Press Ctrl+C to stop)\n');
    
    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\n👋 Stopping watch mode...');
      this.stop();
      process.exit(0);
    });
  }

  private async watchPath(path: string): Promise<void> {
    try {
      const { statSync } = await import('fs');
      const stat = statSync(path);
      
      if (stat.isFile()) {
        // If it's a single file, watch the directory containing it
        const { dirname, basename } = await import('path');
        const dir = dirname(path);
        const filename = basename(path);
        
        const watcher = watch(
          dir,
          { 
            recursive: false,
            persistent: true 
          },
          (eventType, changedFile) => {
            console.log(`[DEBUG] File watch - eventType: ${eventType}, changedFile: ${changedFile}, filename: ${filename}, originalPath: ${path}`);
            if (changedFile === filename && this.shouldReviewFile(changedFile)) {
              console.log(`[DEBUG] File match - calling handleFileChange with: ${path}`);
              this.handleFileChange(path, eventType);
            }
          }
        );
        
        this.watchers.push(watcher);
      } else if (stat.isDirectory()) {
        // If it's a directory, watch recursively
        const watcher = watch(
          path,
          { 
            recursive: this.options.recursive !== false,
            persistent: true 
          },
          (eventType, filename) => {
            console.log(`[DEBUG] Directory watch - eventType: ${eventType}, filename: ${filename}, watchPath: ${path}`);
            if (filename && this.shouldReviewFile(filename)) {
              const fullPath = join(path, filename);
              console.log(`[DEBUG] Constructed fullPath: ${fullPath}`);
              this.handleFileChange(fullPath, eventType);
            }
          }
        );
        
        this.watchers.push(watcher);
      }
    } catch (error) {
      console.warn(`Warning: Could not watch path ${path}:`, error);
    }
  }

  private shouldReviewFile(filename: string): boolean {
    const ext = extname(filename).toLowerCase();
    const watchedExtensions = this.getWatchedExtensions();
    
    // Skip if not a watched extension
    if (!watchedExtensions.includes(ext)) {
      return false;
    }
    
    // Skip common non-reviewable patterns
    const skipPatterns = [
      '.test.',
      '.spec.',
      '.d.ts',
      'node_modules',
      '.git',
      'dist/',
      'build/',
      '.min.',
      '.bundle.'
    ];
    
    return !skipPatterns.some(pattern => filename.includes(pattern));
  }

  private getWatchedExtensions(): string[] {
    return this.options.extensions || ['.ts', '.tsx', '.js', '.jsx'];
  }

  private handleFileChange(filePath: string, eventType: string): void {
    console.log(`[DEBUG] handleFileChange called with filePath: ${filePath}, eventType: ${eventType}`);
    
    // Clear existing timer for this file
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath)!);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      console.log(`[DEBUG] Debounce timer fired for: ${filePath}`);
      await this.reviewFile(filePath, eventType);
      this.debounceTimers.delete(filePath);
    }, this.options.debounceMs || 2000);

    this.debounceTimers.set(filePath, timer);
  }

  private async reviewFile(filePath: string, eventType: string): Promise<void> {
    console.log(`[DEBUG] reviewFile called with filePath: ${filePath}`);
    
    // Skip if currently reviewing (prevent overlapping reviews)
    if (this.isReviewing) {
      console.log(`⏭️  Skipping ${filePath} (review in progress)`);
      return;
    }

    try {
      this.isReviewing = true;
      
      console.log(`\n📝 File ${eventType}: ${filePath}`);
      console.log(`⏰ ${new Date().toLocaleTimeString()}`);
      
      // Verify the file exists and is accessible
      const { statSync } = await import('fs');
      try {
        const stat = statSync(filePath);
        if (!stat.isFile()) {
          console.log('   🚫 Not a regular file');
          return;
        }
      } catch (error) {
        console.log(`   🚫 File not accessible: ${error.message}`);
        return;
      }
      
      // Scan just this file
      const scanner = new FileScanner(this.options.config);
      const scanResult = scanner.scanPath(filePath);
      
      if (scanResult.files.length === 0) {
        console.log('   🚫 File not reviewable or too large');
        return;
      }

      console.log(`\n🤖 Reviewing with ${this.options.template.name} template...`);
      
      const results = await this.options.reviewer.reviewMultipleFiles(
        scanResult.files,
        this.options.template,
        1, // Single file, no concurrency needed
        () => {} // No progress callback needed
      );

      if (results.length > 0) {
        const result = results[0];
        this.displayQuickResult(result);
      }
      
    } catch (error) {
      console.error(`❌ Error reviewing ${filePath}:`, error);
    } finally {
      this.isReviewing = false;
      console.log('\n👀 Watching for more changes...\n');
    }
  }

  private displayQuickResult(result: any): void {
    const timestamp = new Date().toLocaleTimeString();
    const status = result.hasIssues ? '🔍 Issues found' : '✅ Clean';
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 Quick Review [${timestamp}]`);
    console.log(`${'='.repeat(60)}`);
    console.log(`File: ${result.filePath}`);
    console.log(`Status: ${status}`);
    console.log(`Tokens: ${(result.tokensUsed.input + result.tokensUsed.output).toLocaleString()}`);
    
    if (result.hasIssues) {
      console.log(`\n${'-'.repeat(50)}`);
      // Show just the first few lines of feedback for quick viewing
      const lines = result.feedback.split('\n').slice(0, 10);
      const preview = lines.join('\n');
      console.log(preview);
      
      if (result.feedback.split('\n').length > 10) {
        console.log('\n... (run full review for complete details)');
      }
      console.log(`${'-'.repeat(50)}`);
    }
  }

  stop(): void {
    // Clear all timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    
    // Close all watchers
    this.watchers.forEach(watcher => {
      if (watcher && typeof watcher.close === 'function') {
        watcher.close();
      }
    });
    this.watchers = [];
    
    console.log('✋ File watching stopped');
  }
}
