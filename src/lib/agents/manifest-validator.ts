import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)

const manifestSchema = {
  type: 'object',
  required: ['capability_description', 'input_schema', 'output_schema', 'pricing_model', 'endpoint_url', 'tags'],
  properties: {
    capability_description: { type: 'string', minLength: 20, maxLength: 2000 },
    input_schema:  { type: 'object' },
    output_schema: { type: 'object' },
    pricing_model: {
      type: 'object',
      required: ['type', 'amount'],
      properties: {
        type:   { type: 'string', enum: ['per_task', 'per_1k_tokens'] },
        amount: { type: 'number', exclusiveMinimum: 0, maximum: 10000 },
      },
      additionalProperties: false,
    },
    endpoint_url: { type: 'string', format: 'uri' },
    tags: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 50, pattern: '^[a-z0-9_-]+$' },
    },
  },
  additionalProperties: false,
}

const validateManifest = ajv.compile(manifestSchema)

function getSchemaDepth(schema: unknown, depth = 0): number {
  if (depth > 10) return depth
  if (typeof schema !== 'object' || schema === null) return depth
  const s = schema as Record<string, unknown>
  let max = depth
  for (const key of ['properties', 'items', 'allOf', 'anyOf', 'oneOf']) {
    if (s[key]) {
      const children = typeof s[key] === 'object' && !Array.isArray(s[key])
        ? Object.values(s[key] as Record<string, unknown>)
        : Array.isArray(s[key]) ? s[key] as unknown[]
        : []
      for (const child of children as unknown[]) {
        max = Math.max(max, getSchemaDepth(child, depth + 1))
      }
    }
  }
  return max
}

// Validates that a value is a structurally valid JSON Schema by compiling it with Ajv.
// If Ajv cannot compile it, the schema is rejected.
function validateJsonSchema(schema: unknown, fieldName: string): string | null {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return `${fieldName} must be a JSON Schema object`
  }
  try {
    ajv.compile(schema)
    return null
  } catch (err) {
    return `${fieldName} is not a valid JSON Schema: ${(err as Error).message}`
  }
}

export type ManifestValidationResult =
  | { valid: true; errors: null }
  | { valid: false; errors: string[] }

export function validateSkillManifest(data: Record<string, unknown>): ManifestValidationResult {
  // Size check: max 50KB
  const serialized = JSON.stringify(data)
  if (serialized.length > 50 * 1024) {
    return { valid: false, errors: ['Manifest exceeds 50KB size limit'] }
  }

  // Structural validation (required fields, types, formats)
  const valid = validateManifest(data)
  if (!valid) {
    const errors = (validateManifest.errors ?? []).map(
      (e) => `${e.instancePath || '/'} ${e.message}`
    )
    return { valid: false, errors }
  }

  // Depth limits
  if (getSchemaDepth(data.input_schema) > 5) {
    return { valid: false, errors: ['input_schema exceeds maximum depth of 5'] }
  }
  if (getSchemaDepth(data.output_schema) > 5) {
    return { valid: false, errors: ['output_schema exceeds maximum depth of 5'] }
  }

  // JSON Schema Draft 7 real validation — Ajv must be able to compile both schemas
  const inputSchemaError  = validateJsonSchema(data.input_schema, 'input_schema')
  if (inputSchemaError) return { valid: false, errors: [inputSchemaError] }

  const outputSchemaError = validateJsonSchema(data.output_schema, 'output_schema')
  if (outputSchemaError) return { valid: false, errors: [outputSchemaError] }

  return { valid: true, errors: null }
}
