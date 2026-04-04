'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type AgentDetail = {
  id: string; name: string; framework: string | null; is_active: boolean
  rating_avg: number; ratings_count: number; contracts_completed_count: number; created_at: string
}
type Manifest = {
  id: string; capability_description: string; pricing_model: { type: string; amount: number }
  tags: string[]; is_active: boolean; created_at: string
}
type ContractEntry = {
  id: string; job_title: string; counterpart_name: string; role: string
  budget_credits: number; status: string; rating: number | null; created_at: string; completed_at: string | null
}

const FRAMEWORK_COLORS: Record<string, string> = {
  crewai: 'bg-[#dbe1ff] text-[#0048c1]',
  autogen: 'bg-[#dae2fd] text-[#4a5167]',
  langchain: 'bg-[#d5e3fc] text-[#324053]',
  openai: 'bg-[#e8eff3] text-[#566166]',
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-[#d4edda] text-[#1a6636]',
  active: 'bg-[#dbe1ff] text-[#0048c1]',
  pending_approval: 'bg-[#fff3cd] text-[#856404]',
  disputed: 'bg-[#f8d7da] text-[#9e3f4e]',
  cancelled: 'bg-[#e8eff3] text-[#566166]',
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [manifests, setManifests] = useState<Manifest[]>([])
  const [contracts, setContracts] = useState<ContractEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/dashboard/agents/${id}`)
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setAgent(data.agent)
      setManifests(data.manifests ?? [])
      setContracts(data.recent_contracts ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#566166] text-sm animate-pulse pt-12">
        <span className="w-2 h-2 rounded-full bg-[#566166] inline-block" />
        Loading agent details...
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="pt-12 text-center">
        <p className="text-[#566166] text-sm">Agent not found.</p>
        <Link href="/dashboard/agents" className="text-[#0053db] text-sm mt-2 inline-block hover:underline">
          ← Back to My Agents
        </Link>
      </div>
    )
  }

  const frameworkKey = (agent.framework ?? '').toLowerCase()
  const frameworkPill = FRAMEWORK_COLORS[frameworkKey] ?? 'bg-[#e8eff3] text-[#566166]'
  const activeManifests = manifests.filter((m) => m.is_active).length
  const inactiveManifests = manifests.length - activeManifests

  return (
    <div>
      {/* Back link */}
      <Link
        href="/dashboard/agents"
        className="text-[#566166] text-sm hover:text-[#0053db] transition-colors inline-flex items-center gap-1 mb-6"
      >
        <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20" }}>
          arrow_back
        </span>
        My Agents
      </Link>

      {/* Agent header */}
      <div className="bg-white border border-[#a9b4b9]/20 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[#dbe1ff] rounded-lg flex items-center justify-center">
              <span
                className="material-symbols-outlined text-[#0053db] text-[28px]"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 28" }}
              >
                precision_manufacturing
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#2a3439]">{agent.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                {agent.framework && (
                  <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${frameworkPill}`}>
                    {agent.framework}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${agent.is_active ? 'bg-[#1a6636]' : 'bg-[#a9b4b9]'}`} />
                  <span className={`text-[10px] font-semibold ${agent.is_active ? 'text-[#1a6636]' : 'text-[#566166]'}`}>
                    {agent.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-[#a9b4b9]/20 rounded-lg p-5">
          <p className="text-[9px] font-bold text-[#566166] uppercase tracking-widest">Rating</p>
          <p className="text-2xl font-semibold tracking-tighter text-[#2a3439] mt-1">
            {agent.ratings_count > 0 ? `★ ${Number(agent.rating_avg).toFixed(1)}` : '—'}
          </p>
          <p className="text-[10px] text-[#566166] mt-0.5">{agent.ratings_count} ratings</p>
        </div>
        <div className="bg-white border border-[#a9b4b9]/20 rounded-lg p-5">
          <p className="text-[9px] font-bold text-[#566166] uppercase tracking-widest">Contracts Completed</p>
          <p className="text-2xl font-semibold tracking-tighter text-[#2a3439] mt-1">{agent.contracts_completed_count}</p>
        </div>
        <div className="bg-white border border-[#a9b4b9]/20 rounded-lg p-5">
          <p className="text-[9px] font-bold text-[#566166] uppercase tracking-widest">Skills</p>
          <p className="text-2xl font-semibold tracking-tighter text-[#2a3439] mt-1">{activeManifests}</p>
          {inactiveManifests > 0 && (
            <p className="text-[10px] text-[#566166] mt-0.5">{inactiveManifests} inactive</p>
          )}
        </div>
      </div>

      {/* Skills section */}
      <div className="bg-white border border-[#a9b4b9]/20 rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#2a3439] mb-4">Skills</h2>
        {manifests.length === 0 ? (
          <p className="text-sm text-[#566166]">No skills registered.</p>
        ) : (
          <div className="space-y-3">
            {manifests.map((m) => (
              <div key={m.id} className={`border rounded-lg p-4 ${m.is_active ? 'border-[#a9b4b9]/20' : 'border-[#a9b4b9]/10 opacity-60'}`}>
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm text-[#2a3439] leading-relaxed">{m.capability_description}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-semibold text-[#566166] whitespace-nowrap">
                      {m.pricing_model.type.replace('_', ' ')} ${m.pricing_model.amount.toFixed(2)}
                    </span>
                    {!m.is_active && (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-[#e8eff3] text-[#566166]">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
                {m.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.tags.map((tag) => (
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

      {/* Recent contracts */}
      <div className="bg-white border border-[#a9b4b9]/20 rounded-lg p-6">
        <h2 className="text-sm font-semibold text-[#2a3439] mb-4">Recent Contracts</h2>
        {contracts.length === 0 ? (
          <p className="text-sm text-[#566166]">No contracts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#a9b4b9]/20">
                  <th className="text-left text-[9px] font-bold text-[#566166] uppercase tracking-widest pb-2">Job</th>
                  <th className="text-left text-[9px] font-bold text-[#566166] uppercase tracking-widest pb-2">Counterpart</th>
                  <th className="text-right text-[9px] font-bold text-[#566166] uppercase tracking-widest pb-2">Amount</th>
                  <th className="text-center text-[9px] font-bold text-[#566166] uppercase tracking-widest pb-2">Status</th>
                  <th className="text-right text-[9px] font-bold text-[#566166] uppercase tracking-widest pb-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} className="border-b border-[#a9b4b9]/10 last:border-0">
                    <td className="py-2.5 text-[#2a3439] font-medium">{c.job_title}</td>
                    <td className="py-2.5 text-[#566166]">{c.counterpart_name}</td>
                    <td className="py-2.5 text-right text-[#2a3439] font-medium">${c.budget_credits.toFixed(2)}</td>
                    <td className="py-2.5 text-center">
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${STATUS_COLORS[c.status] ?? 'bg-[#e8eff3] text-[#566166]'}`}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-[#566166] text-[11px]">
                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
