import { createSupabaseAdmin } from '@/lib/supabase'
import { auth } from '@clerk/nextjs/server'
import Link from 'next/link'

async function getDashboardData(userId: string) {
  const supabase = createSupabaseAdmin()

  const { data: user } = await supabase
    .from('users')
    .select('credits_balance, approval_threshold')
    .eq('id', userId)
    .single()

  const { data: agents } = await supabase
    .from('agents')
    .select('id, is_active')
    .eq('owner_user_id', userId)

  const agentIds = agents?.map((a) => a.id) ?? []

  let pendingContracts = 0
  if (agentIds.length > 0) {
    const { count } = await supabase
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .in('hiring_agent_id', agentIds)
      .eq('status', 'pending_approval')
    pendingContracts = count ?? 0
  }

  return {
    balance: parseFloat(String(user?.credits_balance ?? 0)),
    totalAgents: agents?.length ?? 0,
    activeAgents: agents?.filter((a) => a.is_active).length ?? 0,
    pendingContracts,
  }
}

const DEV_NO_AUTH = process.env.DEV_NO_AUTH === 'true'
const DEV_USER_ID = '11111111-1111-1111-1111-111111111111'

async function getUserId(): Promise<string | null> {
  if (DEV_NO_AUTH) return DEV_USER_ID
  const { userId: clerkId } = await auth()
  if (!clerkId) return null
  const supabase = createSupabaseAdmin()
  const { data } = await supabase.from('users').select('id').eq('clerk_user_id', clerkId).single()
  return data?.id ?? null
}

export default async function DashboardHome() {
  const userId = await getUserId()
  if (!userId) return <p className="text-[#566166] text-sm">Loading...</p>

  const data = await getDashboardData(userId)

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#2a3439]">Command Center</h1>
        <p className="text-[11px] text-[#566166] mt-1 uppercase tracking-widest font-medium">
          Real-time orchestration and execution monitoring.
        </p>
      </div>

      {/* Pending approvals banner */}
      {data.pendingContracts > 0 && (
        <div className="mb-6 flex items-start gap-3 bg-white border-l-4 border-[#9e3f4e] px-5 py-4 rounded shadow-sm">
          <span
            className="material-symbols-outlined text-[#9e3f4e] text-[18px] flex-shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
          >
            priority_high
          </span>
          <div>
            <p className="text-[11px] font-bold text-[#9e3f4e] uppercase tracking-widest">Action Required</p>
            <p className="text-sm text-[#2a3439] mt-0.5">
              You have <strong>{data.pendingContracts}</strong> contract{data.pendingContracts !== 1 ? 's' : ''} awaiting your approval.{' '}
              <Link href="/dashboard/contracts" className="text-[#0053db] font-semibold hover:underline">
                Review now →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Credit Balance */}
        <div className="bg-white p-6 rounded shadow-sm border border-[#a9b4b9]/10">
          <p className="text-[10px] font-bold text-[#566166] uppercase tracking-widest mb-1">Credit Balance</p>
          <p className="text-4xl font-semibold tracking-tighter text-[#2a3439]">
            {data.balance.toFixed(0)}
          </p>
          <p className="text-[11px] text-[#566166] mt-1.5">
            credits &mdash; ≈ USD {(data.balance / 100).toFixed(2)}
          </p>
        </div>

        {/* Active Agents */}
        <div className="bg-white p-6 rounded shadow-sm border border-[#a9b4b9]/10">
          <p className="text-[10px] font-bold text-[#566166] uppercase tracking-widest mb-1">Active Agents</p>
          <p className="text-4xl font-semibold tracking-tighter text-[#2a3439]">
            {data.activeAgents}
          </p>
          <p className="text-[11px] text-[#566166] mt-1.5">running now</p>
        </div>

        {/* Total Agents */}
        <div className="bg-white p-6 rounded shadow-sm border border-[#a9b4b9]/10">
          <p className="text-[10px] font-bold text-[#566166] uppercase tracking-widest mb-1">Total Agents</p>
          <p className="text-4xl font-semibold tracking-tighter text-[#2a3439]">
            {data.totalAgents}
          </p>
          <p className="text-[11px] text-[#566166] mt-1.5">registered agents</p>
        </div>

        {/* Pending Approvals */}
        <div className={`bg-white p-6 rounded shadow-sm border ${data.pendingContracts > 0 ? 'border-[#9e3f4e]/30' : 'border-[#a9b4b9]/10'}`}>
          <p className="text-[10px] font-bold text-[#566166] uppercase tracking-widest mb-1">Pending Approvals</p>
          <div className="flex items-start gap-2">
            <p className={`text-4xl font-semibold tracking-tighter ${data.pendingContracts > 0 ? 'text-[#9e3f4e]' : 'text-[#2a3439]'}`}>
              {data.pendingContracts}
            </p>
            {data.pendingContracts > 0 && (
              <span
                className="material-symbols-outlined text-[#9e3f4e] text-[18px] mt-1.5"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
              >
                priority_high
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#566166] mt-1.5">contracts awaiting review</p>
        </div>
      </div>
    </div>
  )
}
