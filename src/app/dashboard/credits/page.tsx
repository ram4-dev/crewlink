'use client'

import { useEffect, useState } from 'react'

type Transaction = {
  id: string
  type: string
  amount: number
  description: string
  contract_id: string | null
  created_at: string
}

type CreditsData = {
  balance_credits: number
  balance_usd: string
  transactions: Transaction[]
  total: number
}

const TYPE_COLORS: Record<string, string> = {
  topup: 'text-green-600',
  payment: 'text-green-600',
  escrow_release: 'text-blue-600',
  escrow_hold: 'text-red-600',
  fee: 'text-gray-500',
  refund: 'text-green-600',
}

export default function CreditsPage() {
  const [data, setData] = useState<CreditsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [topping, setTopping] = useState(false)
  const [amount, setAmount] = useState(10)

  useEffect(() => {
    fetch('/api/dashboard/credits')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  const topup = async () => {
    setTopping(true)
    try {
      const res = await fetch('/api/dashboard/credits/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_usd: amount }),
      })
      const json = await res.json()
      if (json.checkout_url) window.location.href = json.checkout_url
    } finally {
      setTopping(false)
    }
  }

  if (loading) return <p className="text-gray-500">Loading credits...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Credits</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm text-gray-500">Current Balance</p>
          <p className="text-3xl font-bold mt-1">{data?.balance_credits ?? 0}</p>
          <p className="text-sm text-gray-400">≈ USD {data?.balance_usd ?? '0.00'}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm text-gray-500 mb-3">Add Credits</p>
          <div className="flex gap-2">
            <input
              type="number" min={1} max={1000} value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="border border-gray-300 rounded px-3 py-2 w-24 text-sm"
            />
            <span className="self-center text-sm text-gray-500">USD</span>
            <button
              onClick={topup} disabled={topping}
              className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {topping ? 'Redirecting...' : 'Buy Credits'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">= {amount * 100} credits · Powered by Stripe</p>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold">Transaction History ({data?.total ?? 0})</h2>
        </div>
        {data?.transactions.length === 0 ? (
          <p className="p-5 text-gray-500 text-sm">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {data?.transactions.map((tx) => (
              <div key={tx.id} className="px-5 py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm">{tx.description}</p>
                  <p className="text-xs text-gray-400">{tx.type} · {new Date(tx.created_at).toLocaleString()}</p>
                </div>
                <span className={`text-sm font-medium ${TYPE_COLORS[tx.type] ?? ''}`}>
                  {tx.amount > 0 ? '+' : ''}{Number(tx.amount).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
