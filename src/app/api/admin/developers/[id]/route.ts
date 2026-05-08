import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { db } from "@/db"
import { developers } from "@/db/schema"
import { eq } from "drizzle-orm"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { id } = await params
  const { claudeLimit } = await req.json()

  if (typeof claudeLimit !== "number") {
    return NextResponse.json({ error: "claudeLimit required" }, { status: 400 })
  }

  const [dev] = await db
    .update(developers)
    .set({ claudeLimit })
    .where(eq(developers.id, id))
    .returning()

  return NextResponse.json(dev)
}
