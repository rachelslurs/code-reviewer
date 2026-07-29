import { describe, expect, test } from 'bun:test';
import { shouldRetryReview, MAX_REVIEW_ATTEMPTS } from './reviewer.js';

const OK = { review: { findings: [], summary: 'clean' } };
const SCHEMA_MISS = { review: null, error: 'payload does not match the review schema' };
const NO_TOOL_CALL = { review: null, error: 'Model returned no submit_review tool call.' };
const TRUNCATED = { review: null, error: 'Response truncated at 16000 output tokens.' };

describe('shouldRetryReview', () => {
  test('a usable review is never retried', () => {
    expect(shouldRetryReview(OK, 1)).toBe(false);
  });

  // All three are properties of the response, not of the file, so the same request
  // can succeed on a second attempt.
  test.each([
    ['a schema mismatch', SCHEMA_MISS],
    ['a missing tool call', NO_TOOL_CALL],
    ['a truncated response', TRUNCATED],
  ])('%s is retried', (_label, result) => {
    expect(shouldRetryReview(result, 1)).toBe(true);
  });

  test('stops at the attempt limit', () => {
    expect(shouldRetryReview(SCHEMA_MISS, MAX_REVIEW_ATTEMPTS)).toBe(false);
    expect(shouldRetryReview(SCHEMA_MISS, MAX_REVIEW_ATTEMPTS + 1)).toBe(false);
  });

  test('retries exactly once by default', () => {
    expect(MAX_REVIEW_ATTEMPTS).toBe(2);
    expect(shouldRetryReview(SCHEMA_MISS, 1)).toBe(true);
    expect(shouldRetryReview(SCHEMA_MISS, 2)).toBe(false);
  });

  test('honours an explicit limit', () => {
    expect(shouldRetryReview(SCHEMA_MISS, 1, 1)).toBe(false);
    expect(shouldRetryReview(SCHEMA_MISS, 2, 4)).toBe(true);
  });

  // A null review with no error is the legacy text path, which produced output.
  test('a null review with no error is not a failure to retry', () => {
    expect(shouldRetryReview({ review: null }, 1)).toBe(false);
  });
});
