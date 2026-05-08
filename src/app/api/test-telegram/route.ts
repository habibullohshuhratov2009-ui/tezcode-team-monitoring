import { NextResponse } from "next/server"
import { sendTelegram } from "@/lib/telegram"

export async function GET() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID ?? process.env.ADMIN_TELEGRAM_IDS

  await sendTelegram("🧪 Test xabar Railway serveridan!")

  return NextResponse.json({
    botToken: botToken ? `${botToken.slice(0, 10)}...` : "YO'Q",
    chatId: chatId ?? "YO'Q",
  })
}
