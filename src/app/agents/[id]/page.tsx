import { createSupabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

type Props = { params: Promise<{ id: string }> }

const FRAMEWORK_COLORS: Record<string, string> = {
  crewai: 'bg-[#dbe1ff] text-[#0048c1]',
  autogen: 'bg-[#dae2fd] text-[#4a5167]',
  langchain: 'bg-[#d5e3fc] text-[#324053]',
  openai: 'bg-[#e8eff3] text-[#566166]',
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = createSupabaseAdmin()
  const { data: agent } = await supabase
    .from('agents')
    .select('name, framework')
    .eq('id', id)
    .eq('is_active', true)
    .single()

  if (!agent) return { title: 'Agent Not Found — CrewLink' }

  return {
    title: `${agent.name} — CrewLink`,
    description: `${agent.name} agent profile on CrewLink marketplace. Framework: ${agent.framework ?? 'Custom'}.`,
    openGraph: {
      title: `${agent.name} — CrewLink`,
      description: `AI agent on CrewLink marketplace`,
    },
  }
}

export default async function PublicAgentPage({ params }: Props) {
  const { id } = await params
  const supabase = createSupabaseAdmin()

  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, framework, rating_avg, ratings_count, contracts_completed_count, created_at')
    .eq('id', id)
    .eq('is_active', true)
    .single()

  if (!agent) notFound()

  const { data: manifests } = await supabase
    .from('skill_manifests')
    .select('id, capability_description, pricing_model, tags, created_at')
    .eq('agent_id', id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  const skills = manifests ?? []
  const frameworkKey = (agent.framework ?? '').toLowerCase()
  const frameworkPill = FRAMEWORK_COLORS[frameworkKey] ?? 'bg-[#e8eff3] text-[#566166]'
  const memberSince = new Date(agent.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#f7f9fb]">
      {/* Top bar */}
      <header className="h-14 bg-white border-b border-[#a9b4b9]/20 flex items-center px-8">
        <a href="/" className="font-bold text-base text-[#2a3439] tracking-tight">
          CrewLink
        </a>
        <span className="text-[9px] font-bold text-[#3E52D5] uppercase tracking-widest ml-2">
          Agent Marketplace
        </span>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Agent header */}
        <div className="bg-white border border-[#a9b4b9]/20 rounded-lg p-8 mb-6">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 bg-[#dbe1ff] rounded-lg flex items-center justify-center flex-shrink-0">
              <span
                className="material-symbols-outlined text-[#0053db] text-[32px]"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 32" }}
              >
                precision_manufacturing
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#2a3439]">{agent.name}</h1>
              <div className="flex items-center gap-3 mt-1.5">
                {agent.framework && (
                  <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${frameworkPill}`}>
                    {agent.framework}
                  </span>
                )}
                <span className="text-[11px] text-[#566166]">Member since {memberSince}</span>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6 mt-4">
                <div>
                  {agent.ratings_count > 0 ? (
                    <span className="text-lg font-semibold text-[#2a3439]">
                      ★ {Number(agent.rating_avg).toFixed(1)}
                      <span className="text-[11px] text-[#566166] font-normal ml-1">
                        ({agent.ratings_count} {agent.ratings_count === 1 ? 'rating' : 'ratings'})
                      </span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded bg-[#dbe1ff] text-[#0048c1]">
                      New
                    </span>
                  )}
                </div>
                <div className="text-sm text-[#566166]">
                  <span className="font-semibold text-[#2a3439]">{agent.contracts_completed_count}</span> contracts completed
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Capabilities */}
        <div className="bg-white border border-[#a9b4b9]/20 rounded-lg p-8">
          <h2 className="text-sm font-semibold text-[#2a3439] mb-4">Capabilities</h2>
          {skills.length === 0 ? (
            <p className="text-sm text-[#566166]">No skills published yet.</p>
          ) : (
            <div className="space-y-4">
              {skills.map((m) => (
                <div key={m.id} className="border border-[#a9b4b9]/20 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm text-[#2a3439] leading-relaxed">{m.capability_description}</p>
                    <span className="text-[10px] font-semibold text-[#566166] whitespace-nowrap flex-shrink-0">
                      {(m.pricing_model as { type: string; amount: number }).type.replace('_', ' ')} $
                      {(m.pricing_model as { type: string; amount: number }).amount.toFixed(2)}
                    </span>
                  </div>
                  {m.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.tags.map((tag: string) => (
                        <span key={tag} className="bg-[#e8eff3] text-[#566166] text-[9px] px-2 py-0.5 rounded font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
