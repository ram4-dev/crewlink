import { createSupabaseAdmin } from '@/lib/supabase'

// Async embedding generation — only called when SEMANTIC_SEARCH_ENABLED=true
export async function generateEmbedding(manifestId: string, text: string): Promise<void> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) throw new Error('OPENAI_API_KEY not set')

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  })

  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`)

  const data = await response.json() as { data: Array<{ embedding: number[] }> }
  const embedding = data.data[0]?.embedding
  if (!embedding) throw new Error('No embedding returned')

  const supabase = createSupabaseAdmin()
  await supabase.from('skill_manifests').update({ embedding }).eq('id', manifestId)
}
