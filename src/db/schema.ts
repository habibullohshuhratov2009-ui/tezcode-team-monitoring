import {
  pgTable, uuid, text, bigint, integer, timestamp,
  check, index, uniqueIndex, jsonb, bigserial, inet,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const users = pgTable("users", {
  id:         uuid("id").primaryKey().defaultRandom(),
  email:      text("email").unique().notNull(),
  telegramId: bigint("telegram_id", { mode: "number" }).unique(),
  name:       text("name").notNull(),
  role:       text("role").notNull().default("viewer"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("role_check", sql`${t.role} IN ('admin','viewer')`),
  index("idx_users_telegram").on(t.telegramId),
])

export const developers = pgTable("developers", {
  id:         uuid("id").primaryKey().defaultRandom(),
  name:       text("name").notNull(),
  email:      text("email"),
  status:     text("status").notNull().default("active"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("status_check", sql`${t.status} IN ('active','paused','off-boarded')`),
  index("idx_devs_status").on(t.status),
])

export const devTokens = pgTable("dev_tokens", {
  id:         uuid("id").primaryKey().defaultRandom(),
  devId:      uuid("dev_id").notNull().references(() => developers.id, { onDelete: "cascade" }),
  tokenHash:  text("token_hash").notNull().unique(),
  label:      text("label"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt:  timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, (t) => [
  index("idx_tokens_dev").on(t.devId),
  index("idx_tokens_hash").on(t.tokenHash),
])

export const teamHeartbeats = pgTable("team_heartbeats", {
  id:           bigserial("id", { mode: "number" }).primaryKey(),
  devId:        uuid("dev_id").notNull().references(() => developers.id),
  ts:           timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  claudeUsed:   integer("claude_used"),
  claudeLimit:  integer("claude_limit"),
  claudeWindow: text("claude_window"),
  workMinutes:  integer("work_minutes"),
}, (t) => [
  index("idx_hb_dev_ts").on(t.devId, t.ts),
  index("idx_hb_ts").on(t.ts),
])

export const commitsLog = pgTable("commits_log", {
  id:        bigserial("id", { mode: "number" }).primaryKey(),
  devId:     uuid("dev_id").notNull().references(() => developers.id),
  hash:      text("hash").notNull(),
  message:   text("message").notNull(),
  branch:    text("branch"),
  repoName:  text("repo_name"),
  ts:        timestamp("ts", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_commits_dev_hash").on(t.devId, t.hash),
  index("idx_commits_dev_ts").on(t.devId, t.ts),
])

export const auditLog = pgTable("audit_log", {
  id:     bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  meta:   jsonb("meta"),
  ip:     inet("ip"),
  ts:     timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_audit_user_ts").on(t.userId, t.ts),
])
