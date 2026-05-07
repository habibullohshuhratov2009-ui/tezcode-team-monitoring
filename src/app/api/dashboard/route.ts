import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { db } from "@/db"
import { developers, teamHeartbeats, commitsLog } from "@/db/schema"
import { eq, desc, gte, and } from "drizzle-orm"

type Commit = {
  hash: string
  message: string
  branch: string | null
  repoName: string | null
  ts: string
}

async function getDevStats(devId: string) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [[dev], [latest], recentCommits] = await Promise.all([
    db.select().from(developers).where(eq(developers.id, devId)).limit(1),
    db
      .select()
      .from(teamHeartbeats)
      .where(eq(teamHeartbeats.devId, devId))
      .orderBy(desc(teamHeartbeats.ts))
      .limit(1),
    db
      .select()
      .from(commitsLog)
      .where(and(eq(commitsLog.devId, devId), gte(commitsLog.ts, since24h)))
      .orderBy(desc(commitsLog.ts))
      .limit(20),
  ])

  if (!dev) return null

  const percent =
    latest?.claudeUsed && latest?.claudeLimit
      ? Math.round((latest.claudeUsed / latest.claudeLimit) * 100)
      : null

  const isActive = latest?.ts
    ? Date.now() - new Date(latest.ts).getTime() < 30 * 60 * 1000
    : false

  return {
    id: dev.id,
    name: dev.name,
    email: dev.email,
    lastSeen: latest?.ts ?? null,
    isActive,
    claude: {
      used: latest?.claudeUsed ?? null,
      limit: latest?.claudeLimit ?? null,
      percent,
      window: latest?.claudeWindow ?? null,
    },
    workMinutes: latest?.workMinutes ?? null,
    commits: recentCommits.map((c): Commit => ({
      hash: c.hash,
      message: c.message,
      branch: c.branch,
      repoName: c.repoName,
      ts: c.ts.toISOString(),
    })),
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  if (session.user.role === "admin") {
    const devList = await db
      .select()
      .from(developers)
      .where(eq(developers.status, "active"))

    const devData = (
      await Promise.all(devList.map((dev) => getDevStats(dev.id)))
    ).filter(Boolean)

    return NextResponse.json({
      role: "admin",
      stats: {
        totalDevs: devData.length,
        activeNow: devData.filter((d) => d!.isActive).length,
        tokenAlerts: devData.filter((d) => (d!.claude.percent ?? 0) >= 80).length,
      },
      developers: devData,
    })
  }

  if (session.user.role === "developer" && session.user.devId) {
    const stats = await getDevStats(session.user.devId)
    if (!stats) return NextResponse.json({ error: "dev_not_found" }, { status: 404 })
    return NextResponse.json({ role: "developer", developer: stats })
  }

  return NextResponse.json({ error: "forbidden" }, { status: 403 })
}
