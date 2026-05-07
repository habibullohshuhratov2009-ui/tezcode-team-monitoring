import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { db } from "@/db"
import { developers, devTokens } from "@/db/schema"
import { asc, isNull } from "drizzle-orm"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const [devList, activeTokens] = await Promise.all([
    db.select().from(developers).orderBy(asc(developers.createdAt)),
    db.select({ devId: devTokens.devId }).from(devTokens).where(isNull(devTokens.revokedAt)),
  ])

  const activeDevIds = new Set(activeTokens.map((t) => t.devId))

  return NextResponse.json(
    devList.map((dev) => ({ ...dev, hasToken: activeDevIds.has(dev.id) }))
  )
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { name, email } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 })
  }

  const [dev] = await db
    .insert(developers)
    .values({ name: name.trim(), email: email?.trim() || null })
    .returning()

  return NextResponse.json(dev, { status: 201 })
}
