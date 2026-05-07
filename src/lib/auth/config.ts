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
    async signIn() {
      return true
    },

    async jwt({ token, user }) {
      if (!user) return token

      const email = user.email ?? ""
      const adminEmails = process.env.ADMIN_EMAILS!.split(",").map((e) => e.trim())

      if (adminEmails.includes(email)) {
        token.role = "admin"
        token.devId = null
        return token
      }

      // Find or auto-create developer record on first login
      let [dev] = await db
        .select()
        .from(developers)
        .where(eq(developers.email, email))
        .limit(1)

      if (!dev) {
        const [created] = await db
          .insert(developers)
          .values({ name: user.name ?? email.split("@")[0], email, status: "active" })
          .returning()
        dev = created
      }

      token.role = "developer"
      token.devId = dev?.id ?? null
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
