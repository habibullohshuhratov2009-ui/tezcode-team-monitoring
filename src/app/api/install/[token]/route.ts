import { NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/db"
import { devTokens } from "@/db/schema"
import { eq } from "drizzle-orm"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const url = new URL(req.url)
  const os = url.searchParams.get("os")
  const planParam = url.searchParams.get("plan") ?? "pro"
  const claudeLimit = planParam === "max20x" ? 4000000 : planParam === "max5x" ? 1000000 : 200000

  const hash = crypto.createHash("sha256").update(token).digest("hex")
  const [row] = await db
    .select()
    .from(devTokens)
    .where(eq(devTokens.tokenHash, hash))
    .limit(1)

  if (!row || row.revokedAt) {
    return new NextResponse("# Token yaroqsiz yoki bekor qilingan\necho 'Xato: token topilmadi'", {
      headers: { "Content-Type": "text/plain" },
    })
  }

  const server = "https://tezcode-team-monitoring-production.up.railway.app"

  if (os === "windows") {
    const ps = `# Tezcode Monitor — Windows o'rnatish
"${token}" | Out-File "$env:USERPROFILE\\.tezcode_token" -Encoding utf8

Write-Host ""
Write-Host "[tezcode] Claude planingiz qaysi?"
Write-Host "  1) Pro     — 200K token"
Write-Host "  2) Max 5x  — 1M token"
Write-Host "  3) Max 20x — 4M token"
$choice = Read-Host "Tanlang (1/2/3)"
$limit = switch ($choice) {
  "2" { 1000000 }
  "3" { 4000000 }
  default { 200000 }
}
$limit | Out-File "$env:USERPROFILE\\.tezcode_claude_limit" -Encoding utf8
Write-Host "[tezcode] Limit saqlandi: $limit token"

$scriptPath = "$env:USERPROFILE\\tezcode-monitor.ps1"
Invoke-WebRequest -Uri "${server}/api/scripts/windows" -OutFile $scriptPath
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
& $scriptPath -Install
& $scriptPath
Write-Host "[tezcode] O'rnatish tugadi!"
`
    return new NextResponse(ps, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  const bash = `#!/bin/bash
set -e
echo "[tezcode] v5 - O'rnatish boshlanmoqda..."
echo "${token}" > ~/.tezcode_token
chmod 600 ~/.tezcode_token
echo "${claudeLimit}" > ~/.tezcode_claude_limit
echo "[tezcode] Claude limit: ${claudeLimit} token (${planParam})"

# Asosiy monitoring skript
curl -fsSL "${server}/api/scripts/macos" -o ~/tezcode-monitor.sh
chmod +x ~/tezcode-monitor.sh

# Playwright Python skript (Claude.ai real usage)
curl -fsSL "${server}/api/scripts/playwright" -o ~/.tezcode_claude_usage.py
echo "[tezcode] Playwright skript yuklandi"

# Playwright o'rnatish (agar yo'q bo'lsa)
if ! python3 -c "import playwright" 2>/dev/null; then
  echo "[tezcode] Playwright o'rnatilmoqda..."
  pip3 install playwright --quiet 2>/dev/null || pip install playwright --quiet 2>/dev/null || true
  python3 -m playwright install chromium 2>/dev/null || true
  echo "[tezcode] Playwright tayyor"
fi

# Cron
(crontab -l 2>/dev/null | grep -v tezcode-monitor; echo "*/15 * * * * bash ~/tezcode-monitor.sh >> ~/.tezcode_monitor.log 2>&1") | crontab -

# Birinchi marta Claude.ai ga login (brauzer ochildi)
echo "[tezcode] Claude.ai ga login qiling (brauzer ochiladi)..."
python3 ~/.tezcode_claude_usage.py 2>&1 || true

bash ~/tezcode-monitor.sh
echo "[tezcode] O'rnatish tugadi! Har 15 daqiqada avtomatik yuboriladi."
`
  return new NextResponse(bash, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
