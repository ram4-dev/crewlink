'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { STATUS_PILL, STATUS_LABEL } from '@/lib/contracts/status'

type Attachment = {
  id: string
  original_filename: string
  mime_type: string
  file_size_bytes: number
  label: string | null
  is_image: boolean
  signed_url: string | null
  created_at: string
}

type ContractDetail = {
  contract: {
    id: string
    status: string
    budget_credits: number
    escrow_credits: number
    platform_fee: number | null
    proof: Record<string, unknown> | null
    proof_validation_warning: Record<string, unknown> | null
    dispute_reason: string | null
    rating: number | null
    created_at: string
    completed_at: string | null
    jobs: { title: string; description: string }
    hiring: { name: string }
    hired: { name: string }
  }
  attachments: Attachment[]
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>()
  const [data, setData] = useState<ContractDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/dashboard/contracts/${params.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Contract not found')
        return res.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [params.id])

  const approve = async () => {
    const res = await fetch(`/api/dashboard/contracts/${params.id}/approve`, { method: 'POST' })
    if (!res.ok) { setError('Failed to approve contract'); return }
    window.location.reload()
  }

  const reject = async () => {
    const res = await fetch(`/api/dashboard/contracts/${params.id}/reject`, { method: 'POST' })
    if (!res.ok) { setError('Failed to reject contract'); return }
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#566166] text-sm animate-pulse pt-12">
        <span className="w-2 h-2 rounded-full bg-[#566166] inline-block" />
        Loading contract...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="pt-12">
        <Link href="/dashboard/contracts" className="text-[#0053db] text-xs hover:underline mb-4 inline-block">
          &larr; Back to Contracts
        </Link>
        <p className="text-[#566166] text-sm">{error ?? 'Contract not found'}</p>
      </div>
    )
  }

  const { contract, attachments } = data

  return (
    <div>
      {/* Back link */}
      <Link href="/dashboard/contracts" className="text-[#0053db] text-xs hover:underline mb-6 inline-block">
        &larr; Back to Contracts
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#2a3439]">Contract Detail</h1>
        <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded ${STATUS_PILL[contract.status] ?? 'bg-[#e8eff3] text-[#566166]'}`}>
          {STATUS_LABEL[contract.status] ?? contract.status}
        </span>
      </div>

      {/* Job Info */}
      <Section title="Job Info">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <Label>Title</Label>
            <p className="text-[#2a3439] font-medium">{contract.jobs?.title ?? 'Unknown'}</p>
          </div>
          <div>
            <Label>Credits</Label>
            <p className="text-[#2a3439] font-mono tabular-nums">{Number(contract.escrow_credits).toFixed(2)}</p>
          </div>
          <div>
            <Label>Agents</Label>
            <p className="text-[#566166]">
              {contract.hiring?.name} <span className="text-[#a9b4b9]">&rarr;</span> {contract.hired?.name}
            </p>
          </div>
          <div>
            <Label>Date</Label>
            <p className="text-[#566166] font-mono text-xs">
              {new Date(contract.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {contract.completed_at && (
                <span> &mdash; Completed {new Date(contract.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              )}
            </p>
          </div>
          {contract.rating !== null && (
            <div>
              <Label>Rating</Label>
              <p className="text-[#2a3439] font-mono">{Number(contract.rating).toFixed(1)} / 5.0</p>
            </div>
          )}
          {contract.platform_fee !== null && (
            <div>
              <Label>Platform Fee</Label>
              <p className="text-[#566166] font-mono text-xs">{Number(contract.platform_fee).toFixed(2)} credits</p>
            </div>
          )}
        </div>
      </Section>

      {/* Proof */}
      <Section title="Proof">
        {contract.proof ? (
          <pre className="bg-[#f0f4f7] rounded p-4 text-xs text-[#2a3439] overflow-x-auto font-mono whitespace-pre-wrap">
            {JSON.stringify(contract.proof, null, 2)}
          </pre>
        ) : (
          <p className="text-[#a9b4b9] text-sm">No proof submitted</p>
        )}
      </Section>

      {/* Deliverables */}
      <Section title={`Deliverables${attachments.length > 0 ? ` (${attachments.length} file${attachments.length !== 1 ? 's' : ''})` : ''}`}>
        {attachments.length === 0 ? (
          <p className="text-[#a9b4b9] text-sm">No deliverables yet</p>
        ) : (
          <div className="space-y-3">
            {attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-4 p-3 bg-[#f0f4f7] rounded">
                {att.is_image && att.signed_url ? (
                  <img
                    src={att.signed_url}
                    alt={att.original_filename}
                    className="w-20 h-20 object-cover rounded border border-[#a9b4b9]/20"
                  />
                ) : (
                  <div className="w-20 h-20 flex items-center justify-center bg-white rounded border border-[#a9b4b9]/20">
                    <span
                      className="material-symbols-outlined text-[#a9b4b9] text-[32px]"
                      style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}
                    >
                      description
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#2a3439] truncate">{att.original_filename}</p>
                  <p className="text-[10px] text-[#566166] uppercase tracking-wider">
                    {att.mime_type} &middot; {formatBytes(att.file_size_bytes)}
                  </p>
                  {att.label && <p className="text-xs text-[#566166] mt-0.5">{att.label}</p>}
                </div>
                {att.signed_url && (
                  <a
                    href={att.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 bg-[#0053db] text-white rounded hover:bg-[#0048c1] transition-colors whitespace-nowrap"
                  >
                    Download
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Validation Warnings */}
      {contract.proof_validation_warning && (
        <Section title="Validation Warnings">
          <pre className="bg-[#fff3cd] rounded p-4 text-xs text-[#7a5f00] overflow-x-auto font-mono whitespace-pre-wrap">
            {JSON.stringify(contract.proof_validation_warning, null, 2)}
          </pre>
        </Section>
      )}

      {/* Dispute */}
      {contract.dispute_reason && (
        <Section title="Dispute Reason">
          <p className="text-sm text-[#782232]">{contract.dispute_reason}</p>
        </Section>
      )}

      {/* Actions */}
      {contract.status === 'pending_approval' && (
        <div className="flex items-center gap-3 mt-8">
          <button
            onClick={approve}
            className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 bg-[#0053db] text-white rounded hover:bg-[#0048c1] transition-colors"
          >
            Approve
          </button>
          <button
            onClick={reject}
            className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 bg-white text-[#9e3f4e] border border-[#9e3f4e]/40 rounded hover:bg-[#ff8b9a]/10 transition-colors"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#566166] whitespace-nowrap">{title}</span>
        <div className="flex-1 h-px bg-[#a9b4b9]/20" />
      </div>
      <div className="bg-white border border-[#a9b4b9]/10 rounded p-4">
        {children}
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest text-[#566166] mb-1">{children}</p>
}
