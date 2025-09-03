import { readFileSync, statSync, readdirSync } from 'fs';
import { join, relative, extname } from 'path';
import { CodeReviewConfig } from '../utils/config.js';

export interface FileInfo {
  path: string;
  relativePath: string;
  size: number;
  extension: string;
  content: string;
}

export interface ScanResult {
  files: FileInfo[];
  skippedFiles: string[];
  totalSize: number;
  estimatedTokens: number;
}

export class FileScanner {
  constructor(private config: CodeReviewConfig) {}

  scanPath(targetPath: string): ScanResult {
    const stat = statSync(targetPath);
    const files: FileInfo[] = [];
    const skippedFiles: string[] = [];

    if (stat.isFile()) {
      const result = this.processFile(targetPath, targetPath);
      if (result) {
        files.push(result);
      } else {
        skippedFiles.push(targetPath);
      }
    } else if (stat.isDirectory()) {
      this.scanDirectory(targetPath, targetPath, files, skippedFiles);
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const estimatedTokens = Math.ceil(totalSize / 4); // Rough estimate: 4 chars per token

    return {
      files,
      skippedFiles,
      totalSize,
      estimatedTokens
    };
  }

  private scanDirectory(
    dirPath: string,
    rootPath: string,
    files: FileInfo[],
    skippedFiles: string[]
  ): void {
    try {
      const entries = readdirSync(dirPath);

      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const relativePath = relative(rootPath, fullPath);

        if (this.shouldSkipPath(relativePath)) {
          skippedFiles.push(fullPath);
          continue;
        }

        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          this.scanDirectory(fullPath, rootPath, files, skippedFiles);
        } else if (stat.isFile()) {
          const fileInfo = this.processFile(fullPath, rootPath);
          if (fileInfo) {
            files.push(fileInfo);
          } else {
            skippedFiles.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not scan directory ${dirPath}`);
    }
  }

  private processFile(filePath: string, rootPath: string): FileInfo | null {
    try {
      const stat = statSync(filePath);
      const relativePath = relative(rootPath, filePath);

      // Skip if file is too large
      if (stat.size > this.config.maxFileSize) {
        console.warn(`Skipping ${relativePath}: File too large (${this.formatBytes(stat.size)})`);
        return null;
      }

      // Skip if not a reviewable file type
      if (!this.isReviewableFile(filePath)) {
        return null;
      }

      const content = readFileSync(filePath, 'utf-8');

      return {
        path: filePath,
        relativePath,
        size: stat.size,
        extension: extname(filePath),
        content
      };
    } catch (error) {
      console.warn(`Warning: Could not read file ${filePath}`);
      return null;
    }
  }

  private shouldSkipPath(relativePath: string): boolean {
    return this.config.ignorePatterns.some(pattern => {
      // Simple glob matching - convert ** to .* and * to [^/]*
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\./g, '\\.');
      
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(relativePath);
    });
  }

  private isReviewableFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    const reviewableExtensions = [
      '.ts', '.tsx', '.js', '.jsx',
      '.py', '.java', '.cpp', '.c', '.h',
      '.go', '.rs', '.php', '.rb',
      '.css', '.scss', '.sass', '.less',
      '.html', '.vue', '.svelte',
      '.json', '.yaml', '.yml',
      '.md', '.mdx'
    ];

    return reviewableExtensions.includes(ext);
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)}${units[unitIndex]}`;
  }

  printScanSummary(result: ScanResult): void {
    console.log(`\n📊 Scan Summary:`);
    console.log(`   Files to review: ${result.files.length}`);
    console.log(`   Files skipped: ${result.skippedFiles.length}`);
    console.log(`   Total size: ${this.formatBytes(result.totalSize)}`);
    console.log(`   Estimated tokens: ${result.estimatedTokens.toLocaleString()}`);

    if (result.files.length > 0) {
      console.log(`\n📁 Files to review:`);
      result.files.forEach(file => {
        console.log(`   ${file.relativePath} (${this.formatBytes(file.size)})`);
      });
    }
  }
}
