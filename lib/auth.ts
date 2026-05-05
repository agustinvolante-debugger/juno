import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

const ALLOWED_EMAILS = [
  'agustinvolantesilva@gmail.com',
  'avolantesilva@gmail.com',
  'juanpablo.selame@gmail.com',
  'cvolantesilva@gmail.com',
  'martin.gajardo@maquinalista.com',
  'artur.magalhaes@elebbre.com.br',
  'renato.nascimento@elebbre.com.br',
]

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ user }) {
      return ALLOWED_EMAILS.includes(user.email?.toLowerCase() ?? '')
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.sub!
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
}
