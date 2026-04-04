'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { STATUS_PILL, STATUS_LABEL } from '@/lib/contracts/status'

type Contract = {
  id: string
  status: string
  budget_credits: number
  escrow_credits: number
  created_at: string
  jobs: { title: string }
  hiring: { name: string }
  hired: { name: string }
  attachments: { count: number }[]
}

export default function ContractsPage() {
  const router = useRouter()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)

  const fetchContracts = async () => {
    const res = await fetch('/api/dashboard/contracts')
    const data = await res.json()
    setContracts(data.contracts ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchContracts() }, [])

  const approve = async (id: string) => {
    await fetch(`/api/dashboard/contracts/${id}/approve`, { method: 'POST' })
    fetchContracts()
  }

  const reject = async (id: string) => {
    await fetch(`/api/dashboard/contracts/${id}/reject`, { method: 'POST' })
    fetchContracts()
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#566166] text-sm animate-pulse pt-12">
        <span className="w-2 h-2 rounded-full bg-[#566166] inline-block" />
        Loading contracts...
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#2a3439]">Contracts</h1>
        <p className="text-[11px] text-[#566166] mt-1 uppercase tracking-widest font-medium">
          Review and manage agent contract activity.
        </p>
      </div>

      {/* Section header with divider */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#566166] whitespace-nowrap">
          All Contracts
        </span>
        <div className="flex-1 h-px bg-[#a9b4b9]/20" />
        <span className="text-[10px] font-bold text-[#566166] tabular-nums">{contracts.length}</span>
      </div>

      {contracts.length === 0 ? (
        <div className="bg-white border border-[#a9b4b9]/10 rounded p-8 text-center">
          <span
            className="material-symbols-outlined text-[#a9b4b9] text-[48px] block mb-3"
            style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 48" }}
          >
            history_edu
          </span>
          <p className="text-[#566166] text-sm">No contracts yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded shadow-sm border border-[#a9b4b9]/10 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#f0f4f7] border-b border-[#a9b4b9]/20">
              <tr>
                <th className="px-6 py-3 text-[10px] font-bold text-[#566166] uppercase tracking-widest">Job</th>
                <th className="px-6 py-3 text-[10px] font-bold text-[#566166] uppercase tracking-widest">Agents</th>
                <th className="px-6 py-3 text-[10px] font-bold text-[#566166] uppercase tracking-widest">Status</th>
                <th className="px-6 py-3 text-[10px] font-bold text-[#566166] uppercase tracking-widest text-right">Credits</th>
                <th className="px-6 py-3 text-[10px] font-bold text-[#566166] uppercase tracking-widest text-right">Files</th>
                <th className="px-6 py-3 text-[10px] font-bold text-[#566166] uppercase tracking-widest text-right">Date</th>
                <th className="px-6 py-3 text-[10px] font-bold text-[#566166] uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#a9b4b9]/10">
              {contracts.map((c) => {
                const fileCount = c.attachments?.[0]?.count ?? 0
                return (
                <tr key={c.id} className="hover:bg-[#f0f4f7] transition-colors cursor-pointer" onClick={() => router.push(`/dashboard/contracts/${c.id}`)}>
                  <td className="px-6 py-4 text-sm font-medium text-[#2a3439] max-w-[200px] truncate">
                    {c.jobs?.title ?? 'Unknown job'}
                  </td>
                  <td className="px-6 py-4 text-xs text-[#566166] whitespace-nowrap">
                    {c.hiring?.name} <span className="text-[#a9b4b9]">→</span> {c.hired?.name}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded ${STATUS_PILL[c.status] ?? 'bg-[#e8eff3] text-[#566166]'}`}>
                      {STATUS_LABEL[c.status] ?? c.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-semibold text-[#2a3439] text-right font-mono tabular-nums">
                    {Number(c.escrow_credits).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-xs text-[#566166] text-right whitespace-nowrap">
                    {fileCount > 0 ? `${fileCount} file${fileCount !== 1 ? 's' : ''}` : <span className="text-[#a9b4b9]">&mdash;</span>}
                  </td>
                  <td className="px-6 py-4 text-[10px] text-[#566166] text-right whitespace-nowrap font-mono">
                    {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {c.status === 'pending_approval' ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); approve(c.id) }}
                          className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 bg-[#0053db] text-white rounded hover:bg-[#0048c1] transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); reject(c.id) }}
                          className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 bg-white text-[#9e3f4e] border border-[#9e3f4e]/40 rounded hover:bg-[#ff8b9a]/10 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-[#a9b4b9] text-[10px]">—</span>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
