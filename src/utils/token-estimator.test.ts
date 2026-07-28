import { describe, expect, test } from 'bun:test';
import { resolveMaxTokens } from './token-estimator.js';

function withEnv(value: string | undefined, fn: () => number): number {
  const prev = process.env.CODE_REVIEW_MAX_TOKENS;
  if (value === undefined) delete process.env.CODE_REVIEW_MAX_TOKENS;
  else process.env.CODE_REVIEW_MAX_TOKENS = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.CODE_REVIEW_MAX_TOKENS;
    else process.env.CODE_REVIEW_MAX_TOKENS = prev;
  }
}

describe('resolveMaxTokens', () => {
  test('clamps the model cap to the non-streaming ceiling', () => {
    expect(withEnv(undefined, () => resolveMaxTokens('claude-sonnet'))).toBe(16000);
    expect(withEnv(undefined, () => resolveMaxTokens('unknown-model'))).toBe(4000);
  });

  test('accepts a whole number in range', () => {
    expect(withEnv('300', () => resolveMaxTokens('claude-sonnet'))).toBe(300);
    expect(withEnv(' 8000 ', () => resolveMaxTokens('claude-sonnet'))).toBe(8000);
  });

  test.each([
    ['a thousands separator', '16.000'],
    ['a fraction', '1.5'],
    ['zero', '0'],
    ['a negative', '-5'],
    ['above the model cap', '999999'],
    ['exponent notation', '1e4'],
    ['nonsense', 'abc'],
    ['empty', ''],
  ])('ignores %s and falls back', (_label, value) => {
    expect(withEnv(value, () => resolveMaxTokens('claude-sonnet'))).toBe(16000);
  });
});
