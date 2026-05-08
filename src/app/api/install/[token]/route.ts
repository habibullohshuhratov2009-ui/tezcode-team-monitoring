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
  const os = new URL(req.url).searchParams.get("os")

  // Validate token
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
echo "[tezcode] O'rnatish boshlanmoqda..."
echo "${token}" > ~/.tezcode_token
chmod 600 ~/.tezcode_token
curl -s "${server}/api/scripts/macos" -o ~/tezcode-monitor.sh
chmod +x ~/tezcode-monitor.sh
(crontab -l 2>/dev/null | grep -v tezcode-monitor; echo "*/15 * * * * bash ~/tezcode-monitor.sh >> ~/.tezcode_monitor.log 2>&1") | crontab -
bash ~/tezcode-monitor.sh
echo "[tezcode] O'rnatish tugadi! Har 15 daqiqada ma'lumot yuboriladi."
`
  return new NextResponse(bash, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
