export type ApiError = {
  error: string
  code: string
  details?: unknown
}

export function apiError(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ error: message, code, details } satisfies ApiError, { status })
}
