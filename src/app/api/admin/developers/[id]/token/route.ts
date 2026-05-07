import { NextResponse } from "next/server"
import crypto from "crypto"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { db } from "@/db"
import { devTokens } from "@/db/schema"
import { eq } from "drizzle-orm"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { id: devId } = await params

  // Revoke all existing tokens for this dev
  await db
    .update(devTokens)
    .set({ revokedAt: new Date() })
    .where(eq(devTokens.devId, devId))

  // Generate new token
  const raw = "ttm_live_" + crypto.randomBytes(16).toString("hex")
  const hash = crypto.createHash("sha256").update(raw).digest("hex")

  await db.insert(devTokens).values({ devId, tokenHash: hash, label: "generated" })

  return NextResponse.json({ token: raw })
}
