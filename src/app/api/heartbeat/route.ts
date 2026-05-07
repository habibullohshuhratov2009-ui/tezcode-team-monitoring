import { NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/db"
import { devTokens, teamHeartbeats, commitsLog } from "@/db/schema"
import { eq } from "drizzle-orm"

type CommitPayload = {
  hash: string
  message: string
  branch?: string
  repoName?: string
  ts: string
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const rawToken = auth.slice(7)
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex")

  const [token] = await db
    .select()
    .from(devTokens)
    .where(eq(devTokens.tokenHash, tokenHash))
    .limit(1)

  if (!token || token.revokedAt) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { claudeUsed, claudeLimit, claudeWindow, workMinutes, commits } = body

  await Promise.all([
    db.insert(teamHeartbeats).values({
      devId: token.devId,
      claudeUsed: claudeUsed ?? null,
      claudeLimit: claudeLimit ?? null,
      claudeWindow: claudeWindow ?? null,
      workMinutes: workMinutes ?? null,
    }),
    db.update(devTokens).set({ lastUsedAt: new Date() }).where(eq(devTokens.id, token.id)),
  ])

  // Save new commits (skip duplicates by hash)
  if (Array.isArray(commits) && commits.length > 0) {
    const rows = (commits as CommitPayload[])
      .filter((c) => c.hash && c.message && c.ts)
      .map((c) => ({
        devId: token.devId,
        hash: c.hash,
        message: c.message,
        branch: c.branch ?? null,
        repoName: c.repoName ?? null,
        ts: new Date(c.ts),
      }))

    if (rows.length > 0) {
      await db.insert(commitsLog).values(rows).onConflictDoNothing()
    }
  }

  return NextResponse.json({ ok: true })
}
