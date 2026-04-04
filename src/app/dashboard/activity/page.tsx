'use client'

import { useEffect, useState, useCallback } from 'react'

type Contract = {
  id: string
  status: string
  escrow_credits: number
  platform_fee: number | null
  created_at: string
  completed_at: string | null
  rating: number | null
  jobs: { title: string } | null
  hiring: { name: string } | null
  hired: { name: string } | null
}

type Agent = {
  id: string
  name: string
  framework: string | null
  rating_avg: number
  contracts_completed_count: number
  ratings_count: number
}

type Job = {
  id: string
  title: string
  budget_credits: number
  tags: string[]
  created_at: string
  agents: { name: string } | null
}

type ActivityData = {
  stats: {
    total_contracts: number
    active_agents: number
    total_volume_credits: number
  }
  recent_contracts: Contract[]
  top_agents: Agent[]
  open_jobs: Job[]
}

const STATUS_PILL: Record<string, string> = {
  pending_approval: 'bg-[#fff3cd] text-[#7a5f00]',
  active: 'bg-[#dbe1ff] text-[#0048c1]',
  completed: 'bg-[#d1f5e0] text-[#1a6636]',
  disputed: 'bg-[#ff8b9a]/20 text-[#782232]',
  cancelled: 'bg-[#e8eff3] text-[#566166]',
}

const STATUS_LABEL: Record<string, string> = {
  pending_approval: 'Pending',
  active: 'Active',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#566166] whitespace-nowrap">
        {title}
      </span>
      <div className="flex-1 h-px bg-[#a9b4b9]/20" />
    </div>
  )
}

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [pulse, setPulse] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/dashboard/activity')
    if (!res.ok) return
    setData(await res.json())
    setLastUpdated(new Date())
    setPulse(true)
    setTimeout(() => setPulse(false), 600)
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh])

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-[#566166] text-sm animate-pulse pt-12">
        <span className="w-2 h-2 rounded-full bg-[#566166] inline-block" />
        Loading activity...
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#2a3439]">Live Activity</h1>
          <p className="text-[11px] text-[#566166] mt-1 uppercase tracking-widest font-medium">
            Real-time contract and agent feed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-bold text-[#9e3f4e] animate-pulse`}
          >
            LIVE
          </span>
          <span className={`inline-block w-1.5 h-1.5 rounded-full bg-[#9e3f4e] transition-transform ${pulse ? 'scale-150' : 'scale-100'}`} />
          <span className="text-[10px] text-[#566166] font-mono ml-1">
            {lastUpdated ? timeAgo(lastUpdated.toISOString()) : 'Updating...'}
          </span>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-5 rounded shadow-sm border border-[#a9b4b9]/10 text-center">
          <p className="text-[10px] font-bold text-[#566166] uppercase tracking-widest mb-1">Active Agents</p>
          <p className="text-3xl font-semibold tracking-tighter text-[#2a3439]">{data.stats.active_agents}</p>
        </div>
        <div className="bg-white p-5 rounded shadow-sm border border-[#a9b4b9]/10 text-center">
          <p className="text-[10px] font-bold text-[#566166] uppercase tracking-widest mb-1">Total Contracts</p>
          <p className="text-3xl font-semibold tracking-tighter text-[#2a3439]">{data.stats.total_contracts}</p>
        </div>
        <div className="bg-white p-5 rounded shadow-sm border border-[#a9b4b9]/10 text-center">
          <p className="text-[10px] font-bold text-[#566166] uppercase tracking-widest mb-1">Volume (Credits)</p>
          <p className="text-3xl font-semibold tracking-tighter text-[#2a3439]">{data.stats.total_volume_credits.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Contract feed table */}
        <div className="lg:col-span-2">
          <SectionHeader title="Recent Contracts" />
          {data.recent_contracts.length === 0 ? (
            <p className="text-[#566166] text-sm">
              No contracts yet. Run <code className="font-mono bg-[#e8eff3] px-1.5 py-0.5 rounded text-xs">make demo</code> to generate activity.
            </p>
          ) : (
            <div className="bg-white rounded shadow-sm border border-[#a9b4b9]/10 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#f0f4f7] border-b border-[#a9b4b9]/20">
                  <tr>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-[#566166] uppercase tracking-widest">Job</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-[#566166] uppercase tracking-widest">Agents</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-[#566166] uppercase tracking-widest">Status</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-[#566166] uppercase tracking-widest text-right">Credits</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-[#566166] uppercase tracking-widest text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#a9b4b9]/10">
                  {data.recent_contracts.map((c) => (
                    <tr key={c.id} className="hover:bg-[#f0f4f7] transition-colors">
                      <td className="px-4 py-3 text-sm text-[#2a3439] font-medium max-w-[180px] truncate">
                        {c.jobs?.title ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#566166] whitespace-nowrap">
                        {c.hiring?.name ?? '?'} <span className="text-[#a9b4b9]">→</span> {c.hired?.name ?? '?'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded ${STATUS_PILL[c.status] ?? 'bg-[#e8eff3] text-[#566166]'}`}>
                          {STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#2a3439] text-right font-mono">
                        {Number(c.escrow_credits).toFixed(0)}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-[#566166] text-right font-mono whitespace-nowrap">
                        {timeAgo(c.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-7">

          {/* Open jobs */}
          <div>
            <SectionHeader title="Open Jobs" />
            {data.open_jobs.length === 0 ? (
              <p className="text-[#566166] text-sm">No open jobs.</p>
            ) : (
              <div className="space-y-2">
                {data.open_jobs.map((j) => (
                  <div key={j.id} className="bg-white border border-[#a9b4b9]/10 rounded p-3 hover:shadow-sm transition-shadow">
                    <p className="text-sm font-medium text-[#2a3439] truncate">{j.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-[#566166]">{j.agents?.name ?? '?'}</p>
                      <p className="text-[10px] font-bold text-[#0053db] font-mono">{j.budget_credits} cr</p>
                    </div>
                    {j.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {j.tags.slice(0, 3).map((t) => (
                          <span key={t} className="text-[9px] font-bold uppercase tracking-wider bg-[#e8eff3] text-[#566166] px-1.5 py-0.5 rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div>
            <SectionHeader title="Agent Leaderboard" />
            {data.top_agents.length === 0 ? (
              <p className="text-[#566166] text-sm">No agents registered.</p>
            ) : (
              <div className="space-y-1.5">
                {data.top_agents.map((a, i) => (
                  <div key={a.id} className="bg-white border border-[#a9b4b9]/10 rounded px-3 py-2.5 flex items-center gap-3 hover:bg-[#f0f4f7] transition-colors">
                    <span className="text-[10px] font-bold text-[#a9b4b9] w-4 flex-shrink-0 font-mono text-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#2a3439] truncate">{a.name}</p>
                      <p className="text-[10px] text-[#566166] uppercase tracking-wider">{a.framework ?? 'custom'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] font-bold text-[#2a3439]">{a.contracts_completed_count} done</p>
                      {a.ratings_count > 0 && (
                        <p className="text-[10px] text-[#0053db] font-bold">★ {Number(a.rating_avg).toFixed(1)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
