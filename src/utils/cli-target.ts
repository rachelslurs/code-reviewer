/**
 * Finds the review target among the CLI arguments.
 *
 * The target is positional, so it is whatever is left once the flags and their
 * values are removed. The subtlety is that a flag's value does not start with a
 * dash, so every value-taking flag has to be named here or its value gets read as
 * the path: `--model claude-haiku .` resolved to `claude-haiku`, and FileScanner
 * then died on statSync().
 */

/** Flags whose value is the next argument. */
export const VALUE_FLAGS = [
  '--template',
  '--output',
  '--output-file',
  '--model',
  '--compare-with',
  '--fail-on',
] as const;

/** The argument indices holding a value for one of VALUE_FLAGS. */
function valueFlagPositions(args: readonly string[]): Set<number> {
  const positions = new Set<number>();
  for (const flag of VALUE_FLAGS) {
    const index = args.indexOf(flag);
    // A trailing flag has no value to skip, and args[index + 1] would be undefined.
    if (index !== -1 && index < args.length - 1) positions.add(index + 1);
  }
  return positions;
}

/**
 * Everything that is neither a flag nor a flag's value, in order.
 *
 * Any argument starting with a dash is dropped, which covers the short forms
 * (-y, -i, -w) that a '--' prefix test misses.
 */
export function positionalArgs(args: readonly string[]): string[] {
  const skip = valueFlagPositions(args);
  return args.filter((arg, index) => {
    if ((VALUE_FLAGS as readonly string[]).includes(arg)) return false;
    if (skip.has(index)) return false;
    return !arg.startsWith('-');
  });
}

/** The review target, defaulting to the working directory. */
export function resolveTargetPath(args: readonly string[]): string {
  return positionalArgs(args)[0] ?? '.';
}
