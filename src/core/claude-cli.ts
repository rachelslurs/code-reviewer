import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  anthropicInputSchema,
  normalizeReviewResponse,
  type StructuredReview,
} from './review-schema.js';

/**
 * Structured review over the Claude Code CLI, for users on a subscription rather
 * than API credits.
 *
 * `claude --print` is a full agentic session, not a single API call. Left alone it
 * loads the project CLAUDE.md, skills and plugins (~170k cached tokens), escalates
 * to Opus, and spends turns shelling out to tools. The flags below cut a measured
 * run from $0.90 to roughly $0.19 by removing that context and holding it to one
 * short exchange.
 */

export interface ClaudeCliResult {
  review: StructuredReview | null;
  error?: string;
  /**
   * True when the CLI could not be reached or exited non-zero, as opposed to
   * returning a response that failed validation. Callers throw on this so the
   * model-fallback chain still fires; a schema violation is not retryable and is
   * reported instead.
   */
  transportFailed?: boolean;
  /** Whatever came back when it failed validation, so callers can still show it. */
  rawPayload?: unknown;
  /** Subscription budget consumed, in API-equivalent dollars. */
  costUsd: number;
  tokensUsed: { input: number; output: number };
}

interface CliEnvelope {
  is_error?: boolean;
  subtype?: string;
  result?: unknown;
  structured_output?: unknown;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

/** Two turns is the documented minimum: the second one emits the structured output. */
const MAX_TURNS = 4;

function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Whether the Claude Code CLI is installed and authenticated.
 *
 * Reads the structured envelope rather than scanning the reply text. The previous
 * substring check asked the model "auth test" and looked for the word
 * "authentication" in the answer; the model would reply asking what was meant by
 * it, mentioning "authentication/authorization", and the probe read its own prompt
 * echoed back as an auth failure.
 */
export type ClaudeCliStatus = 'ready' | 'errored' | 'unavailable';

/**
 * Whether the Claude Code CLI is installed and usable.
 *
 * Three states, not two. A parseable envelope means the CLI ran, so `errored`
 * covers a session that started and then failed for a reason of its own, such as a
 * usage limit. Collapsing that into "unauthenticated" tells a rate-limited user to
 * run `claude setup-token`, which does not help and is not true.
 *
 * Reads the envelope rather than scanning the reply text. The previous substring
 * check asked the model "auth test" and looked for the word "authentication" in the
 * answer; the model would reply asking what was meant by it, mentioning
 * "authentication/authorization", and the probe read that as an auth failure.
 */
export function probeClaudeCodeCli(): { status: ClaudeCliStatus; detail?: string } {
  const promptFile = join(tmpdir(), `code-review-auth-${Date.now()}.txt`);
  try {
    // Same shell-pipe form as the review call. execSync's `input` option makes the
    // CLI exit with is_error and duration_api_ms: 0 without attempting a request.
    writeFileSync(promptFile, 'Reply with exactly: OK');
    const raw = execSync(
      `cat ${JSON.stringify(promptFile)} | claude --print --safe-mode --model haiku --output-format json`,
      { encoding: 'utf8', stdio: 'pipe', timeout: 60000, shell: '/bin/sh' },
    );
    const envelope = parseJsonOrNull(raw) as CliEnvelope | null;
    if (envelope === null) return { status: 'unavailable', detail: 'CLI returned output that is not JSON' };
    if (envelope.is_error) return { status: 'errored', detail: envelope.subtype ?? 'unknown error' };
    return { status: 'ready' };
  } catch (error) {
    const stdout = String((error as { stdout?: unknown }).stdout ?? '');
    const envelope = parseJsonOrNull(stdout) as CliEnvelope | null;
    // A JSON envelope on a non-zero exit still proves the CLI is installed and ran.
    if (envelope !== null) return { status: 'errored', detail: envelope.subtype ?? 'unknown error' };
    return { status: 'unavailable', detail: error instanceof Error ? error.message : String(error) };
  } finally {
    try { unlinkSync(promptFile); } catch { /* best effort */ }
  }
}

/** Back-compatible boolean: an errored-but-present CLI is still worth attempting. */
export function probeClaudeCodeAuth(): boolean {
  const { status, detail } = probeClaudeCodeCli();
  if (status === 'errored') {
    console.warn(`⚠️  Claude Code CLI responded with an error (${detail}). Attempting it anyway; the real message will surface on the first review.`);
  }
  return status !== 'unavailable';
}

export function reviewViaClaudeCli(
  prompt: string,
  model: string,
  timeoutMs: number,
): ClaudeCliResult {
  const empty = { input: 0, output: 0 };

  // The prompt goes through a temp file and a shell pipe. Passing it via
  // execSync's `input` option makes the CLI exit with is_error and
  // duration_api_ms: 0, without attempting a request.
  const promptFile = join(tmpdir(), `code-review-prompt-${Date.now()}.txt`);

  let raw: string;
  try {
    writeFileSync(promptFile, prompt);
    raw = execSync(
      [
        `cat ${JSON.stringify(promptFile)} | claude --print`,
        '--output-format json',
        `--json-schema ${JSON.stringify(JSON.stringify(anthropicInputSchema))}`,
        `--model ${model}`,
        `--max-turns ${MAX_TURNS}`,
        // Drops CLAUDE.md, skills, plugins and hooks. This is the single biggest
        // cost lever: without it the session pays for ~170k cached tokens.
        '--safe-mode',
        // The reviewer only needs to read the prompt it was given. Left enabled,
        // the agent burns turns trying to run tsc and hitting permission denials.
        '--disallowedTools Bash,Edit,Write,WebSearch,WebFetch',
      ].join(' '),
      { encoding: 'utf8', timeout: timeoutMs, shell: '/bin/sh', maxBuffer: 1024 * 1024 * 10 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { review: null, error: `Claude CLI failed: ${message}`, transportFailed: true, costUsd: 0, tokensUsed: empty };
  } finally {
    try { unlinkSync(promptFile); } catch { /* best effort */ }
  }

  const envelope = parseJsonOrNull(raw) as CliEnvelope | null;
  if (!envelope) {
    return {
      review: null,
      error: 'Claude CLI returned output that is not JSON.',
      transportFailed: true,
      costUsd: 0,
      tokensUsed: empty,
    };
  }

  const costUsd = envelope.total_cost_usd ?? 0;
  // A --print session reads tens of thousands of cached tokens. Counting only
  // input_tokens under-reports real usage by orders of magnitude, and that number
  // feeds the rate-limit gate.
  const tokensUsed = {
    input:
      (envelope.usage?.input_tokens ?? 0) +
      (envelope.usage?.cache_read_input_tokens ?? 0) +
      (envelope.usage?.cache_creation_input_tokens ?? 0),
    output: envelope.usage?.output_tokens ?? 0,
  };

  if (envelope.is_error) {
    // error_max_turns is the CLI's own truncation: it ran out of turns before
    // emitting the structured output, which is a distinct failure from a schema
    // violation and worth naming.
    const reason =
      envelope.subtype === 'error_max_turns'
        ? `Claude CLI hit its ${MAX_TURNS}-turn limit before returning a review.`
        : `Claude CLI reported an error (${envelope.subtype ?? 'unknown'}).`;
    return { review: null, error: reason, costUsd, tokensUsed };
  }

  // `result` is a JSON *string* when a schema is supplied; `structured_output`
  // carries the parsed object on versions that populate it.
  const candidate =
    envelope.structured_output ??
    (typeof envelope.result === 'string' ? parseJsonOrNull(envelope.result) : envelope.result);

  const review = normalizeReviewResponse(candidate);
  if (!review) {
    return {
      review: null,
      error: 'Claude CLI returned a payload that does not match the review schema.',
      rawPayload: candidate,
      costUsd,
      tokensUsed,
    };
  }

  return { review, costUsd, tokensUsed };
}
