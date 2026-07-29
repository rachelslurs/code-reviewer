import { describe, expect, test } from 'bun:test';
import {
  anthropicInputSchema,
  describeSchemaMismatch,
  geminiResponseSchema,
  toGeminiSchema,
  normalizeReviewResponse,
  renderStructuredReviewAsText,
  type JsonSchemaNode,
  type StructuredReview,
} from './review-schema.js';

const VALID: StructuredReview = {
  findings: [
    {
      severity: 'critical',
      category: 'security',
      line: 13,
      title: 'SQL injection',
      description: 'User input is concatenated into a query.',
      suggestedFix: 'Use a parameterised query.',
    },
    {
      severity: 'low',
      category: 'quality',
      line: null,
      title: 'Naming',
      description: 'Variable name is unclear.',
      suggestedFix: null,
    },
  ],
  summary: 'One critical issue.',
};

function findingNode(schema: JsonSchemaNode): JsonSchemaNode {
  const items = schema.properties?.findings?.items;
  if (items === undefined) throw new Error('findings.items missing from schema');
  return items;
}

function walk(node: JsonSchemaNode, visit: (n: JsonSchemaNode) => void): void {
  visit(node);
  for (const child of Object.values(node.properties ?? {})) walk(child, visit);
  if (node.items !== undefined) walk(node.items, visit);
  for (const member of node.anyOf ?? []) walk(member, visit);
}

describe('normalizeReviewResponse', () => {
  test('round-trips a valid review', () => {
    expect(normalizeReviewResponse(VALID)).toEqual(VALID);
  });

  test('accepts an empty findings list', () => {
    const clean = { findings: [], summary: 'Looks good.' };
    expect(normalizeReviewResponse(clean)).toEqual(clean);
  });

  test.each([
    ['null root', null],
    ['undefined root', undefined],
    ['a bare string', 'not a review'],
    ['missing findings', { summary: 'x' }],
    ['findings not an array', { findings: {}, summary: 'x' }],
  ])('returns null for %s', (_label, input) => {
    expect(normalizeReviewResponse(input)).toBeNull();
  });

  // On a file that produces twenty findings the model reliably stops before writing
  // the summary. Discarding the review threw away every finding the run paid for.
  describe('a payload missing only the summary', () => {
    test('keeps the findings', () => {
      const finding = VALID.findings[0];
      const salvaged = normalizeReviewResponse({ findings: [finding] });
      expect(salvaged?.findings).toEqual([finding]);
    });

    test('stands in a summary describing what was found', () => {
      const low = { ...VALID.findings[0], severity: 'low' as const };
      const high = { ...VALID.findings[0], severity: 'high' as const };
      const salvaged = normalizeReviewResponse({ findings: [high, low, low] });
      expect(salvaged?.summary).toBe('3 finding(s): 1 high, 2 low.');
    });

    test('reads an empty findings array as clean', () => {
      expect(normalizeReviewResponse({ findings: [] })).toEqual({
        findings: [],
        summary: 'No issues found.',
      });
    });

    test('never overwrites a summary the model did send', () => {
      const sent = { findings: [], summary: 'the model wrote this' };
      expect(normalizeReviewResponse(sent)?.summary).toBe('the model wrote this');
    });

    // Salvage covers the summary alone. A bad finding still fails the whole payload,
    // because a finding is data the gate has to trust.
    test('still rejects a payload whose findings are wrong', () => {
      const bad = { ...VALID.findings[0], severity: 'blocker' };
      expect(normalizeReviewResponse({ findings: [bad] })).toBeNull();
    });
  });

  test.each([
    ['an unknown severity', { ...VALID.findings[0], severity: 'blocker' }],
    ['an unknown category', { ...VALID.findings[0], category: 'style' }],
    ['line as a string', { ...VALID.findings[0], line: '13' }],
    ['a fractional line', { ...VALID.findings[0], line: 1.5 }],
    ['a missing title', { severity: 'low', category: 'quality', line: null }],
  ])('returns null for a finding with %s', (_label, finding) => {
    expect(normalizeReviewResponse({ findings: [finding], summary: 'x' })).toBeNull();
  });
});

describe('toAnthropicSchema', () => {
  test('strips $schema', () => {
    expect(anthropicInputSchema.$schema).toBeUndefined();
  });

  test('strips the numeric bounds that z.number().int() injects', () => {
    walk(anthropicInputSchema, (node) => {
      expect(node.minimum).toBeUndefined();
      expect(node.maximum).toBeUndefined();
    });
  });

  test('preserves anyOf for nullable fields', () => {
    expect(findingNode(anthropicInputSchema).properties?.line?.anyOf).toBeDefined();
  });

  test('preserves additionalProperties and required', () => {
    expect(anthropicInputSchema.additionalProperties).toBe(false);
    expect(findingNode(anthropicInputSchema).required).toContain('severity');
  });
});

describe('toGeminiSchema', () => {
  test('emits no anyOf anywhere, since Gemini has no union node', () => {
    walk(geminiResponseSchema, (node) => expect(node.anyOf).toBeUndefined());
  });

  test('strips additionalProperties and numeric bounds', () => {
    walk(geminiResponseSchema, (node) => {
      expect(node.additionalProperties).toBeUndefined();
      expect(node.minimum).toBeUndefined();
      expect(node.maximum).toBeUndefined();
    });
  });

  test('collapses nullable fields onto the inner type', () => {
    const line = findingNode(geminiResponseSchema).properties?.line;
    expect(line?.type).toBe('integer');
    expect(line?.nullable).toBe(true);

    const fix = findingNode(geminiResponseSchema).properties?.suggestedFix;
    expect(fix?.type).toBe('string');
    expect(fix?.nullable).toBe(true);
  });

  test('marks string enums with format: enum', () => {
    const severity = findingNode(geminiResponseSchema).properties?.severity;
    expect(severity?.format).toBe('enum');
    expect(severity?.enum).toContain('critical');
  });

  test('keeps required, which Gemini does support', () => {
    expect(geminiResponseSchema.required).toEqual(['findings', 'summary']);
  });
});

describe('toGeminiSchema rejects what it cannot represent', () => {
  test.each([
    ['a $ref', { $ref: '#/$defs/Finding' }],
    ['a non-nullable union', { anyOf: [{ type: 'string' }, { type: 'integer' }] }],
    ['an untyped node', { description: 'no type' }],
  ])('throws on %s rather than emitting {}', (_label, node) => {
    expect(() => toGeminiSchema(node as JsonSchemaNode)).toThrow(/cannot represent/);
  });

  test('still accepts a nullable union, which it collapses', () => {
    const out = toGeminiSchema({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(out).toEqual({ type: 'string', nullable: true });
  });
});

describe('describeSchemaMismatch', () => {
  test('keeps the payload so findings are not lost to one bad field', () => {
    const payload = { findings: [{ title: 'SQL injection' }], summary: 'one issue' };
    const out = describeSchemaMismatch('Does not match the schema.', payload);
    expect(out).toContain('Does not match the schema.');
    expect(out).toContain('SQL injection');
    expect(out).toContain('one issue');
  });

  test('returns the diagnostic alone when there is nothing to keep', () => {
    expect(describeSchemaMismatch('diag', null)).toBe('diag');
    expect(describeSchemaMismatch('diag', undefined)).toBe('diag');
    expect(describeSchemaMismatch('diag', '   ')).toBe('diag');
  });

  test('passes a string payload through without re-encoding it', () => {
    expect(describeSchemaMismatch('diag', '{"truncated": ')).toContain('{"truncated": ');
  });

  // This string becomes `feedback`, which the reviewer prints in full to the
  // terminal for every affected file and writes into the markdown, JSON and HTML
  // reports. Untruncated, one malformed response pushes every other result out of
  // the scrollback.
  test('excerpts an oversized payload from both ends', () => {
    const payload = `HEAD_MARKER${'x'.repeat(60000)}TAIL_MARKER`;
    const out = describeSchemaMismatch('diag', payload);

    expect(out.length).toBeLessThan(6000);
    expect(out).toContain('diag');
    expect(out).toContain('HEAD_MARKER');
    expect(out).toContain('TAIL_MARKER');
    expect(out).toContain('characters omitted');
  });

  test('leaves a payload under the limit whole', () => {
    const payload = 'y'.repeat(3000);
    expect(describeSchemaMismatch('diag', payload)).toContain(payload);
  });
});

describe('renderStructuredReviewAsText', () => {
  test('is non-empty for a populated review', () => {
    const text = renderStructuredReviewAsText(VALID);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('SQL injection');
    expect(text).toContain('line 13');
  });

  test('is non-empty for a clean review, so feedback is never blank', () => {
    const text = renderStructuredReviewAsText({ findings: [], summary: 'All good.' });
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('All good.');
  });

  test('omits the line marker when line is null', () => {
    const text = renderStructuredReviewAsText(VALID);
    expect(text).toContain('[quality] Naming\n');
  });
});
