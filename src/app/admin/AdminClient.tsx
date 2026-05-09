"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

type Developer = {
  id: string
  name: string
  email: string | null
  status: string
  claudeLimit: number
  createdAt: string
  hasToken: boolean
}

const PLAN_OPTIONS = [
  { label: "Pro (88K)", value: 88000 },
  { label: "Max 5x (1M)", value: 1000000 },
  { label: "Max 20x (4M)", value: 4000000 },
]

function limitLabel(limit: number) {
  const opt = PLAN_OPTIONS.find((p) => p.value === limit)
  return opt ? opt.label : `${(limit / 1000).toFixed(0)}K`
}

export default function AdminClient() {
  const qc = useQueryClient()
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", claudeLimit: 88000 })
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const { data: rawDevs, isLoading } = useQuery({
    queryKey: ["admin-developers"],
    queryFn: () => fetch("/api/admin/developers").then((r) => r.json()),
  })
  const devs: Developer[] = Array.isArray(rawDevs) ? rawDevs : []

  const addDev = useMutation({
    mutationFn: (data: { name: string; email: string; claudeLimit: number }) =>
      fetch("/api/admin/developers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-developers"] })
      setShowAdd(false)
      setForm({ name: "", email: "", claudeLimit: 200000 })
    },
  })

  const updateLimit = useMutation({
    mutationFn: ({ devId, claudeLimit }: { devId: string; claudeLimit: number }) =>
      fetch(`/api/admin/developers/${devId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claudeLimit }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-developers"] }),
  })

  const genToken = useMutation({
    mutationFn: (devId: string) =>
      fetch(`/api/admin/developers/${devId}/token`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (data: { token: string }) => {
      setNewToken(data.token)
      setCopied(false)
      qc.invalidateQueries({ queryKey: ["admin-developers"] })
    },
  })

  const deleteDev = useMutation({
    mutationFn: (devId: string) =>
      fetch(`/api/admin/developers/${devId}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      setConfirmDeleteId(null)
      qc.invalidateQueries({ queryKey: ["admin-developers"] })
    },
  })

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="text-gray-500 hover:text-white text-sm transition">
            ← Dashboard
          </a>
          <h1 className="font-bold text-lg">Developers boshqaruvi</h1>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue-600 hover:bg-blue-700 text-sm px-4 py-2 rounded-lg transition"
        >
          + Dasturchi qo'shish
        </button>
      </header>

      <main className="p-6 max-w-3xl mx-auto">
        {isLoading ? (
          <div className="text-gray-500 text-center py-16">Yuklanmoqda...</div>
        ) : devs.length === 0 ? (
          <div className="text-gray-600 text-center py-16">
            <p>Hali dasturchilar yo'q.</p>
            <p className="text-sm mt-2">Yuqoridagi tugmani bosib qo'shing.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {devs.map((dev) => (
              <div
                key={dev.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{dev.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{dev.email || "Email yo'q"}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          dev.hasToken ? "bg-green-950 text-green-400" : "bg-gray-800 text-gray-500"
                        }`}
                      >
                        {dev.hasToken ? "Token aktiv" : "Token yo'q"}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                        📊 {limitLabel(dev.claudeLimit)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {confirmDeleteId === dev.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-400">O'chirilsinmi?</span>
                        <button
                          onClick={() => deleteDev.mutate(dev.id)}
                          disabled={deleteDev.isPending}
                          className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                        >
                          Ha
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition"
                        >
                          Yo'q
                        </button>
                      </div>
                    ) : (
                      <>
                        <select
                          value={dev.claudeLimit}
                          onChange={(e) => updateLimit.mutate({ devId: dev.id, claudeLimit: Number(e.target.value) })}
                          className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-blue-500 transition"
                        >
                          {PLAN_OPTIONS.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => genToken.mutate(dev.id)}
                          disabled={genToken.isPending}
                          className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg transition disabled:opacity-50"
                        >
                          {dev.hasToken ? "Tokenni yangilash" : "Token yaratish"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(dev.id)}
                          className="text-sm bg-gray-800 hover:bg-red-900 text-red-400 px-3 py-2 rounded-lg transition"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add developer modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="font-bold text-lg mb-4">Yangi dasturchi</h2>
            <div className="flex flex-col gap-3">
              <input
                placeholder="Ism (masalan: Polat)"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none focus:border-blue-500 transition"
                autoFocus
              />
              <input
                placeholder="Google email (ixtiyoriy)"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none focus:border-blue-500 transition"
              />
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Claude plan</p>
                <select
                  value={form.claudeLimit}
                  onChange={(e) => setForm((f) => ({ ...f, claudeLimit: Number(e.target.value) }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-blue-500 transition"
                >
                  {PLAN_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-600">
                Email kiritsangiz, dasturchi o'z Google hisobidan kira oladi.
              </p>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowAdd(false); setForm({ name: "", email: "", claudeLimit: 88000 }) }}
                className="flex-1 py-2.5 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition text-sm"
              >
                Bekor
              </button>
              <button
                onClick={() => addDev.mutate(form)}
                disabled={!form.name.trim() || addDev.isPending}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition text-sm disabled:opacity-50"
              >
                {addDev.isPending ? "Qo'shilmoqda..." : "Qo'shish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Token modal */}
      {newToken && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg">
            <h2 className="font-bold text-lg mb-1">Token yaratildi!</h2>
            <p className="text-gray-400 text-sm mb-4">
              Quyidagi buyruqni dasturchiga Telegram orqali yuboring. Faqat bir marta ko'rinadi.
            </p>

            <p className="text-xs text-gray-500 mb-1">🍎 macOS — Terminal:</p>
            <div className="bg-gray-800 rounded-lg p-3 font-mono text-xs text-green-400 break-all mb-2">
              {`curl -s https://tezcode-team-monitoring-production.up.railway.app/api/install/${newToken} | bash`}
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(`curl -s https://tezcode-team-monitoring-production.up.railway.app/api/install/${newToken} | bash`); setCopied(true) }}
              className={`w-full py-2 rounded-lg text-sm transition mb-4 ${copied ? "bg-green-700 text-green-200" : "bg-gray-700 hover:bg-gray-600 text-white"}`}
            >
              {copied ? "Nusxalandi ✓" : "macOS buyrug'ini nusxalash"}
            </button>

            <p className="text-xs text-gray-500 mb-1">🪟 Windows — PowerShell:</p>
            <div className="bg-gray-800 rounded-lg p-3 font-mono text-xs text-blue-400 break-all mb-2">
              {`irm "https://tezcode-team-monitoring-production.up.railway.app/api/install/${newToken}?os=windows" | iex`}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(`irm "https://tezcode-team-monitoring-production.up.railway.app/api/install/${newToken}?os=windows" | iex`)}
              className="w-full py-2 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 text-white transition mb-4"
            >
              Windows buyrug'ini nusxalash
            </button>

            <button
              onClick={() => { setNewToken(null); setCopied(false) }}
              className="w-full py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm transition"
            >
              Yopish
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
