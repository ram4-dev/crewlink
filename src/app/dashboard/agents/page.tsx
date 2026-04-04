'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Agent = {
  id: string
  name: string
  framework: string | null
  rating_avg: number
  contracts_completed_count: number
  ratings_count: number
  is_active: boolean
  created_at: string
}

const FRAMEWORK_COLORS: Record<string, string> = {
  crewai: 'bg-[#dbe1ff] text-[#0048c1]',
  autogen: 'bg-[#dae2fd] text-[#4a5167]',
  langchain: 'bg-[#d5e3fc] text-[#324053]',
  openai: 'bg-[#e8eff3] text-[#566166]',
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAgents = async () => {
    const res = await fetch('/api/dashboard/agents')
    const data = await res.json()
    setAgents(data.agents ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAgents() }, [])

  const toggleAgent = async (id: string, is_active: boolean) => {
    const res = await fetch(`/api/dashboard/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    })
    if (res.ok) fetchAgents()
    else {
      const err = await res.json()
      alert(err.error ?? 'Failed to update agent')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#566166] text-sm animate-pulse pt-12">
        <span className="w-2 h-2 rounded-full bg-[#566166] inline-block" />
        Loading agents...
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#2a3439]">My Agents</h1>
        <p className="text-[11px] text-[#566166] mt-1 uppercase tracking-widest font-medium">
          Manage and monitor your registered agents.
        </p>
      </div>

      {agents.length === 0 ? (
        <div className="bg-white border border-[#a9b4b9]/10 rounded p-8 text-center">
          <span
            className="material-symbols-outlined text-[#a9b4b9] text-[48px] block mb-3"
            style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 48" }}
          >
            precision_manufacturing
          </span>
          <p className="text-[#566166] text-sm">No agents registered yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const frameworkKey = (agent.framework ?? '').toLowerCase()
            const frameworkPill = FRAMEWORK_COLORS[frameworkKey] ?? 'bg-[#e8eff3] text-[#566166]'

            return (
              <div
                key={agent.id}
                className="bg-white border border-[#a9b4b9]/20 rounded-lg p-6 hover:shadow-[0_12px_40px_-12px_rgba(42,52,57,0.08)] transition-all flex flex-col gap-4"
              >
                {/* Card top */}
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 bg-[#dbe1ff] rounded flex items-center justify-center">
                    <span
                      className="material-symbols-outlined text-[#0053db] text-[22px]"
                      style={{ fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
                    >
                      precision_manufacturing
                    </span>
                  </div>
                  {agent.framework && (
                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded ${frameworkPill}`}>
                      {agent.framework}
                    </span>
                  )}
                </div>

                {/* Name */}
                <div>
                  <Link href={`/dashboard/agents/${agent.id}`} className="font-semibold text-[#2a3439] text-sm leading-tight hover:text-[#0053db] transition-colors">
                    {agent.name}
                  </Link>
                  <p className="text-[10px] text-[#566166] mt-0.5 uppercase tracking-wider">
                    {agent.framework ?? 'Custom Framework'}
                  </p>
                </div>

                {/* Stats 2x2 grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#f0f4f7] rounded p-2.5">
                    <p className="text-[9px] font-bold text-[#566166] uppercase tracking-widest">Completed</p>
                    <p className="text-lg font-semibold tracking-tighter text-[#2a3439] mt-0.5">
                      {agent.contracts_completed_count}
                    </p>
                  </div>
                  <div className="bg-[#f0f4f7] rounded p-2.5">
                    <p className="text-[9px] font-bold text-[#566166] uppercase tracking-widest">Rating</p>
                    <p className="text-lg font-semibold tracking-tighter text-[#2a3439] mt-0.5">
                      {agent.ratings_count > 0 ? `★ ${Number(agent.rating_avg).toFixed(1)}` : '—'}
                    </p>
                  </div>
                  <div className="bg-[#f0f4f7] rounded p-2.5">
                    <p className="text-[9px] font-bold text-[#566166] uppercase tracking-widest">Status</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${agent.is_active ? 'bg-[#1a6636]' : 'bg-[#a9b4b9]'}`} />
                      <p className={`text-sm font-semibold tracking-tight ${agent.is_active ? 'text-[#1a6636]' : 'text-[#566166]'}`}>
                        {agent.is_active ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                  </div>
                  <div className="bg-[#f0f4f7] rounded p-2.5">
                    <p className="text-[9px] font-bold text-[#566166] uppercase tracking-widest">Created</p>
                    <p className="text-[10px] font-medium text-[#2a3439] mt-0.5">
                      {new Date(agent.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                    </p>
                  </div>
                </div>

                {/* Footer action */}
                <div className="flex items-center justify-between pt-1 border-t border-[#a9b4b9]/15 mt-auto">
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${agent.is_active ? 'text-[#1a6636]' : 'text-[#566166]'}`}>
                    {agent.is_active ? 'Online' : 'Offline'}
                  </span>
                  <button
                    onClick={() => toggleAgent(agent.id, !agent.is_active)}
                    className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded border transition-colors ${
                      agent.is_active
                        ? 'border-[#a9b4b9]/40 text-[#566166] hover:bg-[#f0f4f7]'
                        : 'border-[#0053db] text-[#0053db] hover:bg-[#dbe1ff]'
                    }`}
                  >
                    {agent.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
