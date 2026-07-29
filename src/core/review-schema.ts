import * as z from 'zod';

/**
 * The shared contract for a structured review. Anthropic reaches it through a forced
 * tool call, Gemini through a native response schema; callers see only this shape.
 */

export const ReviewFindingSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.enum(['quality', 'security', 'performance', 'typescript']),
  line: z.number().int().nullable(),
  title: z.string(),
  description: z.string(),
  suggestedFix: z.string().nullable(),
});

export const StructuredReviewSchema = z.object({
  findings: z.array(ReviewFindingSchema),
  summary: z.string(),
});

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;
export type StructuredReview = z.infer<typeof StructuredReviewSchema>;

export type Severity = ReviewFinding['severity'];

/** Most severe first. Index order is the ranking, so callers can compare positions. */
export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low'];

/**
 * The subset of JSON Schema that zod emits for the schema above, plus the two fields
 * the Gemini adapter introduces (`nullable`, `format`).
 */
export interface JsonSchemaNode {
  $schema?: string;
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  required?: readonly string[];
  enum?: readonly string[];
  anyOf?: readonly JsonSchemaNode[];
  additionalProperties?: boolean;
  minimum?: number;
  maximum?: number;
  format?: string;
  nullable?: boolean;
}

const CANONICAL = z.toJSONSchema(StructuredReviewSchema) as unknown as JsonSchemaNode;

function mapProperties(
  properties: Record<string, JsonSchemaNode>,
  transform: (node: JsonSchemaNode) => JsonSchemaNode,
): Record<string, JsonSchemaNode> {
  const out: Record<string, JsonSchemaNode> = {};
  for (const [key, value] of Object.entries(properties)) {
    out[key] = transform(value);
  }
  return out;
}

/**
 * Anthropic accepts `anyOf` and `additionalProperties` as zod emits them. It rejects
 * numeric constraints, which `z.number().int()` injects as ±Number.MAX_SAFE_INTEGER.
 */
export function toAnthropicSchema(node: JsonSchemaNode): JsonSchemaNode {
  const out: JsonSchemaNode = {};

  if (node.type !== undefined) out.type = node.type;
  if (node.description !== undefined) out.description = node.description;
  if (node.enum !== undefined) out.enum = node.enum;
  if (node.required !== undefined) out.required = node.required;
  if (node.additionalProperties !== undefined) {
    out.additionalProperties = node.additionalProperties;
  }
  if (node.properties !== undefined) {
    out.properties = mapProperties(node.properties, toAnthropicSchema);
  }
  if (node.items !== undefined) out.items = toAnthropicSchema(node.items);
  if (node.anyOf !== undefined) out.anyOf = node.anyOf.map(toAnthropicSchema);

  return out;
}

/**
 * Gemini's Schema type is an OpenAPI 3.0 subset with no union node, so a nullable
 * field has to collapse from `anyOf: [T, null]` into `T` carrying `nullable: true`.
 * Fields are allow-listed rather than stripped: an unsupported key is a 400, and a
 * whitelist cannot leak one that a future zod version starts emitting.
 */
export function toGeminiSchema(node: JsonSchemaNode): JsonSchemaNode {
  if (node.anyOf !== undefined) {
    const nonNull = node.anyOf.filter((member) => member.type !== 'null');
    const hadNull = nonNull.length !== node.anyOf.length;
    const only = nonNull[0];
    if (hadNull && nonNull.length === 1 && only !== undefined) {
      return { ...toGeminiSchema(only), nullable: true };
    }
  }

  const out: JsonSchemaNode = {};

  if (node.type !== undefined) out.type = node.type;
  if (node.description !== undefined) out.description = node.description;
  if (node.nullable !== undefined) out.nullable = node.nullable;
  if (node.required !== undefined) out.required = node.required;

  if (node.enum !== undefined) {
    out.enum = node.enum;
    // EnumStringSchema requires the discriminator alongside the values.
    if (node.type === 'string') out.format = 'enum';
  }

  if (node.properties !== undefined) {
    out.properties = mapProperties(node.properties, toGeminiSchema);
  }
  if (node.items !== undefined) out.items = toGeminiSchema(node.items);

  // An allow-list silently drops what it does not recognise, which would serialize
  // the node as `{}` and surface much later as an opaque Gemini 400 reported as
  // "All suitable models failed". Failing here names the offending construct
  // instead, at module load, before any request is built.
  if (out.type === undefined && out.nullable === undefined) {
    const unsupported = Object.keys(node).filter(
      (key) => !['type', 'description', 'nullable', 'required', 'enum', 'properties', 'items'].includes(key),
    );
    throw new Error(
      `toGeminiSchema cannot represent this node: Gemini's Schema type has no ` +
        `equivalent for ${unsupported.length > 0 ? unsupported.join(', ') : 'an untyped node'}. ` +
        `Change the zod schema, or extend the adapter.`,
    );
  }

  return out;
}

export const anthropicInputSchema: JsonSchemaNode = toAnthropicSchema(CANONICAL);
export const geminiResponseSchema: JsonSchemaNode = toGeminiSchema(CANONICAL);

export const SUBMIT_REVIEW_TOOL_NAME = 'submit_review';

/**
 * Templates still instruct the model to emit markdown sections. Until they are
 * rewritten, that guidance conflicts with the schema and ends up inside field values.
 */
export const STRUCTURED_OUTPUT_INSTRUCTION =
  'Return findings via the structured schema. Ignore any instructions above about ' +
  'response sections, headings, or markdown formatting. ' +
  // Without asking, roughly half of findings came back with a null line, and a
  // finding with no line cannot be attached to the code it is about.
  'Set `line` to the line number the finding occurs on, counting from 1. Use null ' +
  'only when the finding is about the file as a whole rather than any specific line.';

/**
 * The single point where a provider response becomes a review. Returning null is the
 * only signal that means "fall back to text", so a missing tool_use block, a
 * truncated body and a schema violation all converge on one branch.
 */
export function normalizeReviewResponse(raw: unknown): StructuredReview | null {
  const parsed = StructuredReviewSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Failure text for a payload that arrived but did not validate.
 *
 * One bad field fails the whole object, so discarding it throws away every finding
 * the user paid for. The raw payload is appended so the review is still readable
 * even when it cannot be trusted as structure.
 */
export function describeSchemaMismatch(diagnostic: string, payload: unknown): string {
  if (payload === undefined || payload === null) return diagnostic;

  let rendered: string;
  if (typeof payload === 'string') {
    rendered = payload;
  } else {
    try {
      rendered = JSON.stringify(payload, null, 2);
    } catch {
      return diagnostic;
    }
  }

  if (rendered.trim() === '') return diagnostic;
  return `${diagnostic}\n\nRaw response (unvalidated):\n\n${excerpt(rendered)}`;
}

/**
 * Head and tail of an oversized payload.
 *
 * A schema-violating response can run to tens of kilobytes, and this string
 * becomes `feedback`, which the reviewer prints in full to the terminal for every
 * affected file and writes verbatim into the markdown, JSON and HTML reports. One
 * malformed response would push every other result out of the scrollback. The two
 * ends are where the shape of the payload is legible, so both are kept.
 */
const MAX_PAYLOAD_CHARS = 4000;

function excerpt(rendered: string): string {
  if (rendered.length <= MAX_PAYLOAD_CHARS) return rendered;

  const half = Math.floor(MAX_PAYLOAD_CHARS / 2);
  const omitted = rendered.length - MAX_PAYLOAD_CHARS;
  return [
    rendered.slice(0, half),
    `\n\n… ${omitted.toLocaleString()} characters omitted …\n\n`,
    rendered.slice(-half),
  ].join('');
}

/**
 * Populates `ModelResponse.content` so that consumers still reading free text keep
 * working. Under forced tool use the response carries no text block at all, so
 * without this the field would be empty and a failed review would read as clean.
 */
export function renderStructuredReviewAsText(review: StructuredReview): string {
  const lines: string[] = [];

  if (review.findings.length === 0) {
    lines.push('No issues found.');
  } else {
    for (const severity of SEVERITY_ORDER) {
      const matching = review.findings.filter((finding) => finding.severity === severity);
      if (matching.length === 0) continue;

      lines.push(`${severity.toUpperCase()} (${matching.length})`);
      lines.push('');

      for (const finding of matching) {
        const location = finding.line === null ? '' : ` (line ${finding.line})`;
        lines.push(`[${finding.category}] ${finding.title}${location}`);
        lines.push(finding.description);
        if (finding.suggestedFix !== null) {
          lines.push(`Suggested fix: ${finding.suggestedFix}`);
        }
        lines.push('');
      }
    }
  }

  lines.push('Summary');
  lines.push('');
  lines.push(review.summary);

  return lines.join('\n');
}
