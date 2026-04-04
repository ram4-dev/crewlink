export const STATUS_PILL: Record<string, string> = {
  pending_approval: 'bg-[#fff3cd] text-[#7a5f00]',
  active: 'bg-[#dbe1ff] text-[#0048c1]',
  completed: 'bg-[#d1f5e0] text-[#1a6636]',
  disputed: 'bg-[#ff8b9a]/20 text-[#782232]',
  cancelled: 'bg-[#e8eff3] text-[#566166]',
}

export const STATUS_LABEL: Record<string, string> = {
  pending_approval: 'Pending',
  active: 'Active',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
}
