import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export class GitManager {
  constructor(private cwd: string = process.cwd()) {}

  isGitRepo(): boolean {
    return existsSync(join(this.cwd, '.git'));
  }

  hasUncommittedChanges(): boolean {
    if (!this.isGitRepo()) return false;
    
    try {
      const result = execSync('git status --porcelain', { 
        cwd: this.cwd,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return result.trim().length > 0;
    } catch (error) {
      console.warn('Warning: Could not check git status');
      return false;
    }
  }

  getChangedFiles(): string[] {
    if (!this.isGitRepo()) return [];
    
    try {
      const result = execSync('git diff --name-only HEAD', {
        cwd: this.cwd,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return result.trim().split('\n').filter(file => file.length > 0);
    } catch (error) {
      console.warn('Warning: Could not get changed files');
      return [];
    }
  }

  getCurrentBranch(): string {
    if (!this.isGitRepo()) return 'unknown';
    
    try {
      const result = execSync('git branch --show-current', {
        cwd: this.cwd,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return result.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  checkWorkingDirectory(requireClean: boolean): { clean: boolean; message?: string } {
    if (!this.isGitRepo()) {
      return { clean: true };
    }

    if (requireClean && this.hasUncommittedChanges()) {
      return {
        clean: false,
        message: '⚠️  You have uncommitted changes. Please commit or stash them before running code review.'
      };
    }

    return { clean: true };
  }
}
