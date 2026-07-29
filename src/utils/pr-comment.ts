import { SEVERITY_ORDER, type ReviewFinding, type Severity } from '../core/review-schema.js';
import { evaluateGate, type GateInput } from '../core/severity-gate.js';
import type { ReviewReport, ReviewReportResult } from './review-report.js';

/**
 * Renders a review report as a pull request comment.
 *
 * Grouped by file and collapsed, because a review of a fifteen-file change produces
 * enough findings that listing them all at full length buries the ones worth acting
 * on. Detail is kept for critical and high; the rest is a line in a table.
 *
 * Kept pure so the counting can be tested without a report on disk or a network call.
 * Everything that looks defensive is guarding a three-state field: `hasIssues` is
 * boolean-or-null and `findings` is array-or-null, and treating either as a plain
 * boolean or a plain array reports a review that never ran as clean code.
 */

/** Identifies our comment so a re-run updates it instead of posting another. */
export const COMMENT_MARKER = '<!-- ai-code-review -->';

export interface CommentContext {
  threshold: Severity;
  commit?: string;
  runUrl?: string;
}

const SEVERITY_ICON: Record<Severity, string> = {
  critical: '🚨',
  high: '⚠️',
  medium: '💡',
  low: '🔹',
};

/** Findings whose full description is worth reading in the comment. */
const DETAILED: readonly Severity[] = ['critical', 'high'];

/**
 * Neutralises markup in model output.
 *
 * Findings are written by a model reading files from the pull request, so their text
 * is not ours. An unescaped `</details>` closes a block early and mangles everything
 * after it, which is the specific way the previous version of this comment broke.
 */
function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escaped and flattened, so it cannot break out of a table cell. */
function escapeCell(value: string): string {
  return escapeText(value).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd() + '…';
}

/** A finding paired with the file it came from. */
interface Located {
  path: string;
  finding: ReviewFinding;
}

function allFindings(report: ReviewReport): Located[] {
  const located: Located[] = [];
  for (const result of report.results) {
    // findings is null on failure and on the legacy text path.
    for (const finding of result.findings ?? []) {
      located.push({ path: result.filePath, finding });
    }
  }
  return located;
}

function toGateInput(result: ReviewReportResult): GateInput {
  return { hasIssues: result.hasIssues, findings: result.findings };
}

function bySeverityThenLine(a: Located, b: Located): number {
  return (
    SEVERITY_ORDER.indexOf(a.finding.severity) - SEVERITY_ORDER.indexOf(b.finding.severity) ||
    (a.finding.line ?? 0) - (b.finding.line ?? 0)
  );
}

function countLabel(findings: readonly ReviewFinding[]): string {
  return SEVERITY_ORDER
    .map(severity => ({ severity, n: findings.filter(f => f.severity === severity).length }))
    .filter(entry => entry.n > 0)
    .map(entry => `${entry.n} ${entry.severity}`)
    .join(', ');
}

function renderFooter(context: CommentContext): string {
  const parts: string[] = [];
  if (context.commit) parts.push(`commit <code>${escapeText(context.commit.slice(0, 7))}</code>`);
  // Only a link we built ourselves is rendered as one.
  if (context.runUrl?.startsWith('https://')) {
    parts.push(`<a href="${escapeText(context.runUrl)}">run log</a>`);
  }
  parts.push(`threshold <code>${context.threshold}</code>`);
  return `---\n<sub>${parts.join(' · ')}</sub>`;
}

/** One collapsed block per file: a table of every finding, detail for the worst. */
function renderFileSection(path: string, located: Located[]): string {
  const ordered = [...located].sort(bySeverityThenLine);
  const lines = [
    `<details><summary><code>${escapeText(path)}</code> (${countLabel(ordered.map(l => l.finding))})</summary>`,
    '',
    '| | line | finding |',
    '|---|---|---|',
  ];

  for (const { finding } of ordered) {
    // A finding about the file as a whole has no line to point at.
    const where = finding.line === null ? '_file_' : String(finding.line);
    lines.push(
      `| ${SEVERITY_ICON[finding.severity]} ${finding.severity} | ${where} | ${escapeCell(finding.title)} |`,
    );
  }

  for (const { finding } of ordered.filter(l => DETAILED.includes(l.finding.severity))) {
    lines.push('');
    const where = finding.line === null ? '' : ` (line ${finding.line})`;
    lines.push(`**${SEVERITY_ICON[finding.severity]} ${escapeText(finding.title)}**${where}`);
    lines.push('');
    lines.push(truncate(escapeText(finding.description), 1500));
    if (finding.suggestedFix !== null) {
      lines.push('');
      lines.push(`_Suggested fix:_ ${truncate(escapeCell(finding.suggestedFix), 600)}`);
    }
  }

  lines.push('');
  lines.push('</details>');
  return lines.join('\n');
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
  // Rows are per file per template, so one file appears more than once under
  // --template all. metadata.totalFiles counts rows, not files.
  const fileCount = new Set(report.results.map(r => r.filePath)).size;
  const failed = report.results.filter(r => r.hasIssues === null);
  const unmeasurable = report.results.filter(r => r.hasIssues === true && r.findings === null);
  const located = allFindings(report);

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

  // Only the severities actually present, so a clean run does not print a row of
  // zeroes and an empty leading header cell.
  const present = SEVERITY_ORDER.filter(severity => outcome.counts[severity] > 0);
  if (present.length > 0) {
    lines.push('| ' + present.map(s => `${SEVERITY_ICON[s]} ${s}`).join(' | ') + ' |');
    lines.push('|' + present.map(() => '---|').join(''));
    lines.push(
      '| ' +
        present
          .map(s => (s === context.threshold ? `**${outcome.counts[s]}**` : String(outcome.counts[s])))
          .join(' | ') +
        ' |',
    );
    lines.push('');
  }

  const parts = [`${fileCount} file(s) reviewed`];
  if (failed.length > 0) parts.push(`${failed.length} failed`);
  lines.push(parts.join(' · '));
  lines.push('');

  const byFile = new Map<string, Located[]>();
  for (const entry of located) {
    const existing = byFile.get(entry.path);
    if (existing) existing.push(entry);
    else byFile.set(entry.path, [entry]);
  }

  // Files carrying the most severe findings first, so the block worth opening is on top.
  const worst = (path: string) =>
    Math.min(...byFile.get(path)!.map(l => SEVERITY_ORDER.indexOf(l.finding.severity)));
  const paths = [...byFile.keys()].sort((a, b) => worst(a) - worst(b) || a.localeCompare(b));

  for (const path of paths) {
    lines.push(renderFileSection(path, byFile.get(path)!));
    lines.push('');
  }

  if (failed.length > 0) {
    lines.push('### ⚠️ Reviews that did not complete');
    lines.push('');
    for (const result of failed) {
      lines.push(
        `- \`${escapeText(result.filePath)}\`: ${escapeCell(result.error ?? 'no error reported')}`,
      );
    }
    lines.push('');
  }

  if (unmeasurable.length > 0) {
    lines.push('### ⚠️ Reviews with no structured findings');
    lines.push('');
    for (const result of unmeasurable) {
      const excerpt = result.feedback.trim().split('\n')[0] ?? '';
      lines.push(`- \`${escapeText(result.filePath)}\`: ${escapeCell(truncate(excerpt, 200))}`);
    }
    lines.push('');
  }

  lines.push(renderFooter(context));
  return lines.join('\n');
}
