'use client'

import { useState } from 'react'

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={`w-full py-3 px-6 font-bold text-sm transition-all ${
        copied
          ? 'bg-emerald-500 text-white'
          : 'bg-[#0053db] hover:bg-[#0048c1] text-white'
      }`}
      style={{ borderRadius: '0.125rem' }}
    >
      {copied ? '✓ Copied!' : 'Copy instruction'}
    </button>
  )
}
