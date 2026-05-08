import cron from "node-cron"
import { db } from "@/db"
import { developers, teamHeartbeats, commitsLog } from "@/db/schema"
import { eq, desc, gte, and } from "drizzle-orm"
import { sendTelegram } from "./telegram"

export function startCron() {
  cron.schedule("*/15 * * * *", sendSummary)
}

async function sendSummary() {
  try {
    const devList = await db
      .select()
      .from(developers)
      .where(eq(developers.status, "active"))

    if (devList.length === 0) {
      await sendTelegram("👋 Salom! Tezcode Monitor ishlamoqda.\n\nHali hech qanday dasturchi qo'shilmagan.")
      return
    }

    const now = Date.now()
    const since24h = new Date(now - 24 * 60 * 60 * 1000)

    const stats = await Promise.all(
      devList.map(async (dev) => {
        const [[latest], commits] = await Promise.all([
          db
            .select()
            .from(teamHeartbeats)
            .where(eq(teamHeartbeats.devId, dev.id))
            .orderBy(desc(teamHeartbeats.ts))
            .limit(1),
          db
            .select()
            .from(commitsLog)
            .where(and(eq(commitsLog.devId, dev.id), gte(commitsLog.ts, since24h))),
        ])

        const isActive = latest?.ts
          ? now - new Date(latest.ts).getTime() < 30 * 60 * 1000
          : false

        const percent =
          latest?.claudeUsed && latest?.claudeLimit
            ? Math.round((latest.claudeUsed / latest.claudeLimit) * 100)
            : null

        const workH = latest?.workMinutes
          ? `${Math.round(latest.workMinutes / 60)}h`
          : "—"

        return { dev, isActive, percent, commitCount: commits.length, workH }
      })
    )

    const activeCount = stats.filter((s) => s.isActive).length
    const alertCount = stats.filter((s) => (s.percent ?? 0) >= 80).length

    const time = new Date().toLocaleTimeString("uz-UZ", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tashkent",
    })

    let msg = `📊 <b>Tezcode — ${time} hisoboti</b>\n`
    msg += `━━━━━━━━━━━━━━━━━\n`
    msg += `👥 Aktiv dasturchilar: <b>${activeCount} / ${devList.length}</b>\n\n`

    for (const { dev, isActive, percent, commitCount, workH } of stats) {
      if (!isActive) {
        msg += `⚫ <b>${dev.name}</b> — hozir oflayn\n`
      } else if ((percent ?? 0) >= 80) {
        msg += `🔴 <b>${dev.name}</b> — token <b>${percent}%</b> (kritik!) | ${commitCount} commit | ${workH} ishladi\n`
      } else if ((percent ?? 0) >= 50) {
        msg += `🟡 <b>${dev.name}</b> — token ${percent}% | ${commitCount} commit | ${workH} ishladi\n`
      } else {
        msg += `🟢 <b>${dev.name}</b> — token ${percent ?? "—"}% | ${commitCount} commit | ${workH} ishladi\n`
      }
    }

    msg += `━━━━━━━━━━━━━━━━━\n`
    if (alertCount > 0) {
      msg += `🚨 <b>${alertCount} ta dasturchi token limiti yaqinlashdi!</b>`
    } else {
      msg += `✅ Hamma yaxshi, muammo yo'q`
    }

    await sendTelegram(msg)
  } catch {}
}
