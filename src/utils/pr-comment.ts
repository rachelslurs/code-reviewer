import { SEVERITY_ORDER, type ReviewFinding, type Severity } from '../core/review-schema.js';
import { evaluateGate, type GateInput } from '../core/severity-gate.js';
import type { ReviewReport, ReviewReportResult } from './review-report.js';

/**
 * Renders a review report as a pull request comment.
 *
 * Kept pure so the counting can be tested without a report on disk or a network
 * call. Everything here that looks defensive is guarding a three-state field:
 * `hasIssues` is boolean-or-null and `findings` is array-or-null, and treating
 * either as a plain boolean or a plain array is how the previous version of this
 * reported failed reviews as clean code.
 */

/** Identifies our comment so a re-run updates it instead of posting another. */
export const COMMENT_MARKER = '<!-- ai-code-review -->';

export interface CommentContext {
  /** The CLI's exit code. 2 means findings at or above the threshold. */
  exitCode: number;
  threshold: Severity;
  commit?: string;
  runUrl?: string;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: '🚨 critical',
  high: '⚠️ high',
  medium: '💡 medium',
  low: '🔹 low',
};

function toGateInput(result: ReviewReportResult): GateInput {
  return { hasIssues: result.hasIssues, findings: result.findings };
}

/** Findings of one severity, tagged with the file they came from. */
function findingsAt(report: ReviewReport, severity: Severity): Array<{
  file: string;
  finding: ReviewFinding;
}> {
  const collected: Array<{ file: string; finding: ReviewFinding }> = [];
  for (const result of report.results) {
    // findings is null on failure and on the legacy text path.
    for (const finding of result.findings ?? []) {
      if (finding.severity === severity) collected.push({ file: result.filePath, finding });
    }
  }
  return collected;
}

function renderFinding(file: string, finding: ReviewFinding): string {
  const location = finding.line === null ? file : `${file}:${finding.line}`;
  const lines = [`- **\`${location}\`**: ${finding.title}`];
  lines.push(`  [${finding.category}] ${finding.description}`);
  if (finding.suggestedFix !== null) {
    lines.push(`  <details><summary>Suggested fix</summary>\n\n  ${finding.suggestedFix}\n\n  </details>`);
  }
  return lines.join('\n');
}

function renderSection(
  report: ReviewReport,
  severity: Severity,
  collapsed: boolean,
): string | null {
  const entries = findingsAt(report, severity);
  if (entries.length === 0) return null;

  const body = entries.map(e => renderFinding(e.file, e.finding)).join('\n');
  const heading = `${SEVERITY_LABEL[severity]} (${entries.length})`;
  if (collapsed) {
    return `<details><summary><strong>${heading}</strong></summary>\n\n${body}\n\n</details>`;
  }
  return `### ${heading}\n\n${body}`;
}

function renderFooter(context: CommentContext): string {
  const parts: string[] = [];
  if (context.commit) parts.push(`commit <code>${context.commit.slice(0, 7)}</code>`);
  if (context.runUrl) parts.push(`<a href="${context.runUrl}">run log</a>`);
  parts.push(`threshold <code>${context.threshold}</code>`);
  return `---\n<sub>${parts.join(' · ')}</sub>`;
}

/** The comment posted when the review never produced a usable report. */
export function renderMissingReport(context: CommentContext): string {
  return [
    COMMENT_MARKER,
    '## 🤖 AI code review',
    '',
    '**The review did not complete.** No report was produced, so nothing was checked.',
    '',
    'See the run log for the failure.',
    '',
    renderFooter(context),
  ].join('\n');
}

export function renderPrComment(
  report: ReviewReport | null,
  context: CommentContext,
): string {
  if (report === null) return renderMissingReport(context);

  const outcome = evaluateGate(report.results.map(toGateInput), context.threshold);
  // Rows are per file per template, so the same file appears more than once
  // under --template all. metadata.totalFiles counts rows, not files.
  const fileCount = new Set(report.results.map(r => r.filePath)).size;
  const failed = report.results.filter(r => r.hasIssues === null);
  const unmeasurable = report.results.filter(r => r.hasIssues === true && r.findings === null);
  const withFindings = new Set(
    report.results.filter(r => (r.findings ?? []).length > 0).map(r => r.filePath),
  ).size;

  const lines: string[] = [COMMENT_MARKER, '## 🤖 AI code review', ''];

  if (failed.length > 0) {
    lines.push(`⚠️ **${failed.length} review(s) did not complete.** The result is incomplete.`);
  } else if (outcome.reason === 'unclassified') {
    lines.push(`⚠️ **${unmeasurable.length} review(s) returned no structured findings.**`);
  } else if (outcome.atOrAbove > 0) {
    lines.push(`🚨 **Blocked. ${outcome.atOrAbove} finding(s) at or above \`${context.threshold}\`.**`);
  } else {
    lines.push(`✅ **No findings at or above \`${context.threshold}\`.**`);
  }
  lines.push('');

  lines.push('| | ' + SEVERITY_ORDER.join(' | ') + ' |');
  lines.push('|---|' + SEVERITY_ORDER.map(() => '---|').join(''));
  lines.push(
    '| findings | ' +
      SEVERITY_ORDER.map(s => {
        const n = outcome.counts[s];
        return n > 0 && s === context.threshold ? `**${n}**` : String(n);
      }).join(' | ') +
      ' |',
  );
  lines.push('');

  const templates = report.metadata.templates.join(', ') || 'none';
  lines.push(
    `${fileCount} file(s) reviewed · ${withFindings} with findings · ` +
      `${failed.length} failed · \`${templates}\``,
  );
  lines.push('');

  // Critical and high are expanded; the rest fold away so the comment stays short.
  for (const severity of SEVERITY_ORDER) {
    const collapsed = severity === 'medium' || severity === 'low';
    const section = renderSection(report, severity, collapsed);
    if (section !== null) {
      lines.push(section);
      lines.push('');
    }
  }

  if (failed.length > 0) {
    lines.push('### ⚠️ Reviews that did not complete');
    lines.push('');
    for (const result of failed) {
      lines.push(`- **\`${result.filePath}\`** (${result.template}): ${result.error ?? 'no error reported'}`);
    }
    lines.push('');
  }

  if (unmeasurable.length > 0) {
    lines.push('### ⚠️ Reviews with no structured findings');
    lines.push('');
    for (const result of unmeasurable) {
      const excerpt = result.feedback.trim().split('\n')[0] ?? '';
      lines.push(`- **\`${result.filePath}\`** (${result.template}): ${excerpt.slice(0, 200)}`);
    }
    lines.push('');
  }

  lines.push(renderFooter(context));
  return lines.join('\n');
}
