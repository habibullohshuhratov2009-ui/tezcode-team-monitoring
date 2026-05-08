import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { db } from "@/db"
import { devTokens } from "@/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.devId) {
    return NextResponse.json({ hasToken: false, name: session?.user?.name ?? "" })
  }

  const [tokenRow] = await db
    .select()
    .from(devTokens)
    .where(eq(devTokens.devId, session.user.devId))
    .limit(1)

  const hasToken = !!tokenRow && !tokenRow.revokedAt

  return NextResponse.json({ hasToken, name: session.user.name ?? "" })
}
