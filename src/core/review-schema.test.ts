import { describe, expect, test } from 'bun:test';
import {
  anthropicInputSchema,
  geminiResponseSchema,
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
    ['missing summary', { findings: [] }],
    ['findings not an array', { findings: {}, summary: 'x' }],
  ])('returns null for %s', (_label, input) => {
    expect(normalizeReviewResponse(input)).toBeNull();
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
