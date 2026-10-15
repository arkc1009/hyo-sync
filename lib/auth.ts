import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";

// Google OAuth + JWT 세션. 어댑터 테이블 없이 로그인 시 User 를 upsert 하고 토큰에 uid 를 싣는다
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name ?? undefined, image: user.image ?? undefined },
        create: { email: user.email, name: user.name, image: user.image },
      });
      return true;
    },
    async jwt({ token, user }) {
      // 최초 로그인 턴에만 user 가 온다. 그때 DB id 를 토큰에 넣어 두면 이후엔 DB 조회 없음
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } });
        if (dbUser) token.uid = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
