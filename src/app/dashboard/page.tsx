"use client"

import { useQuery } from "@tanstack/react-query"
import { signOut, useSession } from "next-auth/react"

type Commit = {
  hash: string
  message: string
  branch: string | null
  repoName: string | null
  ts: string
}

type DevStats = {
  id: string
  name: string
  email: string | null
  lastSeen: string | null
  isActive: boolean
  workMinutes: number | null
  claude: {
    used: number | null
    limit: number | null
    percent: number | null
    window: string | null
    weeklyTokens: number | null
    weeklyPercent: number | null
  }
  commits: Commit[]
}

type DashboardData =
  | { role: "admin"; stats: { totalDevs: number; activeNow: number; tokenAlerts: number }; developers: DevStats[] }
  | { role: "developer"; developer: DevStats }

export default function DashboardPage() {
  const { data: session } = useSession()
  const { data, isLoading, dataUpdatedAt } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => fetch("/api/dashboard").then((r) => r.json()),
    refetchInterval: 15 * 60 * 1000,
  })

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <h1 className="font-bold text-lg">Tezcode Monitor</h1>
        <div className="flex items-center gap-4">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-gray-500">
              {new Date(dataUpdatedAt).toLocaleTimeString("uz")}
            </span>
          )}
          <span className="text-sm text-gray-400">{session?.user?.name}</span>
          {session?.user?.role === "admin" && (
            <a href="/admin" className="text-xs text-blue-500 hover:text-blue-400 transition">
              Boshqaruv
            </a>
          )}
          {session?.user?.role === "developer" && (
            <a href="/setup" className="text-xs text-gray-500 hover:text-white transition">
              O'rnatish
            </a>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-xs text-gray-500 hover:text-white transition"
          >
            Chiqish
          </button>
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            Yuklanmoqda...
          </div>
        ) : data?.role === "admin" ? (
          <AdminView data={data} />
        ) : data?.role === "developer" ? (
          <DevView dev={(data as { role: "developer"; developer: DevStats }).developer} />
        ) : null}
      </main>
    </div>
  )
}

// ─── Admin ko'rinishi ───────────────────────────────────────────────
function AdminView({ data }: { data: Extract<DashboardData, { role: "admin" }> }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Aktiv" value={`${data.stats.activeNow} / ${data.stats.totalDevs}`} />
        <StatCard label="Token alert (>80%)" value={String(data.stats.tokenAlerts)} alert={data.stats.tokenAlerts > 0} />
        <StatCard label="Jami dasturchilar" value={String(data.stats.totalDevs)} />
      </div>
      <div className="flex flex-col gap-3">
        {data.developers.map((dev) => (
          <DevCard key={dev.id} dev={dev} />
        ))}
      </div>
    </>
  )
}

// ─── Developer o'z ko'rinishi ───────────────────────────────────────
function DevView({ dev }: { dev: DevStats }) {
  const percent = dev.claude.percent ?? 0
  const minutesAgo = dev.lastSeen
    ? Math.round((Date.now() - new Date(dev.lastSeen).getTime()) / 60000)
    : null

  const tokenColor = percent >= 80 ? "text-red-400" : percent >= 50 ? "text-yellow-400" : "text-green-400"
  const barColor = percent >= 80 ? "bg-red-500" : percent >= 50 ? "bg-yellow-500" : "bg-green-500"

  return (
    <div className="flex flex-col gap-8 pt-4">
      {/* Status */}
      <div className="text-center">
        <p className="text-gray-400 text-sm">Salom, {dev.name}</p>
        <p className="text-gray-500 text-xs mt-1">
          {statusLabel(dev.isActive, minutesAgo)}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Claude token */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
          <p className="text-gray-500 text-xs mb-1">Claude token</p>
          <p className={`text-5xl font-bold ${tokenColor}`}>
            {dev.claude.percent !== null ? `${dev.claude.percent}%` : "—"}
          </p>
          {dev.claude.used && dev.claude.limit && (
            <p className="text-gray-600 text-xs mt-1">
              {(dev.claude.used / 1000).toFixed(0)}K / {(dev.claude.limit / 1000).toFixed(0)}K
            </p>
          )}
          <div className="mt-3 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent}%` }} />
          </div>
        </div>

        {/* Weekly tokens */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
          <p className="text-gray-500 text-xs mb-1">Haftalik token</p>
          {dev.claude.weeklyPercent !== null ? (
            <>
              <p className="text-3xl font-bold text-blue-400">{dev.claude.weeklyPercent}%</p>
              <p className="text-gray-600 text-xs mt-1">7 kunlik foydalanish</p>
            </>
          ) : dev.claude.weeklyTokens !== null ? (
            <>
              <p className="text-3xl font-bold text-blue-400">
                {(dev.claude.weeklyTokens / 1000).toFixed(0)}K
              </p>
              <p className="text-gray-600 text-xs mt-1">
                {dev.claude.weeklyTokens.toLocaleString()} output token
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold text-blue-400">—</p>
              <p className="text-gray-600 text-xs mt-1">Hali ma'lumot yo'q</p>
            </>
          )}
        </div>
      </div>

      {percent >= 80 && (
        <div className="bg-red-950 border border-red-800 rounded-xl px-6 py-4 text-center">
          <p className="text-red-400 font-medium">⚠️ Token tugayapti</p>
          <p className="text-red-500 text-sm mt-1">Bekzod akaga xabar bering</p>
        </div>
      )}

      {/* Commits */}
      <div>
        <p className="text-gray-400 text-sm font-medium mb-3">
          So'nggi commitlar (24 soat)
          <span className="text-gray-600 ml-2">{dev.commits.length} ta</span>
        </p>
        {dev.commits.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center text-gray-600 text-sm">
            Hali commit yo'q
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {dev.commits.map((c) => (
              <CommitRow key={c.hash} commit={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Admin devcard ──────────────────────────────────────────────────
function DevCard({ dev }: { dev: DevStats }) {
  const percent = dev.claude.percent ?? 0
  const tokenColor = percent >= 80 ? "text-red-400" : percent >= 50 ? "text-yellow-400" : "text-green-400"
  const barColor = percent >= 80 ? "bg-red-500" : percent >= 50 ? "bg-yellow-500" : "bg-green-500"
  const minutesAgo = dev.lastSeen
    ? Math.round((Date.now() - new Date(dev.lastSeen).getTime()) / 60000)
    : null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
      {/* Row 1: name + online dot + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dev.isActive ? "bg-green-400" : "bg-gray-600"}`} />
          <p className="font-semibold text-white">{dev.name}</p>
        </div>
        <span className="text-xs text-gray-500">{statusLabel(dev.isActive, minutesAgo)}</span>
      </div>

      {/* Row 2: token % bar */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-gray-500">Claude token</span>
          <span className={`text-sm font-bold ${tokenColor}`}>
            {dev.claude.percent !== null ? `${dev.claude.percent}%` : "—"}
          </span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent}%` }} />
        </div>
      </div>

      {/* Row 3: commits (always shown) */}
      <div>
        <p className="text-xs text-gray-600 mb-1.5">
          Commitlar{" "}
          <span className="text-gray-700">({dev.commits.length})</span>
        </p>
        {dev.commits.length === 0 ? (
          <p className="text-xs text-gray-700">Hali commit yo'q</p>
        ) : (
          <div className="flex flex-col gap-1">
            {dev.commits.slice(0, 3).map((c) => {
              const cMin = Math.round((Date.now() - new Date(c.ts).getTime()) / 60000)
              const cTime = cMin < 60 ? `${cMin} daq` : `${Math.round(cMin / 60)} soat`
              return (
                <div key={c.hash} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-700 font-mono shrink-0">{c.hash.slice(0, 7)}</span>
                  <span className="text-gray-500 truncate flex-1">{c.message}</span>
                  <span className="text-gray-700 shrink-0">{cTime}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared components ──────────────────────────────────────────────
function statusLabel(isActive: boolean, minutesAgo: number | null): string {
  if (isActive) return "💚 Ishlayapti"
  if (minutesAgo === null) return "⚫ Ma'lumot yo'q"
  if (minutesAgo < 60) return `💤 ${minutesAgo} daqiqa ishlamadi`
  if (minutesAgo < 1440) return `💤 ${Math.round(minutesAgo / 60)} soat ishlamadi`
  return `💤 ${Math.round(minutesAgo / 1440)} kun ishlamadi`
}

function StatCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${alert ? "text-red-400" : "text-white"}`}>{value}</p>
    </div>
  )
}

function CommitRow({ commit }: { commit: Commit }) {
  const timeAgo = Math.round((Date.now() - new Date(commit.ts).getTime()) / 60000)
  const timeStr = timeAgo < 60
    ? `${timeAgo} daq oldin`
    : `${Math.round(timeAgo / 60)} soat oldin`

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-start gap-3">
      <span className="text-gray-600 font-mono text-xs mt-0.5 flex-shrink-0">
        {commit.hash.slice(0, 7)}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{commit.message}</p>
        <p className="text-xs text-gray-600 mt-0.5">
          {commit.repoName && <span className="text-gray-500">{commit.repoName}</span>}
          {commit.branch && <span className="text-gray-700"> · {commit.branch}</span>}
        </p>
      </div>
      <span className="text-xs text-gray-600 flex-shrink-0">{timeStr}</span>
    </div>
  )
}
