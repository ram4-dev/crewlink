import { promises as dns } from 'dns'

const CLOUD_METADATA_IPS = new Set([
  '169.254.169.254', // AWS/GCP/Azure instance metadata
  '100.100.100.200', // Alibaba Cloud metadata
])

const CLOUD_METADATA_HOSTNAMES = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  '100.100.100.200',
])

function isPrivateIP(ip: string): boolean {
  // IPv6 loopback / link-local / ULA
  if (/^::1$/.test(ip)) return true
  if (/^fc00:/i.test(ip)) return true
  if (/^fe80:/i.test(ip)) return true

  // IPv4 private/reserved ranges
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,                             // link-local (includes 169.254.169.254)
    /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // CGNAT
    /^0\./,                                    // "this" network
    /^240\./,                                  // reserved
  ]
  return privateRanges.some((r) => r.test(ip)) || CLOUD_METADATA_IPS.has(ip)
}

const CREWLINK_DOMAINS = ['crewlink.io', 'crewlink.vercel.app']

// Resolves ALL IPv4 and IPv6 addresses for the hostname and blocks if any is private.
// A single private address in the response set is enough to reject the URL.
async function resolveAllAddresses(hostname: string): Promise<string[]> {
  const results = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
  ])

  const addresses: string[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      addresses.push(...result.value)
    }
  }

  // If both resolutions failed, treat as unresolvable (reject)
  if (addresses.length === 0) {
    throw new Error(`Cannot resolve hostname: ${hostname}`)
  }

  return addresses
}

export async function validateEndpointUrl(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('endpoint_url is not a valid URL')
  }

  // HTTPS required outside development
  const isDev = process.env.NODE_ENV === 'development'
  if (!isDev && parsed.protocol !== 'https:') {
    throw new Error('endpoint_url must use HTTPS in production')
  }

  // Block CrewLink domains (loop prevention)
  if (CREWLINK_DOMAINS.some((d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`))) {
    throw new Error('endpoint_url cannot point to CrewLink domains')
  }

  // Block cloud metadata hostnames directly (before DNS resolution)
  if (CLOUD_METADATA_HOSTNAMES.has(parsed.hostname)) {
    throw new Error(`endpoint_url resolves to cloud metadata endpoint: ${parsed.hostname}`)
  }

  // Resolve ALL addresses (IPv4 + IPv6) — block if any is private or reserved
  let addresses: string[]
  try {
    addresses = await resolveAllAddresses(parsed.hostname)
  } catch (err) {
    // Re-throw resolution errors as rejections
    throw err instanceof Error ? err : new Error(`Cannot resolve hostname: ${parsed.hostname}`)
  }

  for (const ip of addresses) {
    if (isPrivateIP(ip)) {
      throw new Error(`endpoint_url resolves to private IP: ${ip}`)
    }
  }
}
