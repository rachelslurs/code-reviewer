import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { FileInfo } from '../core/file-scanner.js';
import { ReviewResult } from '../core/reviewer.js';
import { execSync } from 'child_process';

export interface ReviewSession {
  id: string;
  startedAt: string;
  lastUpdated: string;
  template: string;
  totalFiles: number;
  completedFiles: number;
  targetPath: string;
  gitCommit?: string;
  gitBranch?: string;
  pendingFiles: FileInfo[];
  completedResults: ReviewResult[];
  sessionConfig: {
    outputFormat: string;
    outputFile?: string;
    noCache: boolean;
  };
}

export interface IncrementalOptions {
  compareWith?: 'last-commit' | 'main' | 'develop' | string; // commit/branch to compare with
  includeUntracked?: boolean;
  includeStaged?: boolean;
}

export class ReviewSessionManager {
  private sessionDir: string;
  private currentSession: ReviewSession | null = null;

  constructor(projectRoot: string = process.cwd()) {
    this.sessionDir = join(projectRoot, '.codereview-sessions');
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  /**
   * Start a new review session or resume an existing one
   */
  async startSession(
    files: FileInfo[],
    template: string,
    targetPath: string,
    options: {
      outputFormat: string;
      outputFile?: string;
      noCache: boolean;
      resume?: boolean;
    }
  ): Promise<ReviewSession> {
    const sessionId = this.generateSessionId(targetPath, template);
    
    if (options.resume) {
      const existing = this.loadSession(sessionId);
      if (existing) {
        console.log(`📂 Resuming session: ${existing.completedFiles}/${existing.totalFiles} files completed`);
        console.log(`   Started: ${new Date(existing.startedAt).toLocaleString()}`);
        console.log(`   Last updated: ${new Date(existing.lastUpdated).toLocaleString()}`);
        this.currentSession = existing;
        return existing;
      } else {
        console.log('ℹ️  No existing session found, starting new session');
      }
    }

    // Create new session
    const gitInfo = this.getGitInfo();
    
    const session: ReviewSession = {
      id: sessionId,
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      template,
      totalFiles: files.length,
      completedFiles: 0,
      targetPath,
      gitCommit: gitInfo.commit,
      gitBranch: gitInfo.branch,
      pendingFiles: [...files],
      completedResults: [],
      sessionConfig: {
        outputFormat: options.outputFormat,
        outputFile: options.outputFile,
        noCache: options.noCache
      }
    };

    this.currentSession = session;
    this.saveSession(session);
    
    console.log(`🆕 Started new review session: ${session.id}`);
    console.log(`   Files to review: ${session.totalFiles}`);
    console.log(`   Template: ${template}`);
    if (gitInfo.branch) {
      console.log(`   Branch: ${gitInfo.branch} (${gitInfo.commit?.slice(0, 8)})`);
    }

    return session;
  }

  /**
   * Mark files as completed and update session
   */
  markFilesCompleted(results: ReviewResult[]): void {
    if (!this.currentSession) return;

    // Add to completed results
    this.currentSession.completedResults.push(...results);
    this.currentSession.completedFiles = this.currentSession.completedResults.length;

    // Remove from pending files
    const completedPaths = new Set(results.map(r => r.filePath));
    this.currentSession.pendingFiles = this.currentSession.pendingFiles.filter(
      file => !completedPaths.has(file.relativePath)
    );

    this.currentSession.lastUpdated = new Date().toISOString();
    this.saveSession(this.currentSession);

    console.log(`✅ Progress: ${this.currentSession.completedFiles}/${this.currentSession.totalFiles} files completed`);
  }

  /**
   * Get files that have changed since last review or specified point
   */
  getIncrementalFiles(files: FileInfo[], options: IncrementalOptions = {}): FileInfo[] {
    const compareWith = options.compareWith || 'last-commit';
    
    try {
      let changedFiles: Set<string>;
      
      if (compareWith === 'last-commit') {
        changedFiles = this.getChangedFilesSinceCommit('HEAD~1');
      } else if (compareWith === 'main' || compareWith === 'develop') {
        changedFiles = this.getChangedFilesSinceCommit(`origin/${compareWith}`);
      } else {
        // Assume it's a commit hash or branch name
        changedFiles = this.getChangedFilesSinceCommit(compareWith);
      }

      if (options.includeUntracked) {
        const untrackedFiles = this.getUntrackedFiles();
        untrackedFiles.forEach(file => changedFiles.add(file));
      }

      if (options.includeStaged) {
        const stagedFiles = this.getStagedFiles();
        stagedFiles.forEach(file => changedFiles.add(file));
      }

      // Filter files to only include changed ones
      const incrementalFiles = files.filter(file => 
        changedFiles.has(file.relativePath) || changedFiles.has(file.path)
      );

      console.log(`📈 Incremental Review:`);
      console.log(`   Comparing with: ${compareWith}`);
      console.log(`   Total files: ${files.length}`);
      console.log(`   Changed files: ${incrementalFiles.length}`);
      console.log(`   Files to skip: ${files.length - incrementalFiles.length}`);

      if (incrementalFiles.length === 0) {
        console.log('ℹ️  No changes detected - all files up to date!');
      }

      return incrementalFiles;
      
    } catch (error) {
      console.warn('⚠️  Could not determine incremental changes, reviewing all files');
      console.warn('   Error:', error);
      return files;
    }
  }

  /**
   * Get remaining files to review in current session
   */
  getRemainingFiles(): FileInfo[] {
    return this.currentSession?.pendingFiles || [];
  }

  /**
   * Get completed results from current session
   */
  getCompletedResults(): ReviewResult[] {
    return this.currentSession?.completedResults || [];
  }

  /**
   * Get session progress
   */
  getProgress(): { completed: number; total: number; percentage: number } {
    if (!this.currentSession) {
      return { completed: 0, total: 0, percentage: 0 };
    }
    
    const percentage = this.currentSession.totalFiles > 0 
      ? (this.currentSession.completedFiles / this.currentSession.totalFiles) * 100 
      : 0;
      
    return {
      completed: this.currentSession.completedFiles,
      total: this.currentSession.totalFiles,
      percentage: Math.round(percentage)
    };
  }

  /**
   * Complete the session and clean up
   */
  completeSession(): void {
    if (!this.currentSession) return;

    const sessionFile = join(this.sessionDir, `${this.currentSession.id}.json`);
    
    // Move to completed sessions or delete based on preference
    console.log(`✅ Session completed: ${this.currentSession.completedFiles}/${this.currentSession.totalFiles} files`);
    console.log(`⏱️  Duration: ${this.getSessionDuration()}`);
    
    // For now, just delete the session file to clean up
    try {
      const fs = require('fs');
      fs.unlinkSync(sessionFile);
    } catch (error) {
      // Ignore cleanup errors
    }
    
    this.currentSession = null;
  }

  /**
   * List available sessions to resume
   */
  listSessions(): Array<{ id: string; startedAt: string; progress: string; template: string }> {
    try {
      const fs = require('fs');
      const files = fs.readdirSync(this.sessionDir).filter((f: string) => f.endsWith('.json'));
      
      return files.map((file: string) => {
        try {
          const session: ReviewSession = JSON.parse(
            fs.readFileSync(join(this.sessionDir, file), 'utf8')
          );
          return {
            id: session.id,
            startedAt: new Date(session.startedAt).toLocaleString(),
            progress: `${session.completedFiles}/${session.totalFiles}`,
            template: session.template
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  private generateSessionId(targetPath: string, template: string): string {
    const pathHash = targetPath.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
    const timestamp = Date.now().toString(36);
    return `${template}_${pathHash}_${timestamp}`;
  }

  private saveSession(session: ReviewSession): void {
    const sessionFile = join(this.sessionDir, `${session.id}.json`);
    writeFileSync(sessionFile, JSON.stringify(session, null, 2), 'utf8');
  }

  private loadSession(sessionId: string): ReviewSession | null {
    const sessionFile = join(this.sessionDir, `${sessionId}.json`);
    
    if (!existsSync(sessionFile)) {
      return null;
    }

    try {
      const sessionData = JSON.parse(readFileSync(sessionFile, 'utf8'));
      return sessionData;
    } catch (error) {
      console.warn(`Warning: Could not load session ${sessionId}`);
      return null;
    }
  }

  private getGitInfo(): { commit?: string; branch?: string } {
    try {
      const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      return { commit, branch };
    } catch {
      return {};
    }
  }

  private getChangedFilesSinceCommit(compareWith: string): Set<string> {
    try {
      // Get files changed between compareWith and current working directory
      const output = execSync(
        `git diff --name-only ${compareWith} HEAD`, 
        { encoding: 'utf8' }
      ).trim();
      
      return new Set(output.split('\n').filter(line => line.length > 0));
    } catch (error) {
      console.warn(`Could not get git diff for ${compareWith}`);
      return new Set();
    }
  }

  private getUntrackedFiles(): Set<string> {
    try {
      const output = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' }).trim();
      return new Set(output.split('\n').filter(line => line.length > 0));
    } catch {
      return new Set();
    }
  }

  private getStagedFiles(): Set<string> {
    try {
      const output = execSync('git diff --name-only --cached', { encoding: 'utf8' }).trim();
      return new Set(output.split('\n').filter(line => line.length > 0));
    } catch {
      return new Set();
    }
  }

  private getSessionDuration(): string {
    if (!this.currentSession) return '0s';
    
    const start = new Date(this.currentSession.startedAt);
    const end = new Date();
    const diffMs = end.getTime() - start.getTime();
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }
}
