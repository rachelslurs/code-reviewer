import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface CodeReviewConfig {
  apiKey?: string;
  maxFileSize: number;
  outputFormat: 'terminal' | 'markdown' | 'json';
  defaultTemplate: 'security' | 'performance' | 'quality' | 'typescript' | 'all';
  ignorePatterns: string[];
  requireCleanGit: boolean;
}

export const DEFAULT_CONFIG: CodeReviewConfig = {
  maxFileSize: 51200, // 50KB
  outputFormat: 'terminal',
  defaultTemplate: 'quality',
  ignorePatterns: [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    '.next/**',
    'out/**',
    'coverage/**',
    '**/*.{png,jpg,jpeg,gif,svg,ico,webp}',
    '**/*.{woff,woff2,ttf,eot}',
    '**/*.{mp4,mp3,wav,avi}',
    '**/*.{zip,tar,gz,rar}',
    'package-lock.json',
    'yarn.lock',
    'bun.lockb',
    '**/*.min.js',
    '**/*.bundle.js'
  ],
  requireCleanGit: true
};

export class ConfigManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || join(process.cwd(), '.codereview.json');
  }

  load(): CodeReviewConfig {
    if (existsSync(this.configPath)) {
      try {
        const configFile = readFileSync(this.configPath, 'utf-8');
        const userConfig = JSON.parse(configFile);
        return { ...DEFAULT_CONFIG, ...userConfig };
      } catch (error) {
        console.warn(`Warning: Could not parse config file. Using defaults.`);
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  }

  save(config: Partial<CodeReviewConfig>): void {
    const currentConfig = this.load();
    const newConfig = { ...currentConfig, ...config };
    writeFileSync(this.configPath, JSON.stringify(newConfig, null, 2));
    console.log(`Config saved to ${this.configPath}`);
  }

  exists(): boolean {
    return existsSync(this.configPath);
  }
}
