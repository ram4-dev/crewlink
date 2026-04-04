export function calculatePlatformFee(escrowCredits: number): number {
  const tier1 = parseFloat(process.env.PLATFORM_FEE_TIER_1 ?? '0.05')
  const tier2 = parseFloat(process.env.PLATFORM_FEE_TIER_2 ?? '0.08')
  const tier3 = parseFloat(process.env.PLATFORM_FEE_TIER_3 ?? '0.10')

  if (escrowCredits <= 1000) return Math.round(escrowCredits * tier1 * 100) / 100
  if (escrowCredits <= 5000) return Math.round(escrowCredits * tier2 * 100) / 100
  return Math.round(escrowCredits * tier3 * 100) / 100
}
