import { SEVERITY_ORDER, type ReviewFinding, type Severity } from './review-schema.js';
import { summarizeVerdicts } from './reviewer.js';

/**
 * Decides whether a set of review results should fail the caller.
 *
 * Kept separate from the CLI so the counting can be tested without running a
 * review. Miscounting here is the failure that matters: a gate that reports clean
 * because it read the wrong field is worse than no gate, since it looks like a
 * passing check.
 */

/**
 * Structural, so both a ReviewResult and a row parsed back out of the JSON report
 * satisfy it without either side importing the other.
 */
export interface GateInput {
  hasIssues: boolean | null;
  findings: readonly ReviewFinding[] | null;
}

export type SeverityCounts = Record<Severity, number>;

export type GateFailure = 'threshold' | 'review-failed' | 'unclassified';

export interface GateOutcome {
  counts: SeverityCounts;
  /** Findings at or above the threshold. */
  atOrAbove: number;
  /** Reviews that never reached a verdict. */
  failedReviews: number;
  /** Verdicts of "has issues" with no structured findings to measure. */
  unclassified: number;
  shouldFail: boolean;
  reason: GateFailure | null;
}

export function parseSeverity(raw: string): Severity | null {
  const normalized = raw.trim().toLowerCase();
  return SEVERITY_ORDER.find(severity => severity === normalized) ?? null;
}

/** True when `severity` is at least as severe as `threshold`. */
export function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_ORDER.indexOf(severity) <= SEVERITY_ORDER.indexOf(threshold);
}

function emptyCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0 };
}

export function countBySeverity(results: readonly GateInput[]): SeverityCounts {
  const counts = emptyCounts();
  for (const result of results) {
    // findings is null on the legacy text path and whenever the review failed.
    for (const finding of result.findings ?? []) {
      counts[finding.severity] += 1;
    }
  }
  return counts;
}

/**
 * A null verdict means the review never happened, so it fails as an error rather
 * than as a finding: reporting "critical findings" for what was actually a timeout
 * would be wrong, and passing it reproduces the silent-green bug this replaces.
 *
 * The same goes for a verdict of "has issues" with no findings attached. The gate
 * only passes a result it could actually measure; the alternative is grepping
 * English prose for the word "critical", which is how the previous attempt at this
 * decided severity.
 *
 * When findings and failures coexist the failure wins, because an incomplete review
 * is the more important thing to say. Both are reported either way.
 */
export function evaluateGate(
  results: readonly GateInput[],
  threshold: Severity,
): GateOutcome {
  const counts = countBySeverity(results);
  const atOrAbove = SEVERITY_ORDER
    .filter(severity => meetsThreshold(severity, threshold))
    .reduce((sum, severity) => sum + counts[severity], 0);

  // summarizeVerdicts owns the three-state null handling; recounting it here is how
  // the six previous copies of this logic drifted apart.
  const failedReviews = summarizeVerdicts(results).failed;
  const unclassified = results.filter(
    result => result.hasIssues === true && result.findings === null,
  ).length;

  let reason: GateFailure | null = null;
  if (failedReviews > 0) reason = 'review-failed';
  else if (unclassified > 0) reason = 'unclassified';
  else if (atOrAbove > 0) reason = 'threshold';

  return {
    counts,
    atOrAbove,
    failedReviews,
    unclassified,
    shouldFail: reason !== null,
    reason,
  };
}

/** One line for the terminal, naming what tripped the gate. */
export function describeGate(outcome: GateOutcome, threshold: Severity): string {
  if (outcome.reason === 'review-failed') {
    return `❌ ${outcome.failedReviews} review(s) did not complete, so the result is not trustworthy.`;
  }
  if (outcome.reason === 'unclassified') {
    return `❌ ${outcome.unclassified} review(s) reported issues with no structured findings to measure.`;
  }
  if (outcome.reason === 'threshold') {
    return `❌ ${outcome.atOrAbove} finding(s) at or above ${threshold}.`;
  }
  return `✅ No findings at or above ${threshold}.`;
}
