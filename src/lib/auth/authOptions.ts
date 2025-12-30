import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseDeviceInfo(userAgent: string | undefined): string {
  if (!userAgent) return 'Unknown Device';
  if (userAgent.includes('Mobile')) return 'Mobile';
  if (userAgent.includes('Chrome')) return 'Chrome Browser';
  if (userAgent.includes('Firefox')) return 'Firefox Browser';
  if (userAgent.includes('Safari')) return 'Safari Browser';
  return 'Unknown Device';
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        console.log('[Auth Debug] Starting authorization');

        if (!credentials?.email || !credentials?.password) {
          console.log('[Auth Debug] Missing email or password');
          throw new Error('Email and password required');
        }

        console.log('[Auth Debug] Looking up account for:', credentials.email);

        const account = await prisma.account.findUnique({
          where: { email: credentials.email },
        });

        if (!account) {
          console.log('[Auth Debug] No account found for email:', credentials.email);
          throw new Error('No user found with this email');
        }

        console.log('[Auth Debug] Account found, id:', account.id);
        console.log('[Auth Debug] Password hash exists:', !!account.passwordHash);
        console.log('[Auth Debug] Password hash length:', account.passwordHash?.length);

        const isValidPassword = await bcrypt.compare(
          credentials.password,
          account.passwordHash
        );

        console.log('[Auth Debug] Password comparison result:', isValidPassword);

        if (!isValidPassword) {
          console.log('[Auth Debug] Password invalid for account:', account.id);
          throw new Error('Invalid password');
        }

        console.log('[Auth Debug] Login successful for:', account.email);

        return {
          id: account.id,
          email: account.email,
          schemaName: account.schemaName,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    signOut: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.schemaName = user.schemaName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.schemaName = token.schemaName as string;
      }
      return session;
    },
    async signIn({ user }) {
      // Create a database session record for tracking
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = hashToken(sessionToken);

      await prisma.session.create({
        data: {
          sessionToken: hashedToken,
          accountId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });

      return true;
    },
  },
  events: {
    async signOut({ token }) {
      // Revoke all sessions for this user on logout
      if (token?.id) {
        await prisma.session.updateMany({
          where: {
            accountId: token.id as string,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
            revokedReason: 'user_logout',
          },
        });
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
