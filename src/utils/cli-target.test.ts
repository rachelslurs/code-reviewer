import { describe, expect, test } from 'bun:test';
import { resolveTargetPath, positionalArgs, VALUE_FLAGS } from './cli-target.js';

describe('resolveTargetPath', () => {
  test('defaults to the working directory', () => {
    expect(resolveTargetPath([])).toBe('.');
    expect(resolveTargetPath(['--incremental', '--yes'])).toBe('.');
  });

  test('reads a bare positional argument', () => {
    expect(resolveTargetPath(['src'])).toBe('src');
    expect(resolveTargetPath(['test-files/sample.ts'])).toBe('test-files/sample.ts');
  });

  // Each of these resolved to the flag's value before the filter listed the flag.
  test.each([
    [['--model', 'claude-haiku', 'test-files'], 'test-files'],
    [['--compare-with', 'origin/main', 'src'], 'src'],
    [['--fail-on', 'critical', 'src'], 'src'],
    [['--template', 'combined', 'src'], 'src'],
    [['--output', 'json', 'src'], 'src'],
    [['--output-file', 'out.json', 'src'], 'src'],
  ])('skips the value of %j', (args, expected) => {
    expect(resolveTargetPath(args)).toBe(expected);
  });

  // Short flags do not start with '--', so a prefix test alone lets them through.
  test.each([['-i'], ['-w'], ['-y']])('does not treat %s as the target', flag => {
    expect(resolveTargetPath([flag, 'test-files'])).toBe('test-files');
    expect(resolveTargetPath([flag])).toBe('.');
  });

  test('finds the target wherever it sits in the argument list', () => {
    const expected = 'test-files';
    expect(resolveTargetPath(['--model', 'claude-haiku', expected])).toBe(expected);
    expect(resolveTargetPath([expected, '--model', 'claude-haiku'])).toBe(expected);
    expect(resolveTargetPath(['--yes', expected, '--no-cache'])).toBe(expected);
  });

  test('handles a full CI invocation', () => {
    const args = [
      '.', '--template', 'combined', '--incremental',
      '--compare-with', 'origin/main', '--output', 'json',
      '--output-file', 'code-review-ci.json', '--fail-on', 'critical',
      '--ci-mode', '--yes', '--allow-dirty', '--no-cache',
    ];
    expect(resolveTargetPath(args)).toBe('.');
    expect(positionalArgs(args)).toEqual(['.']);
  });

  test('a trailing value flag has no value to skip', () => {
    expect(resolveTargetPath(['src', '--model'])).toBe('src');
    expect(resolveTargetPath(['--model'])).toBe('.');
  });

  test('a value that looks like a path is still consumed as a value', () => {
    // 'src' here is the compare ref, not the target, so the target is the default.
    expect(resolveTargetPath(['--compare-with', 'src'])).toBe('.');
  });

  test('every value flag is covered by the skip logic', () => {
    for (const flag of VALUE_FLAGS) {
      expect(resolveTargetPath([flag, 'some-value', 'target'])).toBe('target');
    }
  });
});
