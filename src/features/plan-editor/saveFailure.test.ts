import { describe, expect, it } from 'vitest'
import { ApiException } from '../../api/client'
import { classifySaveFailure } from './saveFailure'

describe('classifySaveFailure', () => {
  it.each([
    [new TypeError('Failed to fetch'), 'network', 'TypeError: Failed to fetch'],
    [new ApiException(401, 'UNAUTHORIZED'), 'session', '401 UNAUTHORIZED'],
    [new ApiException(429, 'RATE_LIMITED'), 'rateLimited', '429 RATE_LIMITED'],
    [new ApiException(422, 'VALIDATION_ERROR'), 'rejected', '422 VALIDATION_ERROR'],
    [new ApiException(503, 'UNAVAILABLE'), 'serverError', '503 UNAVAILABLE'],
    [new Error('Unexpected state'), 'internal', 'Error: Unexpected state'],
  ])('classifies %s as %s', (error, kind, tech) => {
    expect(classifySaveFailure(error)).toEqual({ kind, tech })
  })

  it('includes only the first validation issue path', () => {
    expect(classifySaveFailure(new ApiException(422, 'VALIDATION_ERROR', {
      issues: [
        { path: ['upsert_days', 0, 'exercises', 0, 'sets', 0, 'target_weight'], message: 'private content' },
        { path: ['second'], message: 'other content' },
      ], body: { private: 'request body' },
    })).tech).toBe('422 VALIDATION_ERROR · upsert_days.0.exercises.0.sets.0.target_weight')
  })

  it('caps the issue path and non-API diagnostic at 80 characters', () => {
    expect(classifySaveFailure(new ApiException(422, 'VALIDATION_ERROR', {
      issues: [{ path: ['x'.repeat(100)] }],
    })).tech).toBe(`422 VALIDATION_ERROR · ${'x'.repeat(80)}`)
    expect(classifySaveFailure(new Error('x'.repeat(100))).tech).toBe(`Error: ${'x'.repeat(73)}`)
  })

  it.each([400, 403, 404, 409])('classifies unhandled HTTP %i as rejected', (status) => {
    expect(classifySaveFailure(new ApiException(status, 'REJECTED')).kind).toBe('rejected')
  })

  it.each([
    new TypeError('Load failed'),
    new TypeError('NetworkError when attempting to fetch resource.'),
    new DOMException('Connection lost', 'NetworkError'),
  ])('recognizes browser network failures: %s', (error) => {
    expect(classifySaveFailure(error).kind).toBe('network')
  })

  it('keeps a page TypeError distinct from a fetch failure and handles unknown throws', () => {
    expect(classifySaveFailure(new TypeError('Cannot read properties of undefined')).kind).toBe('internal')
    expect(classifySaveFailure({ body: 'private' })).toEqual({ kind: 'internal', tech: 'Unknown error' })
    expect(classifySaveFailure(null).kind).toBe('internal')
  })

  it.each([undefined, {}, [], [{ path: 'private' }], [{ path: ['field', {}] }]])('ignores malformed issues: %j', (issues) => {
    expect(classifySaveFailure(new ApiException(422, 'VALIDATION_ERROR', { issues })).tech).toBe('422 VALIDATION_ERROR')
  })

  it.each([
    'Authorization: Bearer secret-value',
    'access_token=secret-value',
    'request body: secret-value',
    'payload={"note":"secret-value"}',
    'https://example.invalid/?token=secret-value',
    'token "secret-value"',
    '{"note":"secret-value"}',
  ])('redacts credentials and request content from messages: %s', (message) => {
    expect(classifySaveFailure(new Error(message)).tech).not.toContain('secret-value')
  })

  it('redacts phone-like values and keeps diagnostics on one line', () => {
    const phone = '+' + '1'.repeat(11)
    const failure = classifySaveFailure(new Error(`Failed\ncontact ${phone}\tfor help`))
    expect(failure.tech).not.toContain(phone)
    expect(failure.tech).not.toMatch(/[\r\n\t]/)
    expect(classifySaveFailure(new ApiException(422, 'VALIDATION_ERROR', {
      issues: [{ path: ['users', phone] }],
    })).tech).not.toContain(phone)
  })


  it.each(['private response excerpt', 'private response [excerpt', 'private response {excerpt'])('redacts response excerpts in JSON parsing errors: %s', (excerpt) => {
    const error = new SyntaxError(`Unexpected token, "${excerpt}" is not valid JSON`)
    expect(classifySaveFailure(error).tech).not.toContain('private response')
    expect(classifySaveFailure(error).tech).toContain('SyntaxError')
  })

})
