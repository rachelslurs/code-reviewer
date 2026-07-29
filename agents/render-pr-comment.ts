#!/usr/bin/env bun

/**
 * Renders a review report as pull request comment markdown on stdout.
 *
 * Always exits 0 and always writes a usable comment, including when the report is
 * missing or unreadable. Turning the run red is the workflow's job; if this exited
 * non-zero on a missing report the comment step would be skipped and the pull
 * request would show a red check with no explanation of what happened.
 */

import { readFileSync } from 'fs';
import { parseReviewReport, type ReviewReport } from '../src/utils/review-report.js';
import { renderPrComment } from '../src/utils/pr-comment.js';
import { parseSeverity } from '../src/core/severity-gate.js';

const reportPath = process.env.REVIEW_JSON ?? 'code-review-ci.json';
const threshold = parseSeverity(process.env.REVIEW_THRESHOLD ?? 'critical') ?? 'critical';

let report: ReviewReport | null = null;
try {
  report = parseReviewReport(readFileSync(reportPath, 'utf8'));
  if (report === null) {
    console.error(`Could not parse ${reportPath}; rendering the incomplete-review comment.`);
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Could not read ${reportPath}: ${detail}`);
}

process.stdout.write(
  renderPrComment(report, {
    threshold,
    commit: process.env.REVIEW_COMMIT,
    runUrl: process.env.REVIEW_RUN_URL,
  }) + '\n',
);
