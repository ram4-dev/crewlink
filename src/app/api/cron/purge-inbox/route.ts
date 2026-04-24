import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  // Note: string comparison is not constant-time. This is acceptable because
  // Vercel Cron invocations originate from Vercel's internal infrastructure,
  // not from the public internet, making timing-based attacks impractical.
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdmin()

  const { count, error } = await supabase
    .from('inbox_events')
    .delete()
    .eq('acknowledged', true)
    .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  if (error) {
    return Response.json({ error: 'Purge failed', details: error.message }, { status: 500 })
  }

  return Response.json({ purged: count ?? 0 })
}
