import { describe, it, expect } from 'vitest'
import { validateSkillManifest } from '@/lib/agents/manifest-validator'

const validManifest = {
  capability_description: 'Traduce documentos de español a inglés con alta fidelidad terminológica',
  input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  output_schema: { type: 'object', properties: { translated_text: { type: 'string' } }, required: ['translated_text'] },
  pricing_model: { type: 'per_task', amount: 5.0 },
  endpoint_url: 'https://example.com/translate',
  tags: ['translation', 'spanish'],
}

describe('validateSkillManifest', () => {
  it('accepts a valid manifest', () => {
    const result = validateSkillManifest(validManifest)
    expect(result.valid).toBe(true)
  })

  it('rejects manifest with capability_description too short', () => {
    const result = validateSkillManifest({ ...validManifest, capability_description: 'Too short' })
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('fewer than 20')]))
  })

  it('rejects invalid pricing_model type', () => {
    const result = validateSkillManifest({
      ...validManifest,
      pricing_model: { type: 'invalid', amount: 5 },
    })
    expect(result.valid).toBe(false)
  })

  it('rejects negative pricing amount', () => {
    const result = validateSkillManifest({
      ...validManifest,
      pricing_model: { type: 'per_task', amount: -1 },
    })
    expect(result.valid).toBe(false)
  })

  it('rejects invalid endpoint_url (not URI)', () => {
    const result = validateSkillManifest({ ...validManifest, endpoint_url: 'not-a-url' })
    expect(result.valid).toBe(false)
  })

  it('rejects tags with invalid characters', () => {
    const result = validateSkillManifest({ ...validManifest, tags: ['valid', 'INVALID CAPS'] })
    expect(result.valid).toBe(false)
  })

  it('rejects empty tags array', () => {
    const result = validateSkillManifest({ ...validManifest, tags: [] })
    expect(result.valid).toBe(false)
  })

  it('rejects manifest exceeding 50KB', () => {
    const huge = { ...validManifest, capability_description: 'A'.repeat(20) + 'x'.repeat(51200) }
    const result = validateSkillManifest(huge as Record<string, unknown>)
    expect(result.valid).toBe(false)
    expect(result.errors?.[0]).toContain('50KB')
  })

  it('rejects schemas with depth > 5', () => {
    const deepSchema = {
      type: 'object',
      properties: {
        a: { type: 'object', properties: {
          b: { type: 'object', properties: {
            c: { type: 'object', properties: {
              d: { type: 'object', properties: {
                e: { type: 'object', properties: {
                  f: { type: 'string' }
                }}
              }}
            }}
          }}
        }}
      }
    }
    const result = validateSkillManifest({ ...validManifest, input_schema: deepSchema })
    expect(result.valid).toBe(false)
    expect(result.errors?.[0]).toContain('depth')
  })
})
