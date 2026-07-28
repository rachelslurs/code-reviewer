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

  // Sonnet's own cap is 128000, so a value between the non-streaming ceiling and
  // the model cap used to pass validation and be returned unclamped, producing the
  // SDK timeout the ceiling exists to prevent.
  test.each(['16001', '64000', '128000'])(
    'rejects %s, which is under the model cap but over the non-streaming ceiling',
    value => {
      expect(withEnv(value, () => resolveMaxTokens('claude-sonnet'))).toBe(16000);
    },
  );

  test('still accepts the ceiling itself', () => {
    expect(withEnv('16000', () => resolveMaxTokens('claude-sonnet'))).toBe(16000);
  });
});
