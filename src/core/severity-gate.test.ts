import { describe, expect, test } from 'bun:test';
import {
  countBySeverity,
  evaluateGate,
  meetsThreshold,
  parseSeverity,
  type GateInput,
} from './severity-gate.js';
import type { ReviewFinding, Severity } from './review-schema.js';

function finding(severity: Severity): ReviewFinding {
  return {
    severity,
    category: 'quality',
    line: null,
    title: `a ${severity} finding`,
    description: 'description',
    suggestedFix: null,
  };
}

/** A completed review that found the given severities. */
function reviewed(...severities: Severity[]): GateInput {
  return { hasIssues: severities.length > 0, findings: severities.map(finding) };
}

const CLEAN: GateInput = { hasIssues: false, findings: [] };
/** The review never reached a verdict. */
const FAILED: GateInput = { hasIssues: null, findings: null };
/** A verdict with nothing structured to measure, from the legacy text path. */
const UNCLASSIFIED: GateInput = { hasIssues: true, findings: null };

describe('parseSeverity', () => {
  test.each(['critical', 'high', 'medium', 'low'])('accepts %s', raw => {
    expect(parseSeverity(raw)).toBe(raw as Severity);
  });

  test('normalises case and surrounding space', () => {
    expect(parseSeverity('  Critical ')).toBe('critical');
    expect(parseSeverity('HIGH')).toBe('high');
  });

  test.each(['bogus', '', 'criticals', 'CRITICAL!'])('rejects %j', raw => {
    expect(parseSeverity(raw)).toBeNull();
  });
});

describe('meetsThreshold', () => {
  test('a severity always meets itself', () => {
    expect(meetsThreshold('critical', 'critical')).toBe(true);
    expect(meetsThreshold('low', 'low')).toBe(true);
  });

  test('more severe meets a looser threshold', () => {
    expect(meetsThreshold('critical', 'low')).toBe(true);
    expect(meetsThreshold('high', 'medium')).toBe(true);
  });

  test('less severe does not meet a stricter threshold', () => {
    expect(meetsThreshold('high', 'critical')).toBe(false);
    expect(meetsThreshold('low', 'critical')).toBe(false);
  });
});

describe('countBySeverity', () => {
  test('counts nothing for an empty result set', () => {
    expect(countBySeverity([])).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
  });

  test('never dereferences a null findings array', () => {
    expect(() => countBySeverity([FAILED, UNCLASSIFIED])).not.toThrow();
    expect(countBySeverity([FAILED, UNCLASSIFIED])).toEqual({
      critical: 0, high: 0, medium: 0, low: 0,
    });
  });

  test('sums findings across results', () => {
    const results = [reviewed('critical', 'low'), reviewed('critical', 'high'), CLEAN];
    expect(countBySeverity(results)).toEqual({ critical: 2, high: 1, medium: 0, low: 1 });
  });
});

describe('evaluateGate', () => {
  test('passes when everything is clean', () => {
    const outcome = evaluateGate([CLEAN, CLEAN], 'critical');
    expect(outcome.shouldFail).toBe(false);
    expect(outcome.reason).toBeNull();
    expect(outcome.atOrAbove).toBe(0);
  });

  test('passes on an empty result set', () => {
    expect(evaluateGate([], 'critical').shouldFail).toBe(false);
  });

  test('fails on a finding at the threshold', () => {
    const outcome = evaluateGate([reviewed('critical')], 'critical');
    expect(outcome.shouldFail).toBe(true);
    expect(outcome.reason).toBe('threshold');
    expect(outcome.atOrAbove).toBe(1);
  });

  test('passes when findings sit below the threshold', () => {
    const outcome = evaluateGate([reviewed('high', 'medium', 'low')], 'critical');
    expect(outcome.shouldFail).toBe(false);
    expect(outcome.atOrAbove).toBe(0);
    // The findings are still counted, so the comment can report them.
    expect(outcome.counts).toEqual({ critical: 0, high: 1, medium: 1, low: 1 });
  });

  test('counts everything at or above a looser threshold', () => {
    const outcome = evaluateGate([reviewed('critical', 'high', 'medium', 'low')], 'medium');
    expect(outcome.atOrAbove).toBe(3);
    expect(outcome.reason).toBe('threshold');
  });

  // A failed review is an error, not a finding. Passing it is the silent-green bug.
  test('fails when a review did not complete, even among clean results', () => {
    const outcome = evaluateGate([CLEAN, FAILED, CLEAN], 'critical');
    expect(outcome.shouldFail).toBe(true);
    expect(outcome.reason).toBe('review-failed');
    expect(outcome.failedReviews).toBe(1);
    expect(outcome.atOrAbove).toBe(0);
  });

  test('fails on a verdict it cannot measure', () => {
    const outcome = evaluateGate([CLEAN, UNCLASSIFIED], 'critical');
    expect(outcome.shouldFail).toBe(true);
    expect(outcome.reason).toBe('unclassified');
    expect(outcome.unclassified).toBe(1);
  });

  // Both make the check red, so precedence only decides the headline. An incomplete
  // review is the more important thing to say.
  test('a failed review outranks a finding at the threshold', () => {
    const outcome = evaluateGate([reviewed('critical'), FAILED], 'critical');
    expect(outcome.reason).toBe('review-failed');
    expect(outcome.atOrAbove).toBe(1);
    expect(outcome.failedReviews).toBe(1);
  });

  test('a failed review outranks an unmeasurable one', () => {
    expect(evaluateGate([UNCLASSIFIED, FAILED], 'critical').reason).toBe('review-failed');
  });

  // --template all produces one row per file per template.
  test('sums findings across per-template rows for the same file', () => {
    const rows = [reviewed('high'), reviewed('critical'), reviewed('low')];
    const outcome = evaluateGate(rows, 'critical');
    expect(outcome.atOrAbove).toBe(1);
    expect(outcome.counts).toEqual({ critical: 1, high: 1, medium: 0, low: 1 });
  });

  test('a clean verdict with an empty findings array is not unclassified', () => {
    const outcome = evaluateGate([{ hasIssues: false, findings: [] }], 'critical');
    expect(outcome.unclassified).toBe(0);
    expect(outcome.shouldFail).toBe(false);
  });
});
