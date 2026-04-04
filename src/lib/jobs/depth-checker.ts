import { createSupabaseAdmin } from '@/lib/supabase'

// Canonical name: MAX_AGENT_CHAIN_DEPTH (MAX_DEPTH_LEVEL is deprecated)
const MAX_DEPTH = parseInt(
  process.env.MAX_AGENT_CHAIN_DEPTH ?? process.env.MAX_DEPTH_LEVEL ?? '3',
  10
)
if (process.env.MAX_DEPTH_LEVEL && !process.env.MAX_AGENT_CHAIN_DEPTH) {
  console.warn('[depth-checker] MAX_DEPTH_LEVEL is deprecated — use MAX_AGENT_CHAIN_DEPTH')
}

export async function calculateDepthLevel(
  agentId: string,
  parentContractId: string | null | undefined
): Promise<number> {
  if (!parentContractId) return 1

  const supabase = createSupabaseAdmin()

  // Verify the agent was hired_agent of the parent contract
  const { data: parentContract } = await supabase
    .from('contracts')
    .select('id, hired_agent_id, job_id')
    .eq('id', parentContractId)
    .single()

  if (!parentContract) throw new Error('Parent contract not found')
  if (parentContract.hired_agent_id !== agentId) {
    throw Object.assign(new Error('Only the hired agent can subcontract'), { code: 'FORBIDDEN' })
  }

  const { data: parentJob } = await supabase
    .from('jobs')
    .select('depth_level')
    .eq('id', parentContract.job_id)
    .single()

  if (!parentJob) throw new Error('Parent job not found')

  return parentJob.depth_level + 1
}

export function checkMaxDepth(depthLevel: number): void {
  if (depthLevel > MAX_DEPTH) {
    throw Object.assign(
      new Error(`Chain depth exceeded (${depthLevel}/${MAX_DEPTH})`),
      { code: 'CHAIN_DEPTH_EXCEEDED', depth: depthLevel, max: MAX_DEPTH }
    )
  }
}

export async function detectCycle(
  hiringAgentId: string,
  hiredAgentId: string,
  jobId: string
): Promise<boolean> {
  const supabase = createSupabaseAdmin()
  const chain = new Set<string>([hiringAgentId])
  let currentJobId: string | null = jobId

  while (currentJobId) {
    const { data: job } = await supabase
      .from('jobs')
      .select('parent_contract_id')
      .eq('id', currentJobId)
      .single()

    if (!job?.parent_contract_id) break

    const { data: parentContract } = await supabase
      .from('contracts')
      .select('hiring_agent_id, hired_agent_id, job_id')
      .eq('id', job.parent_contract_id)
      .single()

    if (!parentContract) break

    chain.add(parentContract.hiring_agent_id)
    chain.add(parentContract.hired_agent_id)

    const { data: parentJob } = await supabase
      .from('jobs')
      .select('id, parent_contract_id')
      .eq('id', parentContract.job_id)
      .single()

    currentJobId = parentJob?.parent_contract_id ? parentJob.id : null
  }

  return chain.has(hiredAgentId)
}
