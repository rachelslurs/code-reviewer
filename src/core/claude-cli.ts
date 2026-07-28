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
  usage?: { input_tokens?: number; output_tokens?: number };
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
export function probeClaudeCodeAuth(): boolean {
  try {
    const raw = execSync(
      'claude --print --safe-mode --model haiku --output-format json --max-turns 1',
      { encoding: 'utf8', stdio: 'pipe', timeout: 30000, input: 'Reply with exactly: OK' },
    );
    const envelope = parseJsonOrNull(raw) as CliEnvelope | null;
    return envelope !== null && envelope.is_error !== true;
  } catch {
    return false;
  }
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
  writeFileSync(promptFile, prompt);

  let raw: string;
  try {
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
    return { review: null, error: `Claude CLI failed: ${message}`, costUsd: 0, tokensUsed: empty };
  } finally {
    try { unlinkSync(promptFile); } catch { /* best effort */ }
  }

  const envelope = parseJsonOrNull(raw) as CliEnvelope | null;
  if (!envelope) {
    return {
      review: null,
      error: 'Claude CLI returned output that is not JSON.',
      costUsd: 0,
      tokensUsed: empty,
    };
  }

  const costUsd = envelope.total_cost_usd ?? 0;
  const tokensUsed = {
    input: envelope.usage?.input_tokens ?? 0,
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
      costUsd,
      tokensUsed,
    };
  }

  return { review, costUsd, tokensUsed };
}
