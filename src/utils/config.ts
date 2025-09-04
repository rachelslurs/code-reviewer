import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface CodeReviewConfig {
  apiKey?: string;
  geminiApiKey?: string;
  maxFileSize: number;
  outputFormat: 'terminal' | 'markdown' | 'json' | 'html';
  defaultTemplate: 'security' | 'performance' | 'quality' | 'typescript' | 'combined' | 'all';
  ignorePatterns: string[];
  requireCleanGit: boolean;
  outputFile?: string; // Optional output file path
  
  // Multi-model configuration
  multiModel?: {
    primaryModel: string;
    fallbackModels: string[];
    templateMappings: Record<string, string>;
    comparisonMode: boolean;
    maxRetries: number;
    timeout: number;
  };
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
  requireCleanGit: true,
  
  // Smart multi-model defaults
  multiModel: {
    primaryModel: 'claude-sonnet',
    fallbackModels: ['claude-haiku', 'gemini-flash', 'gemini-pro'],
    templateMappings: {
      'security': 'claude-sonnet',     // Claude excels at security
      'quality': 'gemini-flash',       // Use Flash instead of Pro for free tier
      'performance': 'gemini-flash',   // Use Flash instead of Pro for free tier
      'typescript': 'gemini-flash',    // Fast for type checking
      'combined': 'claude-sonnet',     // Claude better for comprehensive
    },
    comparisonMode: false,
    maxRetries: 2,
    timeout: 60000 // 60 seconds
  }
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
