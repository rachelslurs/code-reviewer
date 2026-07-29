import type { ReviewFinding } from '../core/review-schema.js';

/**
 * The shape of the `--output json` report.
 *
 * formatJSON built this as an anonymous object literal, so nothing connected the
 * producer to anything reading the file back. The previous CI attempt read
 * `.some(r => r.hasIssues)` off this top-level object rather than off `results`,
 * got undefined, and reported every pull request clean for nine months. Naming the
 * type means a rename breaks the build instead.
 */

export interface ReviewReportMetadata {
  generatedAt: string;
  /**
   * Rows, not distinct files. `--template all` produces one row per file per
   * template, so count `new Set(results.map(r => r.filePath)).size` for files.
   */
  totalFiles: number;
  filesWithIssues: number;
  filesFailed: number;
  totalTokensUsed: number;
  templates: string[];
}

export interface ReviewReportResult {
  filePath: string;
  template: string;
  /** null when the review failed and never reached a verdict. */
  hasIssues: boolean | null;
  /** null on the legacy text path and on failure. Never dereference it directly. */
  findings: ReviewFinding[] | null;
  summary: string | null;
  error: string | null;
  /** Rendered review text. Never empty, so text consumers keep working. */
  feedback: string;
  tokensUsed: { input: number; output: number };
  timestamp: string;
  authMethod: 'claude-code' | 'api-key';
}

export interface ReviewReportSummary {
  issueDistribution: {
    totalFiles: number;
    filesWithIssues: number;
    filesClean: number;
    filesFailed: number;
    /** null when no file produced a verdict, rather than NaN. */
    issueRate: string | null;
  };
}

export interface ReviewReport {
  metadata: ReviewReportMetadata;
  results: ReviewReportResult[];
  summary: ReviewReportSummary;
}

/**
 * Reads a report back off disk.
 *
 * The file is written by this same tool moments earlier, so this checks the two
 * things a truncated or half-written file would break rather than validating every
 * field: that it parsed, and that `results` is an array to iterate.
 */
export function parseReviewReport(raw: string): ReviewReport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== 'object') return null;
  const report = parsed as Partial<ReviewReport>;
  if (!Array.isArray(report.results)) return null;
  if (report.metadata === undefined || typeof report.metadata !== 'object') return null;

  return report as ReviewReport;
}
