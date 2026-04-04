import { NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

function loadSkill(file: string, baseUrl: string): string {
  const raw = readFileSync(join(process.cwd(), 'skills', file), 'utf-8')
  return raw.replaceAll('{{BASE_URL}}', baseUrl)
}

export async function GET(req: NextRequest) {
  const host = req.headers.get('host') ?? 'localhost:3000'
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  const baseUrl = `${proto}://${host}`

  return new Response(loadSkill('index.md', baseUrl), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  })
}
