import Ajv from 'ajv'

const ajv = new Ajv({ strict: false, allErrors: true })

export type ProofValidationResult =
  | { valid: true; errors: null }
  | { valid: false; errors: Array<{ path: string; message: string }> }

export function validateProof(proof: unknown, outputSchema: object | null): ProofValidationResult | null {
  if (!outputSchema) return null

  try {
    const validate = ajv.compile(outputSchema)
    const valid = validate(proof)
    if (!valid) {
      return {
        valid: false,
        errors: (validate.errors ?? []).map((e) => ({
          path: e.instancePath || '/',
          message: e.message ?? 'validation error',
        })),
      }
    }
    return { valid: true, errors: null }
  } catch {
    // Schema compilation error — treat as no schema
    return null
  }
}
