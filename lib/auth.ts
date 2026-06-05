import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

const ALLOWED_EMAILS = [
  'agustinvolantesilva@gmail.com',
  'avolantesilva@gmail.com',
  'agustin.1kh@gmail.com',
  'juanpablo.selame@gmail.com',
  'cvolantesilva@gmail.com',
  'carlosvolante@yahoo.com',
  'martin.gajardo@maquinalista.com',
  'artur.magalhaes@elebbre.com.br',
  'renato.nascimento@elebbre.com.br',
  'stephanie@pearsonlabs.ai',
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
  // Share the session cookie across tryjunoapp.com AND news.tryjunoapp.com (production only).
  // Lets a user sign in once and be authenticated on both the app and the news subdomain.
  cookies:
    process.env.NODE_ENV === 'production'
      ? {
          sessionToken: {
            name: '__Secure-next-auth.session-token',
            options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true, domain: '.tryjunoapp.com' },
          },
        }
      : undefined,
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
    // Allow post-login redirects to any *.tryjunoapp.com surface (incl. the news subdomain).
    async redirect({ url, baseUrl }) {
      try {
        const u = new URL(url, baseUrl)
        if (u.hostname === 'localhost' || u.hostname === 'tryjunoapp.com' || u.hostname.endsWith('.tryjunoapp.com')) {
          return u.toString()
        }
      } catch {}
      return baseUrl
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
}
