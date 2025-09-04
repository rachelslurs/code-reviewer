# Test Files

This directory contains test files designed to showcase the different code review templates and their capabilities.

## Files Overview

### `quality-issues.tsx`
Tests the **quality** template for:
- Poor naming conventions
- Code complexity and nesting
- Unused imports and variables
- Code duplication
- Missing error handling
- React-specific issues (missing keys, prop types)

### `security-issues.ts`
Tests the **security** template for:
- SQL injection vulnerabilities
- XSS vulnerabilities
- Hardcoded secrets
- Insecure authentication
- Command injection
- Information disclosure
- Missing authorization checks
- CORS misconfigurations

### `performance-issues.tsx`
Tests the **performance** template for:
- Bundle size issues (heavy imports)
- React rendering problems
- Missing memoization
- Memory leaks
- Inefficient algorithms (O(n²) vs O(n))
- Sequential vs parallel async operations
- Blocking synchronous operations

### `typescript-issues.tsx`
Tests the **typescript** template for:
- Usage of `any` type
- Missing type annotations
- Unsafe type assertions
- Missing type guards
- Poor generic usage
- Interface vs type consistency
- Missing utility types
- React TypeScript issues

### `clean-code.tsx`
A well-written example that should receive positive feedback for:
- Proper TypeScript usage
- React best practices
- Good performance patterns
- Clean architecture
- Accessibility considerations

## Usage Examples

```bash
# Test individual templates
code-review --template quality test-files/quality-issues.tsx
code-review --template security test-files/security-issues.ts
code-review --template performance test-files/performance-issues.tsx
code-review --template typescript test-files/typescript-issues.tsx

# Test all templates on a single file
code-review --template all test-files/quality-issues.tsx

# Test clean code (should show positive feedback)
code-review --template all test-files/clean-code.tsx

# Review the entire test directory
code-review test-files/
```

## Expected Results

Each test file should trigger specific warnings and suggestions relevant to its template:

- **Quality**: ~8-12 issues around naming, complexity, and React patterns
- **Security**: ~6-10 critical security vulnerabilities
- **Performance**: ~7-9 performance bottlenecks and optimization opportunities  
- **TypeScript**: ~10-15 type safety and TypeScript best practice issues
- **Clean code**: Positive feedback highlighting good practices

These files serve as both test cases and documentation examples for what each review template can detect.
