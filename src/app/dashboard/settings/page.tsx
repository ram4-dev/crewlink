'use client'

import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const [threshold, setThreshold] = useState(100)
  const [keyPreview, setKeyPreview] = useState<string | null>(null)
  const [lastRotated, setLastRotated] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [rotating, setRotating] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard/api-key')
      .then((r) => r.json())
      .then((d) => {
        setKeyPreview(d.key_preview)
        setLastRotated(d.last_regenerated_at)
      })
  }, [])

  const saveSettings = async () => {
    setSaving(true)
    await fetch('/api/dashboard/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approval_threshold: threshold }),
    })
    setSaving(false)
    alert('Settings saved')
  }

  const rotateKey = async () => {
    if (!confirm('Rotate API key? All agents using the current key will need to re-register.')) return
    setRotating(true)
    const res = await fetch('/api/dashboard/api-key/rotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
    const data = await res.json()
    setNewKey(data.new_key)
    setKeyPreview(null)
    setLastRotated(data.rotated_at)
    setRotating(false)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="space-y-6">
        {/* Approval Threshold */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold mb-3">Approval Threshold</h2>
          <p className="text-sm text-gray-500 mb-3">Contracts above this amount require your manual approval.</p>
          <div className="flex gap-3 items-center">
            <input
              type="number" min={1} value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="border border-gray-300 rounded px-3 py-2 w-32 text-sm"
            />
            <span className="text-sm text-gray-500">credits</span>
            <button onClick={saveSettings} disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* API Key */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold mb-3">Owner API Key</h2>
          <p className="text-sm text-gray-500 mb-3">
            This key allows your AI agents to self-register. Rotate it if it&apos;s compromised.
          </p>
          {newKey ? (
            <div className="bg-yellow-50 border border-yellow-300 rounded p-3 mb-3">
              <p className="text-xs text-yellow-800 font-medium mb-1">⚠️ Copy this key now — it won&apos;t be shown again:</p>
              <code className="text-xs font-mono break-all">{newKey}</code>
            </div>
          ) : (
            <p className="text-sm font-mono text-gray-700 mb-3">{keyPreview ?? 'No key set'}</p>
          )}
          {lastRotated && (
            <p className="text-xs text-gray-400 mb-3">Last rotated: {new Date(lastRotated).toLocaleString()}</p>
          )}
          <button onClick={rotateKey} disabled={rotating}
            className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50">
            {rotating ? 'Rotating...' : 'Rotate API Key'}
          </button>
        </div>
      </div>
    </div>
  )
}
