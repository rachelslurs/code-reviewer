import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { ReviewResult } from '../core/reviewer.js';
import { FileInfo } from '../core/file-scanner.js';

export interface CacheEntry {
  fileHash: string;
  filePath: string;
  template: string;
  result: ReviewResult;
  cachedAt: string;
  fileSize: number;
  lastModified: number;
}

export interface CacheStats {
  totalFiles: number;
  cachedFiles: number;
  newFiles: number;
  changedFiles: number;
  timeSaved: string;
}

export class CacheManager {
  private cacheDir: string;
  private cacheFile: string;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(projectRoot: string = process.cwd()) {
    this.cacheDir = join(projectRoot, '.codereview-cache');
    this.cacheFile = join(this.cacheDir, 'review-cache.json');
    this.loadCache();
  }

  /**
   * Generate a content-based hash for a file
   */
  private generateFileHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Generate a cache key for a specific file + template combination
   */
  private getCacheKey(filePath: string, template: string): string {
    return `${filePath}:${template}`;
  }

  /**
   * Load existing cache from disk
   */
  private loadCache(): void {
    if (!existsSync(this.cacheFile)) {
      return;
    }

    try {
      const cacheData = JSON.parse(readFileSync(this.cacheFile, 'utf8'));
      
      // Convert cached results back to proper objects
      Object.entries(cacheData).forEach(([key, entry]: [string, any]) => {
        this.cache.set(key, {
          ...entry,
          result: {
            ...entry.result,
            timestamp: new Date(entry.result.timestamp)
          }
        });
      });

      console.log(`📋 Loaded cache with ${this.cache.size} entries`);
    } catch (error) {
      console.warn('Warning: Could not load cache, starting fresh');
      this.cache.clear();
    }
  }

  /**
   * Save cache to disk
   */
  private saveCache(): void {
    try {
      if (!existsSync(this.cacheDir)) {
        mkdirSync(this.cacheDir, { recursive: true });
      }

      const cacheData: Record<string, CacheEntry> = {};
      this.cache.forEach((entry, key) => {
        cacheData[key] = {
          ...entry,
          result: {
            ...entry.result,
            timestamp: entry.result.timestamp.toISOString()
          }
        } as any;
      });

      writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch (error) {
      console.warn('Warning: Could not save cache:', error);
    }
  }

  /**
   * Check if a file result is cached and still valid
   */
  isCached(file: FileInfo, template: string): boolean {
    const key = this.getCacheKey(file.relativePath, template);
    const cached = this.cache.get(key);

    if (!cached) {
      return false;
    }

    // Check if file content has changed
    const currentHash = this.generateFileHash(file.content);
    if (cached.fileHash !== currentHash) {
      this.cache.delete(key); // Remove stale cache entry
      return false;
    }

    // Check if file was modified (additional safety check)
    try {
      const stats = statSync(file.absolutePath);
      if (stats.mtime.getTime() !== cached.lastModified) {
        this.cache.delete(key);
        return false;
      }
    } catch (error) {
      // File might not exist anymore
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get cached result for a file + template
   */
  getCached(file: FileInfo, template: string): ReviewResult | null {
    const key = this.getCacheKey(file.relativePath, template);
    const cached = this.cache.get(key);
    
    if (cached && this.isCached(file, template)) {
      return cached.result;
    }
    
    return null;
  }

  /**
   * Cache a review result
   */
  cacheResult(file: FileInfo, template: string, result: ReviewResult): void {
    const key = this.getCacheKey(file.relativePath, template);
    const fileHash = this.generateFileHash(file.content);
    
    let lastModified: number;
    try {
      const stats = statSync(file.absolutePath);
      lastModified = stats.mtime.getTime();
    } catch (error) {
      lastModified = Date.now();
    }

    this.cache.set(key, {
      fileHash,
      filePath: file.relativePath,
      template,
      result: {
        ...result,
        timestamp: new Date(result.timestamp) // Ensure it's a Date object
      },
      cachedAt: new Date().toISOString(),
      fileSize: file.size,
      lastModified
    });
  }

  /**
   * Separate files into cached and uncached
   */
  separateFiles(files: FileInfo[], template: string): {
    cachedFiles: { file: FileInfo; result: ReviewResult }[];
    uncachedFiles: FileInfo[];
    stats: CacheStats;
  } {
    const cachedFiles: { file: FileInfo; result: ReviewResult }[] = [];
    const uncachedFiles: FileInfo[] = [];

    for (const file of files) {
      const cachedResult = this.getCached(file, template);
      if (cachedResult) {
        cachedFiles.push({ file, result: cachedResult });
      } else {
        uncachedFiles.push(file);
      }
    }

    const stats: CacheStats = {
      totalFiles: files.length,
      cachedFiles: cachedFiles.length,
      newFiles: uncachedFiles.filter(f => !this.hasAnyCache(f)).length,
      changedFiles: uncachedFiles.filter(f => this.hasAnyCache(f)).length,
      timeSaved: this.estimateTimeSaved(cachedFiles.length)
    };

    return { cachedFiles, uncachedFiles, stats };
  }

  /**
   * Check if a file has any cached results (for any template)
   */
  private hasAnyCache(file: FileInfo): boolean {
    const templates = ['quality', 'security', 'performance', 'typescript', 'combined'];
    return templates.some(template => {
      const key = this.getCacheKey(file.relativePath, template);
      return this.cache.has(key);
    });
  }

  /**
   * Estimate time saved by caching
   */
  private estimateTimeSaved(cachedCount: number): string {
    const avgReviewTime = 30; // seconds per file
    const totalSeconds = cachedCount * avgReviewTime;
    
    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    } else if (totalSeconds < 3600) {
      return `${Math.round(totalSeconds / 60)}m`;
    } else {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.round((totalSeconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Print cache statistics
   */
  printCacheStats(stats: CacheStats): void {
    console.log('\n📊 Cache Performance:');
    console.log(`   Total files: ${stats.totalFiles}`);
    console.log(`   Cached (unchanged): ${stats.cachedFiles} ⚡`);
    console.log(`   New files: ${stats.newFiles} 🆕`);
    console.log(`   Changed files: ${stats.changedFiles} 📝`);
    console.log(`   Estimated time saved: ${stats.timeSaved} 🏃‍♀️`);
    console.log(`   Cache hit rate: ${((stats.cachedFiles / stats.totalFiles) * 100).toFixed(1)}%`);
  }

  /**
   * Clean up stale cache entries
   */
  cleanup(): void {
    let removedCount = 0;
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    this.cache.forEach((entry, key) => {
      const cachedAt = new Date(entry.cachedAt);
      if (cachedAt < cutoffDate) {
        this.cache.delete(key);
        removedCount++;
      }
    });

    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} stale cache entries`);
    }

    this.saveCache();
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.cache.clear();
    try {
      if (existsSync(this.cacheFile)) {
        writeFileSync(this.cacheFile, '{}', 'utf8');
      }
      console.log('🗑️  Cache cleared');
    } catch (error) {
      console.warn('Warning: Could not clear cache file');
    }
  }

  /**
   * Finalize caching - save to disk
   */
  finalize(): void {
    this.saveCache();
  }

  /**
   * Get cache size info
   */
  getCacheInfo(): { entryCount: number; sizeOnDisk: string } {
    let sizeOnDisk = '0B';
    
    try {
      if (existsSync(this.cacheFile)) {
        const stats = statSync(this.cacheFile);
        const bytes = stats.size;
        if (bytes < 1024) {
          sizeOnDisk = `${bytes}B`;
        } else if (bytes < 1024 * 1024) {
          sizeOnDisk = `${(bytes / 1024).toFixed(1)}KB`;
        } else {
          sizeOnDisk = `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return {
      entryCount: this.cache.size,
      sizeOnDisk
    };
  }
}
