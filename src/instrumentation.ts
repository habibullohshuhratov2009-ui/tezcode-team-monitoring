export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { db } = await import("./db")
    const { sql } = await import("drizzle-orm")
    await db.execute(sql`
      ALTER TABLE team_heartbeats
      ADD COLUMN IF NOT EXISTS weekly_output_tokens integer
    `).catch(() => {})

    const { startCron } = await import("./lib/cron")
    startCron()
  }
}
