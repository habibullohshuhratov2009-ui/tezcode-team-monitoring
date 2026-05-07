import "@/lib/auth/types"
import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { db } from "@/db"
import { developers } from "@/db/schema"
import { eq } from "drizzle-orm"

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      const email = user.email ?? ""
      const adminEmails = process.env.ADMIN_EMAILS!.split(",").map((e) => e.trim())

      // Admin har doim kiradi
      if (adminEmails.includes(email)) return true

      // Developer ro'yxatda bo'lsa kiradi
      const [dev] = await db
        .select()
        .from(developers)
        .where(eq(developers.email, email))
        .limit(1)

      return !!dev
    },

    async jwt({ token, user }) {
      if (!user) return token

      const email = user.email ?? ""
      const adminEmails = process.env.ADMIN_EMAILS!.split(",").map((e) => e.trim())

      if (adminEmails.includes(email)) {
        token.role = "admin"
        token.devId = null
      } else {
        const [dev] = await db
          .select()
          .from(developers)
          .where(eq(developers.email, email))
          .limit(1)

        token.role = "developer"
        token.devId = dev?.id ?? null
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? ""
        session.user.role = token.role as string
        session.user.devId = token.devId as string | null
      }
      return session
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
  },

}
