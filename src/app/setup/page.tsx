"use client"

import { useSession } from "next-auth/react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

type SetupData = { hasToken: boolean; name: string }

function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative mt-2">
      {label && <p className="text-sm text-gray-400 mb-1">{label}</p>}
      <code className="block bg-gray-800 rounded-lg p-3 text-sm text-green-300 break-all pr-20">
        {text}
      </code>
      <button
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
        className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition"
      >
        {copied ? "✓" : "Nusxalash"}
      </button>
    </div>
  )
}

export default function SetupPage() {
  const { data: session, status } = useSession()
  const { data } = useQuery<SetupData>({
    queryKey: ["setup"],
    queryFn: () => fetch("/api/setup").then((r) => r.json()),
    enabled: status === "authenticated",
  })

  if (status === "loading") return null
  if (status === "unauthenticated") { window.location.href = "/login"; return null }
  if (session?.user?.role === "admin") { window.location.href = "/dashboard"; return null }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">O'rnatish</h1>
          <p className="text-gray-400 mt-1">
            Salom, <b>{data?.name || session?.user?.name}</b>! Quyidagi qadamlarni bajaring.
          </p>
        </div>

        {!data?.hasToken ? (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-5 text-yellow-300">
            ⚠️ Sizga hali token berilmagan. Admin bilan bog'laning (Telegram orqali token so'rang).
          </div>
        ) : (
          <div className="flex flex-col gap-6">

            <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4 text-sm text-blue-300">
              ℹ️ Tokeningizni admin Telegram orqali yuborgan. Quyidagi buyruqlarda <code className="text-white">YOUR_TOKEN</code> o'rniga shu tokenni qo'ying.
            </div>

            {/* macOS */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">🍎</span>
                <h2 className="font-semibold">macOS — Terminal</h2>
              </div>

              <CopyBlock
                label="1. Tokenni saqlang:"
                text={`echo "YOUR_TOKEN" > ~/.tezcode_token && chmod 600 ~/.tezcode_token`}
              />
              <CopyBlock
                label="2. Skriptni yuklab oling:"
                text={`curl -o ~/tezcode-monitor.sh https://tezcode-team-monitoring-production.up.railway.app/api/scripts/macos && chmod +x ~/tezcode-monitor.sh`}
              />
              <CopyBlock
                label="3. Har 15 daqiqada avtomatik ishga tushiring:"
                text={`(crontab -l 2>/dev/null; echo "*/15 * * * * bash ~/tezcode-monitor.sh >> ~/.tezcode_monitor.log 2>&1") | crontab -`}
              />
              <CopyBlock
                label="4. Test (bir marta ishlatib ko'ring):"
                text={`bash ~/tezcode-monitor.sh`}
              />
            </div>

            {/* Windows */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">🪟</span>
                <h2 className="font-semibold">Windows — PowerShell (Admin)</h2>
              </div>

              <CopyBlock
                label="1. Tokenni saqlang:"
                text={`"YOUR_TOKEN" | Out-File "$env:USERPROFILE\\.tezcode_token" -Encoding utf8`}
              />

              <p className="text-sm text-gray-400 mt-4 mb-1">2. Skriptni yuklab oling:</p>
              <a
                href="/api/scripts/windows"
                download="tezcode-monitor.ps1"
                className="inline-block bg-blue-700 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded-lg transition"
              >
                ⬇ tezcode-monitor.ps1 yuklab olish
              </a>

              <CopyBlock
                label="3. O'rnating (bir marta):"
                text={`.\\tezcode-monitor.ps1 -Install`}
              />
            </div>

            <div className="bg-green-950/30 border border-green-800 rounded-xl p-4 text-sm text-green-300">
              ✅ O'rnatilgandan keyin 15 daqiqa ichida dashboardda ko'rinasiz.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
