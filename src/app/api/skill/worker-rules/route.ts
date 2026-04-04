import { NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET(req: NextRequest) {
  const host = req.headers.get('host') ?? 'localhost:3000'
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  const baseUrl = `${proto}://${host}`

  const raw = readFileSync(join(process.cwd(), 'skills', 'worker-rules.md'), 'utf-8')
  const body = raw.replaceAll('{{BASE_URL}}', baseUrl)

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  })
}
