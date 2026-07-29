import { describe, expect, test } from 'bun:test';
import { renderPrComment, COMMENT_MARKER, type CommentContext } from './pr-comment.js';
import type { ReviewReport, ReviewReportResult } from './review-report.js';
import type { ReviewFinding, Severity } from '../core/review-schema.js';

function finding(severity: Severity, title = `a ${severity} issue`): ReviewFinding {
  return {
    severity,
    category: 'security',
    line: 12,
    title,
    description: 'why it matters',
    suggestedFix: null,
  };
}

function row(overrides: Partial<ReviewReportResult> = {}): ReviewReportResult {
  return {
    filePath: 'src/example.ts',
    template: 'combined',
    hasIssues: false,
    findings: [],
    summary: 'looks fine',
    error: null,
    feedback: 'No issues found.',
    tokensUsed: { input: 10, output: 20 },
    timestamp: '2026-07-28T00:00:00.000Z',
    authMethod: 'api-key',
    ...overrides,
  };
}

function report(results: ReviewReportResult[], templates = ['combined']): ReviewReport {
  return {
    metadata: {
      generatedAt: '2026-07-28T00:00:00.000Z',
      totalFiles: results.length,
      filesWithIssues: results.filter(r => r.hasIssues === true).length,
      filesFailed: results.filter(r => r.hasIssues === null).length,
      totalTokensUsed: 30,
      templates,
    },
    results,
    summary: {
      issueDistribution: {
        totalFiles: results.length,
        filesWithIssues: 0,
        filesClean: 0,
        filesFailed: 0,
        issueRate: null,
      },
    },
  };
}

const CONTEXT: CommentContext = { threshold: 'critical' };

describe('renderPrComment', () => {
  test('always starts with the marker so a re-run can find it', () => {
    expect(renderPrComment(report([row()]), CONTEXT).startsWith(COMMENT_MARKER)).toBe(true);
    expect(renderPrComment(null, CONTEXT).startsWith(COMMENT_MARKER)).toBe(true);
  });

  test('reports a clean run as passing', () => {
    const out = renderPrComment(report([row()]), CONTEXT);
    expect(out).toContain('No findings at or above');
    expect(out).not.toContain('Blocked');
  });

  test('reports findings at the threshold as blocking', () => {
    const out = renderPrComment(
      report([row({ hasIssues: true, findings: [finding('critical')] })]),
      CONTEXT,
    );
    expect(out).toContain('Blocked');
    expect(out).toContain('1 finding(s) at or above `critical`');
    expect(out).toContain('a critical issue');
  });

  test('findings below the threshold appear but do not block', () => {
    const out = renderPrComment(
      report([row({ hasIssues: true, findings: [finding('low'), finding('medium')] })]),
      CONTEXT,
    );
    expect(out).toContain('No findings at or above');
    expect(out).toContain('a low issue');
    expect(out).toContain('a medium issue');
  });

  // findings is null on failure and on the legacy text path.
  test('never dereferences a null findings array', () => {
    const rows = [
      row({ hasIssues: null, findings: null, error: 'timed out' }),
      row({ filePath: 'b.ts', hasIssues: true, findings: null, feedback: 'Critical: something' }),
    ];
    expect(() => renderPrComment(report(rows), CONTEXT)).not.toThrow();
  });

  test('a failed review is called out, not counted as clean', () => {
    const out = renderPrComment(
      report([row({ hasIssues: null, findings: null, error: 'API timeout' })]),
      CONTEXT,
    );
    expect(out).toContain('did not complete');
    expect(out).toContain('API timeout');
    expect(out).not.toContain('No findings at or above');
  });

  test('a verdict with no structured findings is called out separately', () => {
    const out = renderPrComment(
      report([row({ hasIssues: true, findings: null, feedback: 'Critical: injection risk' })]),
      CONTEXT,
    );
    expect(out).toContain('no structured findings');
    expect(out).toContain('Critical: injection risk');
  });

  // --template all yields one row per file per template.
  test('counts distinct files, not rows', () => {
    const rows = [
      row({ filePath: 'a.ts', template: 'security' }),
      row({ filePath: 'a.ts', template: 'quality' }),
      row({ filePath: 'b.ts', template: 'security' }),
    ];
    const out = renderPrComment(report(rows, ['security', 'quality']), CONTEXT);
    expect(out).toContain('2 file(s) reviewed');
    expect(out).not.toContain('3 file(s) reviewed');
  });

  test('sums findings across per-template rows for one file', () => {
    const rows = [
      row({ filePath: 'a.ts', template: 'security', hasIssues: true, findings: [finding('critical')] }),
      row({ filePath: 'a.ts', template: 'quality', hasIssues: true, findings: [finding('critical')] }),
    ];
    const out = renderPrComment(report(rows, ['security', 'quality']), CONTEXT);
    expect(out).toContain('2 finding(s) at or above');
    expect(out).toContain('1 file(s) reviewed');
  });

  test('groups findings into one collapsed block per file', () => {
    const rows = [row({
      filePath: 'a.ts',
      hasIssues: true,
      findings: [finding('critical'), finding('high'), finding('medium'), finding('low')],
    })];
    const out = renderPrComment(report(rows), CONTEXT);
    expect(out).toContain('<details><summary><code>a.ts</code> (1 critical, 1 high, 1 medium, 1 low)');
    // Every finding gets a table row, whatever its severity.
    expect(out).toContain('| 🚨 critical | 12 |');
    expect(out).toContain('| 🔹 low | 12 |');
  });

  // A fifteen-file review produces enough findings that printing every description
  // buries the ones worth acting on.
  test('prints descriptions for critical and high only', () => {
    const rows = [row({
      filePath: 'a.ts',
      hasIssues: true,
      findings: [
        { ...finding('critical'), description: 'CRITICAL DETAIL' },
        { ...finding('low'), description: 'LOW DETAIL' },
      ],
    })];
    const out = renderPrComment(report(rows), CONTEXT);
    expect(out).toContain('CRITICAL DETAIL');
    expect(out).not.toContain('LOW DETAIL');
    // The low finding is still listed, just without its description.
    expect(out).toContain('a low issue');
  });

  test('omits the counts table when there are no findings', () => {
    const out = renderPrComment(report([row()]), CONTEXT);
    expect(out).not.toContain('🚨 critical');
    expect(out).not.toContain('<details>');
  });

  test('marks a whole-file finding instead of printing a null line', () => {
    const bare = { ...finding('critical'), line: null };
    const out = renderPrComment(
      report([row({ filePath: 'a.ts', hasIssues: true, findings: [bare] })]),
      CONTEXT,
    );
    expect(out).toContain('<code>a.ts</code>');
    expect(out).toContain('| 🚨 critical | _file_ |');
    expect(out).not.toContain('null');
  });

  // Model output is not ours: an unescaped </details> closes the block early and
  // mangles everything after it.
  test('escapes markup in finding text', () => {
    const nasty = {
      ...finding('critical', '</details><img src=x onerror=alert(1)>'),
      description: 'closes <details> early',
    };
    const out = renderPrComment(
      report([row({ hasIssues: true, findings: [nasty] })]),
      CONTEXT,
    );
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;img src=x');
    expect(out).toContain('&lt;/details&gt;');
  });

  test('escapes a pipe so it cannot break out of a table cell', () => {
    const piped = finding('low', 'a | b | c');
    const out = renderPrComment(
      report([row({ hasIssues: true, findings: [piped] })]),
      CONTEXT,
    );
    expect(out).toContain('a \\| b \\| c');
  });

  test('renders only a link it built itself', () => {
    const out = renderPrComment(report([row()]), {
      threshold: 'critical',
      runUrl: 'javascript:alert(1)',
    });
    expect(out).not.toContain('<a href');
    expect(out).not.toContain('javascript:');
  });

  test('a missing report renders the incomplete comment rather than throwing', () => {
    const out = renderPrComment(null, { threshold: 'critical' });
    expect(out).toContain('did not complete');
    expect(out).toContain('threshold <code>critical</code>');
  });

  test('the footer carries the commit and run link when given', () => {
    const out = renderPrComment(report([row()]), {
      threshold: 'high',
      commit: 'abc1234def5678',
      runUrl: 'https://example.test/run/1',
    });
    expect(out).toContain('<code>abc1234</code>');
    expect(out).toContain('https://example.test/run/1');
    expect(out).toContain('threshold <code>high</code>');
  });

  test('an empty report is clean, not blocked', () => {
    const out = renderPrComment(report([]), CONTEXT);
    expect(out).toContain('No findings at or above');
    expect(out).toContain('0 file(s) reviewed');
  });

  test('a failed review outranks a threshold finding in the headline', () => {
    const rows = [
      row({ filePath: 'a.ts', hasIssues: true, findings: [finding('critical')] }),
      row({ filePath: 'b.ts', hasIssues: null, findings: null, error: 'boom' }),
    ];
    const out = renderPrComment(report(rows), CONTEXT);
    expect(out).toContain('did not complete');
    // The critical finding is still listed, just not the headline.
    expect(out).toContain('<code>a.ts</code> (1 critical)');
  });
});
