# Chronicles - Implementation Roadmap

> **Note**: This document focuses on implementation steps (the HOW), not architectural decisions (the WHY). For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Table of Contents
1. [Implementation Overview](#implementation-overview)
2. [Phase 1: Project Foundation](#phase-1-project-foundation-week-1)
3. [Phase 2: Authentication System](#phase-2-authentication-system-week-1-2)
4. [Phase 3: Encryption Infrastructure](#phase-3-encryption-infrastructure-week-2)
5. [Phase 4: Topics System](#phase-4-topics-system-week-2)
6. [Phase 5: Split-Screen Journal UI](#phase-5-split-screen-journal-ui-week-2-3)
7. [Phase 6: Task Auto-Migration System](#phase-6-task-auto-migration-system-week-3)
8. [Phase 7: Goals Tracking System](#phase-7-goals-tracking-system-week-3-4)
9. [Phase 8: Medical Tracking System](#phase-8-medical-tracking-system-week-4---optional)
10. [Phase 9: Calendar Integration](#phase-9-calendar-integration-week-4-5)
11. [Phase 10: AI Integration](#phase-10-ai-integration-week-5-6)
12. [Phase 11: Voice Input & Entry Sharing](#phase-11-voice-input--entry-sharing-week-6)
13. [Phase 12: Polish & Security](#phase-12-polish--security-week-6-7)
14. [Testing Strategy](#testing-strategy)
15. [Success Criteria](#success-criteria)
16. [Timeline Summary](#timeline-summary)
17. [Post-MVP Enhancements](#post-mvp-enhancements)

---

## Implementation Overview

This implementation guide provides **granular, actionable subtasks** for building Chronicles from scratch. Each phase includes:

- **High-level goal**: What this phase achieves
- **Granular subtasks**: Step-by-step implementation tasks with acceptance criteria
- **Critical files**: Files to create/modify in this phase

**Recommended Approach:** Build incrementally, deploy after each phase, gather feedback.

---

## Phase 1: Project Foundation (Week 1)

**High-level Goal:** Set up development environment and multi-tenant infrastructure.

### 1.1. Initialize Next.js Project

**Task:** Create Next.js 14+ app with TypeScript and Tailwind CSS.

**Steps:**
```bash
npx create-next-app@latest chronicles --typescript --tailwind --app --eslint
cd chronicles
```

**Configuration:**
- Use App Router: ✓
- Use `src/` directory: ✓
- Import alias (@/*): ✓

**Acceptance Criteria:** `npm run dev` starts successfully on `http://localhost:3000`

---

### 1.2. Install Core Dependencies

**Task:** Install all required packages for database, auth, editor, and utilities.

**Commands:**
```bash
# Database
npm install @prisma/client prisma pg

# Authentication
npm install next-auth @auth/prisma-adapter bcryptjs
npm install --save-dev @types/bcryptjs

# Rich Text Editor
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link

# Validation & Utilities
npm install zod date-fns

# Development
npm install --save-dev prisma
```

**Acceptance Criteria:**
- All packages listed in `package.json`
- No install errors
- `npm run build` completes successfully

---

### 1.3. Configure Environment Variables

**Task:** Setup environment configuration files.

**Create `.env.local`:**
```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/chronicles?schema=public"

# NextAuth
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"

# Weather API (optional for Phase 5)
WEATHER_API_KEY="your_openweather_api_key"
```

**Create `.env.example`:**
```env
DATABASE_URL="postgresql://username:password@localhost:5432/chronicles?schema=public"
NEXTAUTH_SECRET="generate-random-secret"
NEXTAUTH_URL="http://localhost:3000"
WEATHER_API_KEY="your_api_key_here"
```

**Generate NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

**Acceptance Criteria:**
- `.env.local` exists and git-ignored
- `.env.example` committed to git
- Environment variables loaded correctly (test with `console.log(process.env.DATABASE_URL)`)

---

### 1.4. Setup PostgreSQL Database

**Task:** Create PostgreSQL database for Chronicles.

**Steps:**

**Option 1: Local PostgreSQL**
```bash
# Install PostgreSQL (macOS)
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb chronicles

# Test connection
psql chronicles
```

**Option 2: Docker**
```bash
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: chronicles
      POSTGRES_PASSWORD: chronicles
      POSTGRES_DB: chronicles
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:

# Start
docker-compose up -d
```

**Acceptance Criteria:** Can connect to database with credentials from `.env.local`

---

### 1.5. Create Multi-Schema Prisma Setup

**Task:** Define auth schema and setup Prisma.

**Create `prisma/schema.prisma`:**
```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["auth"]
}

// ============================================
// AUTH SCHEMA - Shared authentication tables
// ============================================

// Accounts table (authentication only)
model Account {
  id                              String    @id @default(cuid())
  email                           String    @unique
  passwordHash                    String    // bcrypt hash for authentication
  encryptedMasterKey              String    // Master key wrapped with KEK
  encryptedMasterKeyWithRecovery  String?   // Master key wrapped with recovery key
  salt                            String    // For KEK derivation
  recoveryKeySalt                 String?   // For recovery key derivation
  schemaName                      String    // e.g., "chronicles_x7k9m2_1"
  createdAt                       DateTime  @default(now())
  updatedAt                       DateTime  @updatedAt

  sessions                        Session[]

  @@map("accounts")
  @@schema("auth")
}

// Sessions table (database-backed sessions for immediate revocation)
model Session {
  id            String    @id @default(cuid())
  sessionToken  String    @unique @db.VarChar(64)  // SHA-256 hash of token
  accountId     String
  deviceInfo    String?   // Browser/device identifier
  ipAddress     String?   // Last known IP
  userAgent     String?
  lastActiveAt  DateTime  @default(now())
  expiresAt     DateTime  // 30 days from creation
  revokedAt     DateTime? // NULL = active, non-NULL = revoked
  revokedReason String?   // "password_change" | "admin_action" | "user_logout"
  createdAt     DateTime  @default(now())

  account       Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId])
  @@index([sessionToken])
  @@index([expiresAt])
  @@map("sessions")
  @@schema("auth")
}

// Schema counter for unique schema name generation
model SchemaCounter {
  id            Int       @id @default(1)
  currentNumber Int       @default(0)
  updatedAt     DateTime  @updatedAt

  @@map("schema_counter")
  @@schema("auth")
}
```

> **Note:** The `auth` schema contains shared authentication tables. Each user gets their own isolated schema (e.g., `chronicles_x7k9m2_1`) for their data, created dynamically at registration. User data tables (topics, entries, custom_fields) are created via raw SQL in schemaManager.ts.

**Initialize Prisma:**
```bash
npx prisma generate
npx prisma migrate dev --name init_public_users
```

**Acceptance Criteria:**
- `public.users` table exists in database
- Prisma Client generated
- Can import `@prisma/client` without errors

---

### 1.6. Build Schema Management Utilities

**Task:** Create utilities for managing user-specific schemas.

**Create `src/lib/db/schemaManager.ts`:**
```typescript
import { Pool } from 'pg';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Generate unique schema name: chronicles_<random_6_char>_<auto_increment>
 */
async function generateSchemaName(client: any): Promise<string> {
  const randomPrefix = crypto.randomBytes(3).toString('hex'); // 6 chars

  // Atomic counter increment
  const result = await client.query(`
    UPDATE auth.schema_counter
    SET "currentNumber" = "currentNumber" + 1, "updatedAt" = NOW()
    WHERE id = 1
    RETURNING "currentNumber"
  `);

  const counter = result.rows[0]?.currentNumber || 1;
  return `chronicles_${randomPrefix}_${counter}`;
}

/**
 * Create a new PostgreSQL schema for a user
 */
export async function createUserSchema(): Promise<string> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const schemaName = await generateSchemaName(client);

    // Create schema
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // Create topics table (encrypted names with SSE tokens)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."topics" (
        id TEXT PRIMARY KEY,
        "encryptedName" TEXT NOT NULL,
        iv TEXT NOT NULL,
        "nameToken" TEXT UNIQUE NOT NULL,
        color TEXT NOT NULL DEFAULT '#6366f1',
        icon TEXT
      );
    `);

    // Create entries table (core content with customType)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."entries" (
        id TEXT PRIMARY KEY,
        "topicId" TEXT REFERENCES "${schemaName}"."topics"(id),
        "encryptedContent" TEXT NOT NULL,
        iv TEXT NOT NULL,
        "searchTokens" TEXT[] DEFAULT '{}',
        "customType" TEXT,
        "entryDate" DATE NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create custom_fields table (WordPress-style metadata)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."custom_fields" (
        id TEXT PRIMARY KEY,
        "entryId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
        "encryptedData" TEXT NOT NULL,
        iv TEXT NOT NULL
      );
    `);

    // Create entry_relationships table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."entry_relationships" (
        id TEXT PRIMARY KEY,
        "entryId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
        "relatedToId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
        "relationshipType" TEXT NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create user_settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."user_settings" (
        id TEXT PRIMARY KEY,
        "medicalTopicsEnabled" BOOLEAN NOT NULL DEFAULT false,
        "goalsTrackingEnabled" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create shared_entries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."shared_entries" (
        id TEXT PRIMARY KEY,
        "entryId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
        "shareToken" TEXT UNIQUE NOT NULL,
        "expiresAt" TIMESTAMP,
        "viewCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Add indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entries_date ON "${schemaName}"."entries"("entryDate");
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entries_topic ON "${schemaName}"."entries"("topicId");
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entries_custom_type ON "${schemaName}"."entries"("customType");
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entries_date_type ON "${schemaName}"."entries"("entryDate", "customType");
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entries_search_tokens ON "${schemaName}"."entries" USING GIN("searchTokens");
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_custom_fields_entry ON "${schemaName}"."custom_fields"("entryId");
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_token ON "${schemaName}"."shared_entries"("shareToken");
    `);

    await client.query('COMMIT');
    return schemaName;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Seed default topics for a new user
 * Note: Topic names must be encrypted client-side before calling this
 * This seeds with pre-encrypted default topics
 */
export async function seedDefaultTopics(
  schemaName: string,
  encryptedTopics: Array<{
    id: string;
    encryptedName: string;
    iv: string;
    nameToken: string;
    color: string;
    icon: string;
  }>
): Promise<void> {
  const client = await pool.connect();

  try {
    for (const topic of encryptedTopics) {
      await client.query(`
        INSERT INTO "${schemaName}"."topics" (id, "encryptedName", iv, "nameToken", color, icon)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT ("nameToken") DO NOTHING
      `, [topic.id, topic.encryptedName, topic.iv, topic.nameToken, topic.color, topic.icon]);
    }

    // Create default user settings
    await client.query(`
      INSERT INTO "${schemaName}"."user_settings" (id, "medicalTopicsEnabled", "goalsTrackingEnabled", "createdAt", "updatedAt")
      VALUES ('settings_default', false, true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
  } finally {
    client.release();
  }
}

/**
 * Delete a user schema (for account deletion)
 */
export async function deleteUserSchema(schemaName: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    client.release();
  }
}
```

**Acceptance Criteria:**
- Can call `createUserSchema()` successfully
- Schema name generated with random prefix + counter
- User schema created with all tables: topics, entries, custom_fields, entry_relationships, user_settings, shared_entries
- All indexes created for performance
- Can call `seedDefaultTopics(schemaName, encryptedTopics)` with client-encrypted topic data

---

### 1.7. Setup Prisma Client Singleton

**Task:** Create Prisma client with singleton pattern for development.

**Create `src/lib/db/prisma.ts`:**
```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Get Prisma client for a specific user schema
 * Note: For querying user-specific tables, we'll use raw queries with schema name
 */
export function getUserSchemaName(userId: string): string {
  return `user_${userId}`;
}
```

**Acceptance Criteria:**
- Can import `prisma` from `@/lib/db/prisma`
- Singleton pattern prevents multiple instances in development
- Can query `public.users` table

---

### Phase 1 Summary

**Critical Files Created:**
- ✅ `package.json` - Project dependencies
- ✅ `prisma/schema.prisma` - Auth schema (accounts, sessions, schema_counter)
- ✅ `src/lib/db/schemaManager.ts` - User schema creation with all tables
- ✅ `src/lib/db/prisma.ts` - Prisma client singleton
- ✅ `.env.local` - Environment configuration
- ✅ `next.config.js` - Next.js configuration
- ✅ `tailwind.config.ts` - Tailwind CSS configuration

**User Schema Tables Created:**
- `topics` - encryptedName, iv, nameToken, color, icon
- `entries` - topicId, encryptedContent, iv, searchTokens, customType, entryDate
- `custom_fields` - entryId, encryptedData, iv
- `entry_relationships` - entryId, relatedToId, relationshipType
- `user_settings` - medicalTopicsEnabled, goalsTrackingEnabled
- `shared_entries` - entryId, shareToken, expiresAt, viewCount

**Acceptance Test:**
```typescript
// Test script to verify Phase 1
import { createUserSchema } from '@/lib/db/schemaManager';

const schemaName = await createUserSchema();
console.log(`Created schema: ${schemaName}`);
// e.g., "chronicles_a1b2c3_1"

// Verify tables exist (use psql)
// \dt chronicles_a1b2c3_1.*
```

---

## Phase 2: Authentication System (Week 1-2)

**High-level Goal:** Implement secure user registration and login with NextAuth.js.

### 2.1. Configure NextAuth.js

**Task:** Setup NextAuth with credentials provider.

**Create `src/lib/auth/authOptions.ts`:**
```typescript
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Helper to hash session token
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Helper to parse device info from User-Agent
function parseDeviceInfo(userAgent: string): string {
  if (userAgent.includes('Mobile')) return 'Mobile';
  if (userAgent.includes('Chrome')) return 'Chrome Browser';
  if (userAgent.includes('Firefox')) return 'Firefox Browser';
  if (userAgent.includes('Safari')) return 'Safari Browser';
  return 'Unknown Device';
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password required');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error('No user found with this email');
        }

        const isValidPassword = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isValidPassword) {
          throw new Error('Invalid password');
        }

        return {
          id: user.id,
          email: user.email,
          schemaName: user.schemaName,
        };
      },
    }),
  ],
  session: {
    strategy: 'database',  // Database sessions for immediate revocation
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    signOut: '/login',
    error: '/login',
  },
  callbacks: {
    async session({ session, user }) {
      // With database sessions, user comes from DB not token
      if (session.user) {
        session.user.id = user.id;
        session.user.schemaName = user.schemaName;
      }
      return session;
    },
  },
  events: {
    async signOut({ session }) {
      // Mark session as revoked in database on logout
      if (session?.sessionToken) {
        await prisma.session.update({
          where: { sessionToken: hashToken(session.sessionToken) },
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
```

> **Note:** Database sessions enable immediate session revocation. Every request validates the session against the database, checking `revokedAt IS NULL`. This adds ~1 DB query per request but provides instant logout and security event handling.

**Create types for NextAuth:**

**`src/types/next-auth.d.ts`:**
```typescript
import 'next-auth';

declare module 'next-auth' {
  interface User {
    id: string;
    email: string;
    schemaName: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      schemaName: string;
    };
    sessionToken?: string;  // Available for revocation
  }
}
```

> **Note:** With database sessions, JWT types are not needed. The session is fetched from the database on each request.

**Acceptance Criteria:**
- NextAuth configuration complete
- TypeScript types extended correctly
- Can import `authOptions` without errors

---

### 2.2. Create NextAuth API Route

**Task:** Setup NextAuth API route handlers.

**Create `src/app/api/auth/[...nextauth]/route.ts`:**
```typescript
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

**Acceptance Criteria:**
- `/api/auth/signin` endpoint accessible
- `/api/auth/signout` endpoint accessible
- NextAuth debug page works at `/api/auth/signin`

---

### 2.3. Build Registration API Endpoint

**Task:** Create user registration with schema creation.

**Create `src/app/api/user/register/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { createUserSchema, seedDefaultTopics } from '@/lib/db/schemaManager';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import crypto from 'crypto';

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validatedData = registerSchema.parse(body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(validatedData.password, 10);

    // Generate random salt for encryption (32 bytes)
    const salt = crypto.randomBytes(32).toString('base64');

    // Create user in public.users
    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        passwordHash,
        salt,
        schemaName: '', // Will be updated after schema creation
      },
    });

    // Create user-specific schema
    const schemaName = await createUserSchema(user.id);

    // Update user with schemaName
    await prisma.user.update({
      where: { id: user.id },
      data: { schemaName },
    });

    // Seed default topics
    await seedDefaultTopics(schemaName);

    return NextResponse.json(
      {
        message: 'User created successfully',
        userId: user.id,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'An error occurred during registration' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- Can POST to `/api/user/register` with email and password
- User created in `public.users`
- User schema created (`user_<userId>`)
- Default topics seeded
- Returns 201 on success
- Returns 400 on validation error
- Returns 400 if email already exists

---

### 2.4. Build Salt Retrieval Endpoint

**Task:** Create endpoint to retrieve user's salt for key derivation.

**Create `src/app/api/user/salt/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const saltRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = saltRequestSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { salt: true },
    });

    if (!user) {
      // Return generic error to prevent email enumeration
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    return NextResponse.json({ salt: user.salt });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Salt retrieval error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- Can POST to `/api/user/salt` with email
- Returns user's salt if email exists
- Returns 401 if email not found (prevents enumeration)
- Returns 400 on validation error

---

### 2.5. Build Session Management API Endpoints

**Task:** Create API endpoints for session management (list, revoke).

**Create `src/lib/auth/validateSession.ts`:**
```typescript
import { prisma } from '@/lib/db/prisma';
import crypto from 'crypto';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function validateSession(sessionToken: string) {
  const hashedToken = hashToken(sessionToken);

  const session = await prisma.session.findUnique({
    where: { sessionToken: hashedToken },
    include: { account: true },
  });

  if (!session) return null;
  if (session.revokedAt) return null;  // Session was revoked
  if (session.expiresAt < new Date()) return null;  // Session expired

  // Update last active timestamp
  await prisma.session.update({
    where: { id: session.id },
    data: { lastActiveAt: new Date() },
  });

  return session;
}
```

**Create `src/app/api/sessions/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

// GET /api/sessions - List all active sessions for current user
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessions = await prisma.session.findMany({
    where: {
      accountId: session.user.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      deviceInfo: true,
      ipAddress: true,
      lastActiveAt: true,
      createdAt: true,
    },
    orderBy: { lastActiveAt: 'desc' },
  });

  // Mark current session
  const currentSessionId = session.sessionToken;
  const enrichedSessions = sessions.map((s) => ({
    ...s,
    isCurrent: s.id === currentSessionId,
  }));

  return NextResponse.json({ sessions: enrichedSessions });
}
```

**Create `src/app/api/sessions/[id]/revoke/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

// POST /api/sessions/[id]/revoke - Revoke a specific session
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify the session belongs to this user
  const targetSession = await prisma.session.findFirst({
    where: {
      id: params.id,
      accountId: session.user.id,
    },
  });

  if (!targetSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  await prisma.session.update({
    where: { id: params.id },
    data: {
      revokedAt: new Date(),
      revokedReason: 'user_revoked',
    },
  });

  return NextResponse.json({ success: true, message: 'Session revoked' });
}
```

**Create `src/app/api/sessions/revoke-all/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

// POST /api/sessions/revoke-all - Revoke all sessions except current
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await prisma.session.updateMany({
    where: {
      accountId: session.user.id,
      id: { not: session.sessionToken }, // Keep current session
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: 'user_revoked_all',
    },
  });

  return NextResponse.json({
    success: true,
    revokedCount: result.count,
    message: `${result.count} session(s) revoked`,
  });
}
```

**Acceptance Criteria:**
- `GET /api/sessions` returns list of active sessions
- `POST /api/sessions/[id]/revoke` revokes specific session
- `POST /api/sessions/revoke-all` revokes all except current
- Revoked sessions cannot be used for authentication

---

### 2.6. Build Password Change Endpoint

**Task:** Create password change API that revokes all other sessions.

**Create `src/app/api/user/change-password/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number'),
  newEncryptedMasterKey: z.string().min(1, 'Encrypted master key required'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = changePasswordSchema.parse(body);

    // Fetch current account
    const account = await prisma.account.findUnique({
      where: { id: session.user.id },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(
      validatedData.currentPassword,
      account.passwordHash
    );

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(validatedData.newPassword, 10);

    // Update account with new password and re-encrypted master key
    await prisma.account.update({
      where: { id: session.user.id },
      data: {
        passwordHash: newPasswordHash,
        encryptedMasterKey: validatedData.newEncryptedMasterKey,
      },
    });

    // SECURITY: Revoke ALL other sessions (immediate logout everywhere)
    const currentSessionToken = session.sessionToken;
    await prisma.session.updateMany({
      where: {
        accountId: session.user.id,
        sessionToken: { not: currentSessionToken },
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: 'password_change',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Password changed. All other sessions have been logged out.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Password change error:', error);
    return NextResponse.json(
      { error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
```

> **Security Note:** On password change, all sessions except the current one are immediately revoked. The client must re-encrypt the master key with the new password-derived KEK and send the new `encryptedMasterKey` in the request.

**Acceptance Criteria:**
- Password change requires current password verification
- New password must meet strength requirements
- Client re-encrypts master key with new password before sending
- All other sessions are revoked immediately on password change
- Current session remains valid

---

### 2.7. Create Registration Page

**Task:** Build registration UI with password warning.

**Create `src/app/(auth)/register/page.tsx`:**
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedWarning, setAcceptedWarning] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!acceptedWarning) {
      setError('You must accept the password recovery warning');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      // Redirect to login
      router.push('/login?registered=true');
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div>
          <h2 className="text-3xl font-bold text-center">Create Account</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Chronicles - Encrypted Journal
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password (min 12 characters)
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* PASSWORD WARNING */}
          <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-bold text-red-800">CRITICAL WARNING</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p className="font-bold">There is NO PASSWORD RECOVERY.</p>
                  <p className="mt-1">
                    If you forget your password, all your data will be PERMANENTLY LOST.
                    No one can recover it, not even our support team.
                  </p>
                  <p className="mt-2">
                    Please write down your password and store it securely.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={acceptedWarning}
                  onChange={(e) => setAcceptedWarning(e.target.checked)}
                  className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-red-900 font-medium">
                  I understand and accept this risk
                </span>
              </label>
            </div>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !acceptedWarning}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

          <div className="text-center">
            <Link href="/login" className="text-sm text-indigo-600 hover:text-indigo-500">
              Already have an account? Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- Registration form renders correctly
- Password warning displayed prominently in red
- Checkbox must be checked to enable submit
- Form validates passwords match
- Redirects to login on success
- Shows error messages on failure

---

### 2.6. Create Login Page

**Task:** Build login UI.

**Create `src/app/(auth)/login/page.tsx`:**
```typescript
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get('registered');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
        return;
      }

      router.push('/');
      router.refresh();
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div>
          <h2 className="text-3xl font-bold text-center">Sign In</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Chronicles - Encrypted Journal
          </p>
        </div>

        {registered && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            Account created successfully! You can now sign in.
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>

          <div className="text-center">
            <Link href="/register" className="text-sm text-indigo-600 hover:text-indigo-500">
              Don't have an account? Create one
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Create auth layout:**

**`src/app/(auth)/layout.tsx`:**
```typescript
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

**Acceptance Criteria:**
- Login form renders correctly
- Can sign in with valid credentials
- Shows error on invalid credentials
- Redirects to dashboard on success
- Shows success message if coming from registration

---

### 2.7. Setup Route Protection Middleware

**Task:** Protect dashboard routes from unauthenticated access.

**Create `src/middleware.ts`:**
```typescript
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    '/((?!api/auth|api/user/register|api/user/salt|login|register|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

**Acceptance Criteria:**
- Unauthenticated users redirected to `/login`
- Authenticated users can access dashboard
- `/login` and `/register` accessible without auth
- API routes for auth and registration accessible

---

### Phase 2 Summary

**Critical Files Created:**
- ✅ `src/lib/auth/authOptions.ts` - NextAuth configuration (database sessions)
- ✅ `src/lib/auth/validateSession.ts` - Session validation utility
- ✅ `src/app/api/auth/[...nextauth]/route.ts` - Auth API handlers
- ✅ `src/app/api/user/register/route.ts` - Registration endpoint
- ✅ `src/app/api/user/salt/route.ts` - Salt retrieval endpoint
- ✅ `src/app/api/user/change-password/route.ts` - Password change with session revocation
- ✅ `src/app/api/sessions/route.ts` - List active sessions
- ✅ `src/app/api/sessions/[id]/revoke/route.ts` - Revoke specific session
- ✅ `src/app/api/sessions/revoke-all/route.ts` - Revoke all sessions
- ✅ `src/app/(auth)/register/page.tsx` - Registration UI
- ✅ `src/app/(auth)/login/page.tsx` - Login UI
- ✅ `src/middleware.ts` - Route protection
- ✅ `src/types/next-auth.d.ts` - NextAuth type extensions

**Acceptance Test:**
```
1. Navigate to /register
2. Create account with email/password
3. Verify schema created in database
4. Navigate to /login
5. Sign in with credentials
6. Verify redirect to dashboard (/)
7. Try accessing dashboard without auth → redirected to /login
8. View active sessions at /settings/security
9. Revoke a session from another device → that device is logged out immediately
10. Change password → all other sessions are revoked immediately
```

---

## Phase 3: Encryption Infrastructure (Week 2)

**High-level Goal:** Build client-side encryption system with Web Crypto API.

### 3.1. Implement Key Derivation

**Task:** Create PBKDF2 key derivation function.

**Create `src/lib/crypto/keyDerivation.ts`:**
```typescript
/**
 * Derive an encryption key from a password and salt using PBKDF2
 */
export async function deriveKey(
  password: string,
  salt: string
): Promise<CryptoKey> {
  // Convert password to buffer
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // Import password as key material
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Convert salt from base64
  const saltBuffer = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));

  // Derive key using PBKDF2
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000, // 100k iterations for security
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256, // 256-bit key
    },
    false, // Not extractable (security)
    ['encrypt', 'decrypt']
  );

  return key;
}

/**
 * Generate a random salt for encryption (32 bytes)
 */
export function generateSalt(): string {
  const salt = window.crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...salt));
}
```

**Acceptance Criteria:**
- `deriveKey(password, salt)` returns consistent CryptoKey
- Same password + salt = same key (deterministic)
- Different passwords = different keys
- `generateSalt()` returns random 32-byte base64 string

---

### 3.2. Implement Encryption/Decryption

**Task:** Create AES-GCM encryption and decryption functions.

**Create `src/lib/crypto/encryption.ts`:**
```typescript
/**
 * Encrypt plaintext using AES-GCM
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  // Convert plaintext to buffer
  const encoder = new TextEncoder();
  const plaintextBuffer = encoder.encode(plaintext);

  // Generate random IV (12 bytes for AES-GCM)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128, // 128-bit authentication tag
    },
    key,
    plaintextBuffer
  );

  // Convert to base64 for storage
  const ciphertext = btoa(
    String.fromCharCode(...new Uint8Array(ciphertextBuffer))
  );
  const ivBase64 = btoa(String.fromCharCode(...iv));

  return {
    ciphertext,
    iv: ivBase64,
  };
}

/**
 * Decrypt ciphertext using AES-GCM
 */
export async function decrypt(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  // Convert from base64
  const ciphertextBuffer = Uint8Array.from(atob(ciphertext), (c) =>
    c.charCodeAt(0)
  );
  const ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

  // Decrypt
  const plaintextBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer,
      tagLength: 128,
    },
    key,
    ciphertextBuffer
  );

  // Convert to string
  const decoder = new TextDecoder();
  const plaintext = decoder.decode(plaintextBuffer);

  return plaintext;
}
```

**Acceptance Criteria:**
- `encrypt(text, key)` returns `{ciphertext, iv}`
- `decrypt(ciphertext, iv, key)` returns original text
- Roundtrip: `decrypt(encrypt(text))` = `text`
- Different IV each time (random)

---

### 3.3. Create Encryption React Hook

**Task:** Build React hook for encryption state management.

**Create `src/lib/hooks/useEncryption.ts`:**
```typescript
'use client';

import { create} from 'zustand';
import { deriveKey } from '@/lib/crypto/keyDerivation';
import { encrypt, decrypt } from '@/lib/crypto/encryption';

interface EncryptionStore {
  encryptionKey: CryptoKey | null;
  isKeyReady: boolean;
  deriveAndStoreKey: (password: string, salt: string) => Promise<void>;
  encryptData: (data: string) => Promise<{ ciphertext: string; iv: string }>;
  decryptData: (ciphertext: string, iv: string) => Promise<string>;
  clearKey: () => void;
}

export const useEncryption = create<EncryptionStore>((set, get) => ({
  encryptionKey: null,
  isKeyReady: false,

  deriveAndStoreKey: async (password: string, salt: string) => {
    try {
      const key = await deriveKey(password, salt);
      set({ encryptionKey: key, isKeyReady: true });
    } catch (error) {
      console.error('Key derivation failed:', error);
      throw new Error('Failed to derive encryption key');
    }
  },

  encryptData: async (data: string) => {
    const { encryptionKey } = get();
    if (!encryptionKey) {
      throw new Error('Encryption key not available');
    }
    return await encrypt(data, encryptionKey);
  },

  decryptData: async (ciphertext: string, iv: string) => {
    const { encryptionKey } = get();
    if (!encryptionKey) {
      throw new Error('Encryption key not available');
    }
    return await decrypt(ciphertext, iv, encryptionKey);
  },

  clearKey: () => {
    set({ encryptionKey: null, isKeyReady: false });
  },
}));
```

**Install Zustand:**
```bash
npm install zustand
```

**Acceptance Criteria:**
- Hook stores key in memory only
- `deriveAndStoreKey` sets encryption key
- `encryptData` and `decryptData` work when key ready
- `clearKey` removes key from memory
- Throws error if key not available

---

### 3.4. Create Encryption Context Provider

**Task:** Wrap app with encryption provider for login flow.

**Create `src/components/providers/EncryptionProvider.tsx`:**
```typescript
'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useRouter } from 'next/navigation';

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const { isKeyReady, clearKey } = useEncryption();
  const router = useRouter();

  useEffect(() => {
    // Clear key on logout
    if (status === 'unauthenticated') {
      clearKey();
    }
  }, [status, clearKey]);

  useEffect(() => {
    // If session exists but no key, show password prompt
    if (session && !isKeyReady && typeof window !== 'undefined') {
      // Check if we have a key in session storage (temporary during login flow)
      const hasRecentLogin = sessionStorage.getItem('recent_login');

      if (!hasRecentLogin) {
        // Show password re-entry modal
        router.push('/?reauth=true');
      }
    }
  }, [session, isKeyReady, router]);

  return <>{children}</>;
}
```

**Update root layout:**

**`src/app/layout.tsx`:**
```typescript
import { Inter } from 'next/font/google';
import './globals.css';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { EncryptionProvider } from '@/components/providers/EncryptionProvider';
import SessionProvider from '@/components/providers/SessionProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Chronicles - Encrypted Journal',
  description: 'Privacy-first encrypted journaling',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body className={inter.className}>
        <SessionProvider session={session}>
          <EncryptionProvider>{children}</EncryptionProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
```

**Create SessionProvider:**

**`src/components/providers/SessionProvider.tsx`:**
```typescript
'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

export default function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: any;
}) {
  return (
    <NextAuthSessionProvider session={session}>
      {children}
    </NextAuthSessionProvider>
  );
}
```

**Acceptance Criteria:**
- Session provider wraps app
- Encryption provider clears key on logout
- Key state persists during session
- Provider triggers re-auth flow if key missing

---

### 3.5. Build Password Re-entry Modal

**Task:** Create modal for password re-entry on page refresh.

**Create `src/components/auth/PasswordReentryModal.tsx`:**
```typescript
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useRouter, useSearchParams } from 'next/navigation';

export function PasswordReentryModal() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { deriveAndStoreKey, isKeyReady } = useEncryption();

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const needsReauth = searchParams.get('reauth') === 'true' && !isKeyReady;

  if (!needsReauth || !session) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Fetch user's salt
      const saltResponse = await fetch('/api/user/salt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: session.user.email }),
      });

      if (!saltResponse.ok) {
        throw new Error('Failed to retrieve salt');
      }

      const { salt } = await saltResponse.json();

      // Derive encryption key
      await deriveAndStoreKey(password, salt);

      // Clear password from memory
      setPassword('');

      // Mark as recent login
      sessionStorage.setItem('recent_login', 'true');

      // Remove reauth param
      router.replace('/');
    } catch (err) {
      setError('Invalid password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Re-enter Password</h2>
        <p className="text-gray-600 mb-4">
          Your encryption key was lost when the page refreshed. Please re-enter your password to decrypt your entries.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              autoFocus
            />
          </div>

          {error && (
            <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Unlocking...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Add to dashboard layout:**

**Update `src/app/(dashboard)/layout.tsx`:**
```typescript
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PasswordReentryModal />
      {children}
    </>
  );
}
```

**Acceptance Criteria:**
- Modal shows when `?reauth=true` and no key
- Can re-enter password to derive key
- Modal closes after successful key derivation
- Shows error on wrong password
- Password cleared from memory after use

---

### Phase 3 Summary

**Critical Files Created:**
- ✅ `src/lib/crypto/keyDerivation.ts` - PBKDF2 key derivation
- ✅ `src/lib/crypto/encryption.ts` - AES-GCM encrypt/decrypt
- ✅ `src/lib/hooks/useEncryption.ts` - Encryption state hook
- ✅ `src/components/providers/EncryptionProvider.tsx` - Encryption context
- ✅ `src/components/providers/SessionProvider.tsx` - Session wrapper
- ✅ `src/components/auth/PasswordReentryModal.tsx` - Reauth modal

**Acceptance Test:**
```
1. Register and login
2. Derive key on login
3. Encrypt test string
4. Decrypt encrypted string
5. Refresh page
6. Modal appears
7. Re-enter password
8. Key re-derived
9. Can decrypt data again
```

---

## Phase 4: Topics System (Week 2)

**High-level Goal:** Implement encrypted topics with SSE lookup tokens for server-side search.

> **Architecture Note:** Topics use encrypted names with HMAC tokens (nameToken) for server-side lookup. The server never sees plaintext topic names.

### 4.1. Topics Data Model

**Topics** are stored with:
- `encryptedName` - AES-GCM encrypted topic name
- `iv` - Initialization vector for the encryption
- `nameToken` - HMAC-SHA256 hash for server-side lookup
- `color` - Hex color (plaintext, not sensitive)
- `icon` - Icon identifier (plaintext, not sensitive)

**Client-side operations:**
1. Generate HMAC token: `HMAC-SHA256(masterKey, "topic name")`
2. Encrypt topic name: `AES-GCM(masterKey, "topic name")`
3. Send both to server for storage

**Server-side lookup:**
1. Client sends HMAC token for search
2. Server matches against `nameToken` column
3. Server returns encrypted data
4. Client decrypts for display

---

### 4.2. Build Topics API Endpoints

**Task:** Create CRUD endpoints for topics with encrypted names.

**Create `src/app/api/topics/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createTopicSchema = z.object({
  encryptedName: z.string(),
  iv: z.string(),
  nameToken: z.string(),
  color: z.string().default('#6366f1'),
  icon: z.string().optional(),
});

// GET /api/topics - List all topics
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM "${session.user.schemaName}"."topics"
      ORDER BY "encryptedName"
    `);

    return NextResponse.json({ topics: result.rows });
  } finally {
    client.release();
  }
}

// POST /api/topics - Create new topic
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = createTopicSchema.parse(body);

    const client = await pool.connect();
    try {
      const topicId = `topic_${Date.now()}`;

      const result = await client.query(
        `INSERT INTO "${session.user.schemaName}"."topics"
        (id, "encryptedName", iv, "nameToken", color, icon)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          topicId,
          validatedData.encryptedName,
          validatedData.iv,
          validatedData.nameToken,
          validatedData.color,
          validatedData.icon || null,
        ]
      );

      return NextResponse.json({ topic: result.rows[0] }, { status: 201 });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Create `src/app/api/topics/[id]/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/topics/[id] - Get single topic
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM "${session.user.schemaName}"."topics" WHERE id = $1`,
      [params.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    return NextResponse.json({ topic: result.rows[0] });
  } finally {
    client.release();
  }
}

// PUT /api/topics/[id] - Update topic
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE "${session.user.schemaName}"."topics"
      SET "encryptedName" = COALESCE($1, "encryptedName"),
          iv = COALESCE($2, iv),
          "nameToken" = COALESCE($3, "nameToken"),
          color = COALESCE($4, color),
          icon = COALESCE($5, icon)
      WHERE id = $6
      RETURNING *`,
      [
        body.encryptedName,
        body.iv,
        body.nameToken,
        body.color,
        body.icon,
        params.id,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    return NextResponse.json({ topic: result.rows[0] });
  } finally {
    client.release();
  }
}

// DELETE /api/topics/[id] - Delete topic
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();

  try {
    // Check if topic has entries
    const entriesCheck = await client.query(
      `SELECT COUNT(*) FROM "${session.user.schemaName}"."entries" WHERE "topicId" = $1`,
      [params.id]
    );

    if (parseInt(entriesCheck.rows[0].count) > 0) {
      return NextResponse.json(
        { error: 'Cannot delete topic with entries. Move or delete entries first.' },
        { status: 400 }
      );
    }

    const result = await client.query(
      `DELETE FROM "${session.user.schemaName}"."topics" WHERE id = $1 RETURNING id`,
      [params.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Topic deleted successfully' });
  } finally {
    client.release();
  }
}
```

**Create `src/app/api/topics/lookup/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// POST /api/topics/lookup - Find topic by nameToken
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { nameToken } = await request.json();
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT * FROM "${session.user.schemaName}"."topics" WHERE "nameToken" = $1`,
      [nameToken]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ topic: null });
    }

    return NextResponse.json({ topic: result.rows[0] });
  } finally {
    client.release();
  }
}
```

**Acceptance Criteria:**
- Can GET all topics (encrypted names returned)
- Can POST new topic with encryptedName, iv, nameToken
- Can PUT update topic (re-encrypted name + new nameToken)
- Can DELETE topic (only if no entries attached)
- Can lookup topic by nameToken for SSE search

---

### 4.3. Create Topic HMAC Token Generation

**Task:** Create client-side utilities for topic token generation.

**Create `src/lib/crypto/topicTokens.ts`:**
```typescript
/**
 * Generate HMAC-SHA256 token for topic name lookup
 */
export async function generateTopicToken(
  topicName: string,
  key: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(topicName.toLowerCase().trim());

  // Import key for HMAC
  const hmacKey = await window.crypto.subtle.importKey(
    'raw',
    await window.crypto.subtle.exportKey('raw', key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await window.crypto.subtle.sign('HMAC', hmacKey, data);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
```

**Acceptance Criteria:**
- Same topic name + same key = same token (deterministic)
- Different topic names = different tokens
- Tokens are one-way (cannot reverse to get topic name)

---

### 4.4. Build Topics Sidebar Component

**Task:** Create sidebar UI for topic selection with decryption.

**Create `src/components/topics/TopicsSidebar.tsx`:**
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';

interface Topic {
  id: string;
  encryptedName: string;
  iv: string;
  nameToken: string;
  color: string;
  icon: string | null;
}

interface Props {
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string | null) => void;
}

export function TopicsSidebar({ selectedTopicId, onSelectTopic }: Props) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [decryptedNames, setDecryptedNames] = useState<Map<string, string>>(new Map());
  const { decryptData, isKeyReady } = useEncryption();

  useEffect(() => {
    fetchTopics();
  }, []);

  useEffect(() => {
    if (isKeyReady && topics.length > 0) {
      decryptTopicNames();
    }
  }, [topics, isKeyReady]);

  const fetchTopics = async () => {
    const response = await fetch('/api/topics');
    const data = await response.json();
    setTopics(data.topics);
  };

  const decryptTopicNames = async () => {
    const names = new Map<string, string>();
    for (const topic of topics) {
      try {
        const name = await decryptData(topic.encryptedName, topic.iv);
        names.set(topic.id, name);
      } catch (error) {
        names.set(topic.id, 'Decryption failed');
      }
    }
    setDecryptedNames(names);
  };

  return (
    <div className="w-64 bg-gray-50 border-r h-full p-4">
      <h2 className="text-lg font-semibold mb-4">Topics</h2>

      {/* All entries option */}
      <button
        onClick={() => onSelectTopic(null)}
        className={`w-full text-left px-3 py-2 rounded mb-2 ${
          selectedTopicId === null ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100'
        }`}
      >
        All Entries
      </button>

      {/* Topic list */}
      <div className="space-y-1">
        {topics.map((topic) => (
          <button
            key={topic.id}
            onClick={() => onSelectTopic(topic.id)}
            className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 ${
              selectedTopicId === topic.id ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100'
            }`}
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: topic.color }}
            />
            <span>{decryptedNames.get(topic.id) || 'Decrypting...'}</span>
          </button>
        ))}
      </div>

      {/* Add topic button */}
      <button className="w-full mt-4 text-sm text-indigo-600 hover:text-indigo-800">
        + Add Topic
      </button>
    </div>
  );
}
```

**Acceptance Criteria:**
- Topics list from API
- Topic names decrypted client-side
- Can select topic to filter entries
- Topic color displayed
- Can add new topic

---

### 4.5. Create Add Topic Modal

**Task:** Create modal for adding new topics with encryption.

**Create `src/components/topics/AddTopicModal.tsx`:**
```typescript
'use client';

import { useState } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { generateTopicToken } from '@/lib/crypto/topicTokens';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onTopicAdded: () => void;
}

const COLORS = [
  '#6366f1', '#ec4899', '#10b981', '#f59e0b',
  '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4',
];

export function AddTopicModal({ isOpen, onClose, onTopicAdded }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { encryptData, isKeyReady } = useEncryption();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !isKeyReady) return;

    setLoading(true);
    setError('');

    try {
      // Get the raw key for HMAC
      const { encryptionKey } = useEncryption.getState();

      // Encrypt topic name
      const { ciphertext: encryptedName, iv } = await encryptData(name);

      // Generate nameToken for SSE lookup
      const nameToken = await generateTopicToken(name, encryptionKey!);

      // Create topic
      const response = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedName,
          iv,
          nameToken,
          color,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create topic');
      }

      setName('');
      onTopicAdded();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Add New Topic</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Topic Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g., Work, Personal, Health"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full ${
                    color === c ? 'ring-2 ring-offset-2 ring-indigo-500' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 text-sm text-red-600">{error}</div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
            >
              {loading ? 'Creating...' : 'Create Topic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- Can enter topic name
- Can select color
- Topic name encrypted before sending to server
- nameToken (HMAC) generated for SSE lookup
- Topic appears in sidebar after creation

---

### Phase 4 Summary

**Critical Files Created:**
- ✅ `src/app/api/topics/route.ts` - Topics CRUD
- ✅ `src/app/api/topics/[id]/route.ts` - Single topic operations
- ✅ `src/app/api/topics/lookup/route.ts` - SSE token lookup
- ✅ `src/lib/crypto/topicTokens.ts` - HMAC token generation
- ✅ `src/components/topics/TopicsSidebar.tsx` - Topics list UI
- ✅ `src/components/topics/AddTopicModal.tsx` - Create topic UI

**Acceptance Test:**
```
1. Create new topic "Work"
2. Verify encrypted in database (encryptedName not readable)
3. Verify nameToken stored for lookup
4. Topic appears in sidebar (decrypted client-side)
5. Create another topic "Personal"
6. Search by nameToken returns correct topic
7. Can update topic name (new encryption + new token)
8. Cannot delete topic with entries
```

---

## Phase 5: Split-Screen Journal UI (Week 2-3)

**High-level Goal:** Build the main journal interface with quick and expanded entry modes.

> **Architecture Note:** Entries use `encryptedContent` for the journal text, `customType` for entry type routing (null for regular entries, 'task' for tasks, etc.), and `custom_fields` for type-specific metadata.

### 5.1. Entries Data Model

**Regular Journal Entries:**
- `customType = null`
- `encryptedContent` = journal text
- `searchTokens` = HMAC tokens for SSE search
- No custom_fields needed

**Task Entries:**
- `customType = 'task'`
- `encryptedContent` = task description
- Custom fields:
  - `{ fieldKey: 'isCompleted', value: false }`
  - `{ fieldKey: 'isAutoMigrating', value: true }`

---

### 5.2. Build Entries API Endpoints

**Task:** Create CRUD endpoints for entries with custom_fields.

**Create `src/app/api/entries/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createEntrySchema = z.object({
  topicId: z.string().optional(),
  encryptedContent: z.string(),
  iv: z.string(),
  searchTokens: z.array(z.string()).optional(),
  customType: z.string().nullable().optional(),
  entryDate: z.string(),
  customFields: z.array(z.object({
    encryptedData: z.string(),
    iv: z.string(),
  })).optional(),
});

// GET /api/entries - List entries with filters
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const topicId = searchParams.get('topicId');
  const date = searchParams.get('date');
  const customType = searchParams.get('customType');
  const searchToken = searchParams.get('searchToken');

  const client = await pool.connect();
  try {
    let query = `
      SELECT e.*, json_agg(cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields
      FROM "${session.user.schemaName}"."entries" e
      LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (topicId) {
      query += ` AND e."topicId" = $${paramIndex++}`;
      params.push(topicId);
    }

    if (date) {
      query += ` AND e."entryDate" = $${paramIndex++}`;
      params.push(date);
    }

    if (customType) {
      query += ` AND e."customType" = $${paramIndex++}`;
      params.push(customType);
    }

    if (searchToken) {
      query += ` AND $${paramIndex++} = ANY(e."searchTokens")`;
      params.push(searchToken);
    }

    query += ` GROUP BY e.id ORDER BY e."entryDate" DESC, e."createdAt" DESC`;

    const result = await client.query(query, params);
    return NextResponse.json({ entries: result.rows });
  } finally {
    client.release();
  }
}

// POST /api/entries - Create new entry
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = createEntrySchema.parse(body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const entryId = `entry_${Date.now()}`;

      const entryResult = await client.query(
        `INSERT INTO "${session.user.schemaName}"."entries"
        (id, "topicId", "encryptedContent", iv, "searchTokens", "customType", "entryDate", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *`,
        [
          entryId,
          validatedData.topicId || null,
          validatedData.encryptedContent,
          validatedData.iv,
          validatedData.searchTokens || [],
          validatedData.customType || null,
          validatedData.entryDate,
        ]
      );

      // Create custom_fields if provided
      if (validatedData.customFields) {
        for (let i = 0; i < validatedData.customFields.length; i++) {
          const cf = validatedData.customFields[i];
          await client.query(
            `INSERT INTO "${session.user.schemaName}"."custom_fields"
            (id, "entryId", "encryptedData", iv)
            VALUES ($1, $2, $3, $4)`,
            [`cf_${entryId}_${i}`, entryId, cf.encryptedData, cf.iv]
          );
        }
      }

      await client.query('COMMIT');
      return NextResponse.json({ entry: entryResult.rows[0] }, { status: 201 });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Create `src/app/api/entries/[id]/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/entries/[id] - Get single entry
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT e.*, json_agg(cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields
      FROM "${session.user.schemaName}"."entries" e
      LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
      WHERE e.id = $1
      GROUP BY e.id
    `, [params.id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ entry: result.rows[0] });
  } finally {
    client.release();
  }
}

// PUT /api/entries/[id] - Update entry
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update entry
    const entryResult = await client.query(
      `UPDATE "${session.user.schemaName}"."entries"
      SET "encryptedContent" = COALESCE($1, "encryptedContent"),
          iv = COALESCE($2, iv),
          "searchTokens" = COALESCE($3, "searchTokens"),
          "topicId" = COALESCE($4, "topicId"),
          "updatedAt" = NOW()
      WHERE id = $5
      RETURNING *`,
      [
        body.encryptedContent,
        body.iv,
        body.searchTokens,
        body.topicId,
        params.id,
      ]
    );

    if (entryResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // Update custom_fields if provided
    if (body.customFields) {
      await client.query(
        `DELETE FROM "${session.user.schemaName}"."custom_fields" WHERE "entryId" = $1`,
        [params.id]
      );

      for (let i = 0; i < body.customFields.length; i++) {
        const cf = body.customFields[i];
        await client.query(
          `INSERT INTO "${session.user.schemaName}"."custom_fields"
          (id, "entryId", "encryptedData", iv)
          VALUES ($1, $2, $3, $4)`,
          [`cf_${params.id}_${i}`, params.id, cf.encryptedData, cf.iv]
        );
      }
    }

    await client.query('COMMIT');
    return NextResponse.json({ entry: entryResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// DELETE /api/entries/[id] - Delete entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();

  try {
    // custom_fields cascade delete via ON DELETE CASCADE
    const result = await client.query(
      `DELETE FROM "${session.user.schemaName}"."entries" WHERE id = $1 RETURNING id`,
      [params.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Entry deleted successfully' });
  } finally {
    client.release();
  }
}
```

**Acceptance Criteria:**
- Can GET entries with filters (topicId, date, customType, searchToken)
- Can POST entry with encrypted content + optional custom_fields
- Can PUT update entry content and custom_fields
- Can DELETE entry (cascades to custom_fields)

---

### 5.3. Create Search Token Generation

**Task:** Create client-side utilities for search token generation.

**Create `src/lib/crypto/searchTokens.ts`:**
```typescript
/**
 * Tokenize text into searchable keywords
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .filter((word, index, arr) => arr.indexOf(word) === index); // unique
}

/**
 * Generate HMAC-SHA256 tokens for each keyword
 */
export async function generateSearchTokens(
  content: string,
  key: CryptoKey
): Promise<string[]> {
  const keywords = tokenize(content);
  const tokens: string[] = [];

  // Import key for HMAC
  const hmacKey = await window.crypto.subtle.importKey(
    'raw',
    await window.crypto.subtle.exportKey('raw', key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  for (const keyword of keywords) {
    const encoder = new TextEncoder();
    const data = encoder.encode(keyword);
    const signature = await window.crypto.subtle.sign('HMAC', hmacKey, data);
    tokens.push(btoa(String.fromCharCode(...new Uint8Array(signature))));
  }

  return tokens;
}

/**
 * Generate search token for a single search term
 */
export async function generateSearchToken(
  searchTerm: string,
  key: CryptoKey
): Promise<string> {
  const hmacKey = await window.crypto.subtle.importKey(
    'raw',
    await window.crypto.subtle.exportKey('raw', key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const data = encoder.encode(searchTerm.toLowerCase().trim());
  const signature = await window.crypto.subtle.sign('HMAC', hmacKey, data);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
```

**Acceptance Criteria:**
- Tokenizes content into keywords (3+ chars, unique)
- Generates HMAC token for each keyword
- Same keyword + same key = same token
- Can generate single search token for queries

---

### 5.4. Build Split-Screen Layout

**Task:** Create main journal interface with left/right panels.

**Create `src/components/journal/JournalLayout.tsx`:**
```typescript
'use client';

import { useState } from 'react';
import { TopicsSidebar } from '@/components/topics/TopicsSidebar';
import { EntriesList } from '@/components/journal/EntriesList';
import { EntryEditor } from '@/components/journal/EntryEditor';

export function JournalLayout() {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  return (
    <div className="flex h-screen">
      {/* Topics Sidebar */}
      <TopicsSidebar
        selectedTopicId={selectedTopicId}
        onSelectTopic={setSelectedTopicId}
      />

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Left Panel - Entries List */}
        <div className="w-1/2 border-r overflow-auto">
          <EntriesList
            topicId={selectedTopicId}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            selectedEntryId={selectedEntryId}
            onSelectEntry={setSelectedEntryId}
          />
        </div>

        {/* Right Panel - Entry Editor */}
        <div className="w-1/2 overflow-auto">
          <EntryEditor
            entryId={selectedEntryId}
            topicId={selectedTopicId}
            date={selectedDate}
            onEntrySaved={() => {
              // Refresh entries list
            }}
          />
        </div>
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- Three-panel layout (sidebar + list + editor)
- Topic selection filters entries
- Date selection for entries
- Entry selection loads into editor

---

### 5.5. Build Entries List Component

**Task:** Create entries list with quick entry mode.

**Create `src/components/journal/EntriesList.tsx`:**
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';

interface Entry {
  id: string;
  encryptedContent: string;
  iv: string;
  customType: string | null;
  entryDate: string;
  custom_fields: any[];
}

interface Props {
  topicId: string | null;
  selectedDate: string;
  onDateChange: (date: string) => void;
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string | null) => void;
}

export function EntriesList({
  topicId,
  selectedDate,
  onDateChange,
  selectedEntryId,
  onSelectEntry,
}: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [decryptedEntries, setDecryptedEntries] = useState<Map<string, string>>(new Map());
  const [quickEntry, setQuickEntry] = useState('');
  const { encryptData, decryptData, isKeyReady } = useEncryption();

  useEffect(() => {
    fetchEntries();
  }, [topicId, selectedDate]);

  useEffect(() => {
    if (isKeyReady && entries.length > 0) {
      decryptEntries();
    }
  }, [entries, isKeyReady]);

  const fetchEntries = async () => {
    const params = new URLSearchParams();
    if (topicId) params.set('topicId', topicId);
    if (selectedDate) params.set('date', selectedDate);

    const response = await fetch(`/api/entries?${params}`);
    const data = await response.json();
    setEntries(data.entries);
  };

  const decryptEntries = async () => {
    const decrypted = new Map<string, string>();
    for (const entry of entries) {
      try {
        const content = await decryptData(entry.encryptedContent, entry.iv);
        // Show preview (first 100 chars)
        decrypted.set(entry.id, content.slice(0, 100) + (content.length > 100 ? '...' : ''));
      } catch (error) {
        decrypted.set(entry.id, 'Decryption failed');
      }
    }
    setDecryptedEntries(decrypted);
  };

  const handleQuickEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEntry.trim() || !isKeyReady) return;

    const { ciphertext, iv } = await encryptData(quickEntry);

    await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encryptedContent: ciphertext,
        iv,
        topicId,
        entryDate: selectedDate,
      }),
    });

    setQuickEntry('');
    fetchEntries();
  };

  return (
    <div className="p-4">
      {/* Date Picker */}
      <div className="mb-4">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="px-3 py-2 border rounded-md"
        />
      </div>

      {/* Quick Entry */}
      <form onSubmit={handleQuickEntry} className="mb-4">
        <input
          type="text"
          value={quickEntry}
          onChange={(e) => setQuickEntry(e.target.value)}
          placeholder="Quick entry... (press Enter)"
          className="w-full px-3 py-2 border rounded-md"
        />
      </form>

      {/* Entries List */}
      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            onClick={() => onSelectEntry(entry.id)}
            className={`p-3 border rounded-md cursor-pointer ${
              selectedEntryId === entry.id ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {entry.customType === 'task' && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Task</span>
              )}
            </div>
            <p className="text-sm text-gray-700">
              {decryptedEntries.get(entry.id) || 'Decrypting...'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- Entries list filtered by topic and date
- Quick entry mode (single line, Enter to submit)
- Entries decrypted client-side
- Entry preview (first 100 chars)
- Click to select entry for editing

---

### 5.6. Build Entry Editor Component

**Task:** Create rich text editor for expanded entry mode.

**Create `src/components/journal/EntryEditor.tsx`:**
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { generateSearchTokens } from '@/lib/crypto/searchTokens';

interface Props {
  entryId: string | null;
  topicId: string | null;
  date: string;
  onEntrySaved: () => void;
}

export function EntryEditor({ entryId, topicId, date, onEntrySaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { encryptData, decryptData, isKeyReady } = useEncryption();

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px]',
      },
    },
  });

  useEffect(() => {
    if (entryId && isKeyReady) {
      loadEntry();
    } else if (!entryId) {
      editor?.commands.setContent('');
    }
  }, [entryId, isKeyReady]);

  const loadEntry = async () => {
    if (!entryId) return;
    setLoading(true);

    try {
      const response = await fetch(`/api/entries/${entryId}`);
      const { entry } = await response.json();

      const content = await decryptData(entry.encryptedContent, entry.iv);
      editor?.commands.setContent(content);
    } catch (error) {
      console.error('Failed to load entry:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editor || !isKeyReady) return;
    setSaving(true);

    try {
      const content = editor.getHTML();
      const { encryptionKey } = useEncryption.getState();

      // Encrypt content
      const { ciphertext, iv } = await encryptData(content);

      // Generate search tokens
      const plainText = editor.getText();
      const searchTokens = await generateSearchTokens(plainText, encryptionKey!);

      if (entryId) {
        // Update existing entry
        await fetch(`/api/entries/${entryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encryptedContent: ciphertext,
            iv,
            searchTokens,
          }),
        });
      } else {
        // Create new entry
        await fetch('/api/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encryptedContent: ciphertext,
            iv,
            searchTokens,
            topicId,
            entryDate: date,
          }),
        });
      }

      onEntrySaved();
    } catch (error) {
      console.error('Failed to save entry:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4">Loading entry...</div>;
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold">
          {entryId ? 'Edit Entry' : 'New Entry'}
        </h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="border rounded-md p-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- TipTap rich text editor
- Loads and decrypts existing entry
- Creates new entry if no entryId
- Encrypts content before saving
- Generates search tokens from plaintext

---

### Phase 5 Summary

**Critical Files Created:**
- ✅ `src/app/api/entries/route.ts` - Entries CRUD
- ✅ `src/app/api/entries/[id]/route.ts` - Single entry operations
- ✅ `src/lib/crypto/searchTokens.ts` - SSE token generation
- ✅ `src/components/journal/JournalLayout.tsx` - Main layout
- ✅ `src/components/journal/EntriesList.tsx` - Entries list + quick entry
- ✅ `src/components/journal/EntryEditor.tsx` - Rich text editor

**Acceptance Test:**
```
1. Open journal page
2. Select topic from sidebar
3. Select date
4. Create quick entry (Enter to submit)
5. Entry appears in list (decrypted)
6. Click entry to edit
7. Edit in rich text editor
8. Save entry (re-encrypted + new search tokens)
9. Search for keyword → finds entry via token
```

---

## Phase 6: Task Auto-Migration System (Week 3)

**High-level Goal:** Implement automatic migration of incomplete tasks to current date.

> **Architecture Note:** Tasks are entries with `customType = 'task'`. Task metadata (isCompleted, isAutoMigrating) stored in custom_fields.

### 6.1. Task Entry Structure

**Task Entries:**
- `customType = 'task'`
- `encryptedContent` = task description
- Custom fields:
  - `{ fieldKey: 'isCompleted', value: false }`
  - `{ fieldKey: 'isAutoMigrating', value: true }`

---

### 6.2. Build Task-Specific API Endpoints

**Task:** Create endpoints for task management.

**Create `src/app/api/tasks/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/tasks - Get all tasks (or filter by completion status)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const includeCompleted = searchParams.get('includeCompleted') === 'true';

  const client = await pool.connect();
  try {
    let query = `
      SELECT e.*, json_agg(cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields
      FROM "${session.user.schemaName}"."entries" e
      LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
      WHERE e."customType" = 'task'
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (date) {
      query += ` AND e."entryDate" = $${paramIndex++}`;
      params.push(date);
    }

    query += ` GROUP BY e.id ORDER BY e."createdAt" ASC`;

    const result = await client.query(query, params);
    return NextResponse.json({ tasks: result.rows });
  } finally {
    client.release();
  }
}

// POST /api/tasks - Create new task
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const taskId = `task_${Date.now()}`;

    // Create entry with customType = 'task'
    const entryResult = await client.query(
      `INSERT INTO "${session.user.schemaName}"."entries"
      (id, "topicId", "encryptedContent", iv, "customType", "entryDate", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, 'task', $5, NOW(), NOW())
      RETURNING *`,
      [taskId, body.topicId || null, body.encryptedContent, body.iv, body.entryDate]
    );

    // Create custom_fields for task metadata
    for (let i = 0; i < body.customFields.length; i++) {
      const cf = body.customFields[i];
      await client.query(
        `INSERT INTO "${session.user.schemaName}"."custom_fields"
        (id, "entryId", "encryptedData", iv)
        VALUES ($1, $2, $3, $4)`,
        [`cf_${taskId}_${i}`, taskId, cf.encryptedData, cf.iv]
      );
    }

    await client.query('COMMIT');
    return NextResponse.json({ task: entryResult.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**Create `src/app/api/tasks/[id]/complete/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// POST /api/tasks/[id]/complete - Toggle task completion
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  // body.customFields contains updated isCompleted field (encrypted)
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify task exists
    const taskCheck = await client.query(
      `SELECT id FROM "${session.user.schemaName}"."entries" WHERE id = $1 AND "customType" = 'task'`,
      [params.id]
    );

    if (taskCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Update custom_fields with new completion status
    await client.query(
      `DELETE FROM "${session.user.schemaName}"."custom_fields" WHERE "entryId" = $1`,
      [params.id]
    );

    for (let i = 0; i < body.customFields.length; i++) {
      const cf = body.customFields[i];
      await client.query(
        `INSERT INTO "${session.user.schemaName}"."custom_fields"
        (id, "entryId", "encryptedData", iv)
        VALUES ($1, $2, $3, $4)`,
        [`cf_${params.id}_${i}`, params.id, cf.encryptedData, cf.iv]
      );
    }

    // Update entry timestamp
    await client.query(
      `UPDATE "${session.user.schemaName}"."entries" SET "updatedAt" = NOW() WHERE id = $1`,
      [params.id]
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**Acceptance Criteria:**
- Can GET tasks by date
- Can POST new task with encrypted content + custom_fields
- Can toggle task completion (update custom_fields)

---

### 6.3. Build Auto-Migration Endpoint

**Task:** Create endpoint that migrates incomplete auto-migrating tasks.

**Create `src/app/api/tasks/migrate/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// POST /api/tasks/migrate - Migrate incomplete auto-migrating tasks
// Note: This endpoint returns tasks that need migration
// Client decrypts, filters by isCompleted=false && isAutoMigrating=true, then updates entryDate
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { taskIds, newDate } = await request.json();
  // taskIds = array of task IDs that client determined need migration
  // newDate = today's date

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const taskId of taskIds) {
      await client.query(
        `UPDATE "${session.user.schemaName}"."entries"
        SET "entryDate" = $1, "updatedAt" = NOW()
        WHERE id = $2 AND "customType" = 'task'`,
        [newDate, taskId]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      migratedCount: taskIds.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**Acceptance Criteria:**
- Client fetches all tasks before today
- Client decrypts custom_fields to find isCompleted=false && isAutoMigrating=true
- Client sends taskIds to migrate endpoint
- Server updates entryDate to today

---

### 6.4. Build Task Migration Hook

**Task:** Create client-side hook for auto-migration on login.

**Create `src/lib/hooks/useTaskMigration.ts`:**
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';

export function useTaskMigration() {
  const [migrating, setMigrating] = useState(false);
  const [migratedCount, setMigratedCount] = useState(0);
  const { decryptData, isKeyReady } = useEncryption();

  useEffect(() => {
    if (isKeyReady) {
      runMigration();
    }
  }, [isKeyReady]);

  const runMigration = async () => {
    setMigrating(true);

    try {
      const today = new Date().toISOString().split('T')[0];

      // Fetch all tasks (server returns all tasks, we filter client-side)
      const response = await fetch('/api/tasks');
      const { tasks } = await response.json();

      // Filter tasks that need migration
      const tasksToMigrate: string[] = [];

      for (const task of tasks) {
        // Skip tasks already on today or future
        if (task.entryDate >= today) continue;

        // Decrypt custom_fields to check isCompleted and isAutoMigrating
        let isCompleted = false;
        let isAutoMigrating = true;

        for (const cf of task.custom_fields || []) {
          if (!cf) continue;
          try {
            const fieldData = JSON.parse(await decryptData(cf.encryptedData, cf.iv));
            if (fieldData.fieldKey === 'isCompleted') isCompleted = fieldData.value;
            if (fieldData.fieldKey === 'isAutoMigrating') isAutoMigrating = fieldData.value;
          } catch (e) {
            console.error('Failed to decrypt custom field:', e);
          }
        }

        // Migrate if incomplete and auto-migrating is enabled
        if (!isCompleted && isAutoMigrating) {
          tasksToMigrate.push(task.id);
        }
      }

      if (tasksToMigrate.length > 0) {
        // Send migration request
        const migrateResponse = await fetch('/api/tasks/migrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskIds: tasksToMigrate,
            newDate: today,
          }),
        });

        const result = await migrateResponse.json();
        setMigratedCount(result.migratedCount);
      }
    } catch (error) {
      console.error('Task migration failed:', error);
    } finally {
      setMigrating(false);
    }
  };

  return { migrating, migratedCount };
}
```

**Acceptance Criteria:**
- Runs automatically on login when key is ready
- Fetches all tasks and decrypts custom_fields client-side
- Identifies incomplete auto-migrating tasks before today
- Sends migration request to update entryDate
- Reports count of migrated tasks

---

### 6.5. Build Tasks UI Component

**Task:** Create task list UI with completion toggles.

**Create `src/components/tasks/TasksList.tsx`:**
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';

interface Task {
  id: string;
  encryptedContent: string;
  iv: string;
  entryDate: string;
  custom_fields: any[];
}

interface DecryptedTask {
  content: string;
  isCompleted: boolean;
  isAutoMigrating: boolean;
}

interface Props {
  date: string;
  topicId: string | null;
}

export function TasksList({ date, topicId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [decryptedTasks, setDecryptedTasks] = useState<Map<string, DecryptedTask>>(new Map());
  const { encryptData, decryptData, isKeyReady } = useEncryption();

  useEffect(() => {
    fetchTasks();
  }, [date, topicId]);

  useEffect(() => {
    if (isKeyReady && tasks.length > 0) {
      decryptTasks();
    }
  }, [tasks, isKeyReady]);

  const fetchTasks = async () => {
    const params = new URLSearchParams({ date });
    const response = await fetch(`/api/tasks?${params}`);
    const data = await response.json();
    setTasks(data.tasks);
  };

  const decryptTasks = async () => {
    const decrypted = new Map<string, DecryptedTask>();
    for (const task of tasks) {
      try {
        const content = await decryptData(task.encryptedContent, task.iv);

        let isCompleted = false;
        let isAutoMigrating = true;

        for (const cf of task.custom_fields || []) {
          if (!cf) continue;
          const fieldData = JSON.parse(await decryptData(cf.encryptedData, cf.iv));
          if (fieldData.fieldKey === 'isCompleted') isCompleted = fieldData.value;
          if (fieldData.fieldKey === 'isAutoMigrating') isAutoMigrating = fieldData.value;
        }

        decrypted.set(task.id, { content, isCompleted, isAutoMigrating });
      } catch (error) {
        decrypted.set(task.id, { content: 'Decryption failed', isCompleted: false, isAutoMigrating: false });
      }
    }
    setDecryptedTasks(decrypted);
  };

  const toggleCompletion = async (taskId: string) => {
    const decrypted = decryptedTasks.get(taskId);
    if (!decrypted) return;

    const newIsCompleted = !decrypted.isCompleted;

    // Encrypt updated custom_fields
    const customFields = [
      { encryptedData: '', iv: '' },
      { encryptedData: '', iv: '' },
    ];

    const field1 = await encryptData(JSON.stringify({ fieldKey: 'isCompleted', value: newIsCompleted }));
    customFields[0] = { encryptedData: field1.ciphertext, iv: field1.iv };

    const field2 = await encryptData(JSON.stringify({ fieldKey: 'isAutoMigrating', value: decrypted.isAutoMigrating }));
    customFields[1] = { encryptedData: field2.ciphertext, iv: field2.iv };

    await fetch(`/api/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customFields }),
    });

    // Update local state
    setDecryptedTasks(new Map(decryptedTasks.set(taskId, { ...decrypted, isCompleted: newIsCompleted })));
  };

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const decrypted = decryptedTasks.get(task.id);
        return (
          <div
            key={task.id}
            className="flex items-center gap-3 p-3 border rounded-md"
          >
            <input
              type="checkbox"
              checked={decrypted?.isCompleted || false}
              onChange={() => toggleCompletion(task.id)}
              className="h-5 w-5 text-indigo-600 rounded"
            />
            <span className={decrypted?.isCompleted ? 'line-through text-gray-400' : ''}>
              {decrypted?.content || 'Decrypting...'}
            </span>
            {decrypted?.isAutoMigrating && !decrypted?.isCompleted && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded ml-auto">
                Auto-migrate
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Acceptance Criteria:**
- Tasks list filtered by date
- Tasks decrypted client-side
- Checkbox toggles completion status
- Completed tasks show strikethrough
- Auto-migrating indicator badge

---

### Phase 6 Summary

**Critical Files Created:**
- ✅ `src/app/api/tasks/route.ts` - Tasks CRUD
- ✅ `src/app/api/tasks/[id]/complete/route.ts` - Toggle completion
- ✅ `src/app/api/tasks/migrate/route.ts` - Auto-migration endpoint
- ✅ `src/lib/hooks/useTaskMigration.ts` - Client-side migration
- ✅ `src/components/tasks/TasksList.tsx` - Tasks UI

**Acceptance Test:**
```
1. Create task on Monday with auto-migrate enabled
2. Leave task incomplete
3. Login on Tuesday
4. Task automatically moves to Tuesday
5. Complete task on Tuesday
6. Login on Wednesday
7. Completed task stays on Tuesday (no migration)
```

---

## Phase 7: Goals Tracking System (Week 3-4)

**High-level Goal:** Implement goals and milestones tracking with progress visualization.

> **Architecture Note:** Goals and milestones use the WordPress-style `entries` + `custom_fields` model. Goals are entries with `customType = 'goal'`, milestones are entries with `customType = 'milestone'`. They are linked via `entry_relationships`. No separate tables needed.

### 7.1. Goals Data Model

**Goals** are entries with:
- `customType = 'goal'`
- `encryptedContent` = goal title/description
- Custom fields:
  - `{ fieldKey: 'type', value: 'short_term' | 'long_term' }`
  - `{ fieldKey: 'status', value: 'not_started' | 'in_progress' | 'completed' | 'archived' | 'abandoned' }`
  - `{ fieldKey: 'targetDate', value: '2025-12-31' }`
  - `{ fieldKey: 'progressPercentage', value: 66 }` (auto-calculated from milestones)

**Milestones** are entries with:
- `customType = 'milestone'`
- `encryptedContent` = milestone title/description
- Custom fields:
  - `{ fieldKey: 'orderIndex', value: 1 }`
  - `{ fieldKey: 'isCompleted', value: false }`
  - `{ fieldKey: 'completedAt', value: '2025-01-15T10:30:00Z' }`

**Goal ↔ Milestone Link:**
- `entry_relationships` table with `relationshipType = 'goal_milestone'`
- `entryId` = milestone ID, `relatedToId` = goal ID

**Acceptance Criteria:**
- Goals stored as entries with customType = 'goal'
- Milestones stored as entries with customType = 'milestone'
- Linked via entry_relationships
- All field values encrypted in custom_fields

---

### 7.2. Build Goals API Endpoints

**Task:** Create CRUD endpoints for goals using entries + custom_fields.

**Create `src/app/api/goals/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createGoalSchema = z.object({
  encryptedContent: z.string(),
  iv: z.string(),
  searchTokens: z.array(z.string()).optional(),
  customFields: z.array(z.object({
    encryptedData: z.string(),
    iv: z.string(),
  })),
});

// GET /api/goals - List all goals
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    // Get all entries with customType = 'goal'
    const entriesResult = await client.query(`
      SELECT e.*, json_agg(cf.*) as custom_fields
      FROM "${session.user.schemaName}"."entries" e
      LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
      WHERE e."customType" = 'goal'
      GROUP BY e.id
      ORDER BY e."createdAt" DESC
    `);

    return NextResponse.json({ goals: entriesResult.rows });
  } finally {
    client.release();
  }
}

// POST /api/goals - Create new goal
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = createGoalSchema.parse(body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const goalId = `goal_${Date.now()}`;

      // Create entry with customType = 'goal'
      const entryResult = await client.query(
        `INSERT INTO "${session.user.schemaName}"."entries"
        (id, "encryptedContent", iv, "searchTokens", "customType", "entryDate", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, 'goal', CURRENT_DATE, NOW(), NOW())
        RETURNING *`,
        [
          goalId,
          validatedData.encryptedContent,
          validatedData.iv,
          validatedData.searchTokens || [],
        ]
      );

      // Create custom_fields for goal metadata (type, status, targetDate, progressPercentage)
      for (let i = 0; i < validatedData.customFields.length; i++) {
        const cf = validatedData.customFields[i];
        await client.query(
          `INSERT INTO "${session.user.schemaName}"."custom_fields"
          (id, "entryId", "encryptedData", iv)
          VALUES ($1, $2, $3, $4)`,
          [`cf_${goalId}_${i}`, goalId, cf.encryptedData, cf.iv]
        );
      }

      await client.query('COMMIT');

      return NextResponse.json({ goal: entryResult.rows[0] }, { status: 201 });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Create `src/app/api/goals/[id]/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/goals/[id] - Get single goal with milestones
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    // Get goal entry with custom_fields
    const goalResult = await client.query(`
      SELECT e.*, json_agg(cf.*) as custom_fields
      FROM "${session.user.schemaName}"."entries" e
      LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
      WHERE e.id = $1 AND e."customType" = 'goal'
      GROUP BY e.id
    `, [params.id]);

    if (goalResult.rows.length === 0) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    // Fetch milestones for this goal via entry_relationships
    const milestonesResult = await client.query(`
      SELECT m.*, json_agg(cf.*) as custom_fields
      FROM "${session.user.schemaName}"."entries" m
      JOIN "${session.user.schemaName}"."entry_relationships" er
        ON er."entryId" = m.id AND er."relationshipType" = 'goal_milestone'
      LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = m.id
      WHERE er."relatedToId" = $1 AND m."customType" = 'milestone'
      GROUP BY m.id
      ORDER BY m."createdAt" ASC
    `, [params.id]);

    return NextResponse.json({
      goal: goalResult.rows[0],
      milestones: milestonesResult.rows,
    });
  } finally {
    client.release();
  }
}

// DELETE /api/goals/[id] - Delete goal (and its milestones)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete milestones linked to this goal
    await client.query(`
      DELETE FROM "${session.user.schemaName}"."entries"
      WHERE id IN (
        SELECT er."entryId" FROM "${session.user.schemaName}"."entry_relationships" er
        WHERE er."relatedToId" = $1 AND er."relationshipType" = 'goal_milestone'
      )
    `, [params.id]);

    // Delete the goal entry
    const result = await client.query(
      `DELETE FROM "${session.user.schemaName}"."entries" WHERE id = $1 AND "customType" = 'goal' RETURNING id`,
      [params.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    await client.query('COMMIT');
    return NextResponse.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**Acceptance Criteria:**
- Can GET all goals with their custom_fields
- Can POST new goal as entry with customType='goal' + custom_fields
- Can GET single goal with milestones (via entry_relationships)
- Can DELETE goal (cascades to milestones via entry_relationships)

---

### 7.3. Build Milestones API Endpoints

**Task:** Create endpoints for milestone management using entries + custom_fields.

**Create `src/app/api/goals/[goalId]/milestones/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createMilestoneSchema = z.object({
  encryptedContent: z.string(),
  iv: z.string(),
  customFields: z.array(z.object({
    encryptedData: z.string(),
    iv: z.string(),
  })),
});

// POST /api/goals/[goalId]/milestones - Create milestone linked to goal
export async function POST(
  request: NextRequest,
  { params }: { params: { goalId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = createMilestoneSchema.parse(body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify goal exists
      const goalCheck = await client.query(
        `SELECT id FROM "${session.user.schemaName}"."entries" WHERE id = $1 AND "customType" = 'goal'`,
        [params.goalId]
      );

      if (goalCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
      }

      const milestoneId = `milestone_${Date.now()}`;

      // Create milestone as entry with customType = 'milestone'
      const entryResult = await client.query(
        `INSERT INTO "${session.user.schemaName}"."entries"
        (id, "encryptedContent", iv, "customType", "entryDate", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, 'milestone', CURRENT_DATE, NOW(), NOW())
        RETURNING *`,
        [milestoneId, validatedData.encryptedContent, validatedData.iv]
      );

      // Create custom_fields for milestone (orderIndex, isCompleted)
      for (let i = 0; i < validatedData.customFields.length; i++) {
        const cf = validatedData.customFields[i];
        await client.query(
          `INSERT INTO "${session.user.schemaName}"."custom_fields"
          (id, "entryId", "encryptedData", iv)
          VALUES ($1, $2, $3, $4)`,
          [`cf_${milestoneId}_${i}`, milestoneId, cf.encryptedData, cf.iv]
        );
      }

      // Link milestone to goal via entry_relationships
      await client.query(
        `INSERT INTO "${session.user.schemaName}"."entry_relationships"
        (id, "entryId", "relatedToId", "relationshipType", "createdAt")
        VALUES ($1, $2, $3, 'goal_milestone', NOW())`,
        [`rel_${milestoneId}`, milestoneId, params.goalId]
      );

      await client.query('COMMIT');
      return NextResponse.json({ milestone: entryResult.rows[0] }, { status: 201 });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Create `src/app/api/goals/[goalId]/milestones/[milestoneId]/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// PUT to update milestone custom_fields (completion status, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: { goalId: string; milestoneId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  // body.customFields = [{ encryptedData, iv }] for updated fields
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify milestone exists and is linked to goal
    const milestoneCheck = await client.query(`
      SELECT m.id FROM "${session.user.schemaName}"."entries" m
      JOIN "${session.user.schemaName}"."entry_relationships" er
        ON er."entryId" = m.id AND er."relationshipType" = 'goal_milestone'
      WHERE m.id = $1 AND er."relatedToId" = $2 AND m."customType" = 'milestone'
    `, [params.milestoneId, params.goalId]);

    if (milestoneCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }

    // Delete old custom_fields and insert new ones
    await client.query(
      `DELETE FROM "${session.user.schemaName}"."custom_fields" WHERE "entryId" = $1`,
      [params.milestoneId]
    );

    for (let i = 0; i < body.customFields.length; i++) {
      const cf = body.customFields[i];
      await client.query(
        `INSERT INTO "${session.user.schemaName}"."custom_fields"
        (id, "entryId", "encryptedData", iv)
        VALUES ($1, $2, $3, $4)`,
        [`cf_${params.milestoneId}_${i}`, params.milestoneId, cf.encryptedData, cf.iv]
      );
    }

    // Update milestone entry timestamp
    await client.query(
      `UPDATE "${session.user.schemaName}"."entries" SET "updatedAt" = NOW() WHERE id = $1`,
      [params.milestoneId]
    );

    await client.query('COMMIT');

    // Note: Goal progress recalculation happens client-side after decrypting all milestone custom_fields
    return NextResponse.json({ success: true, milestoneId: params.milestoneId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**Acceptance Criteria:**
- Can create milestone as entry with customType='milestone' + custom_fields
- Milestone linked to goal via entry_relationships
- Can update milestone custom_fields (isCompleted, completedAt)
- Goal progress calculated client-side from decrypted milestone custom_fields

---

### 7.4. Build Goals Dashboard Component

**Task:** Create UI for viewing all goals using entries + custom_fields.

**Create `src/components/goals/GoalsDashboard.tsx`:**
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';

interface CustomField {
  id: string;
  encryptedData: string;
  iv: string;
}

interface Goal {
  id: string;
  encryptedContent: string;
  iv: string;
  customType: 'goal';
  custom_fields: CustomField[];
  createdAt: string;
}

interface DecryptedGoal {
  content: string;
  type: 'short_term' | 'long_term';
  status: string;
  targetDate: string | null;
  progressPercentage: number;
}

export function GoalsDashboard() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [decryptedGoals, setDecryptedGoals] = useState<Map<string, DecryptedGoal>>(new Map());
  const [activeTab, setActiveTab] = useState<'short_term' | 'long_term'>('short_term');
  const { decryptData, isKeyReady } = useEncryption();

  useEffect(() => {
    fetchGoals();
  }, [activeTab]);

  useEffect(() => {
    if (isKeyReady && goals.length > 0) {
      decryptGoals();
    }
  }, [goals, isKeyReady]);

  const fetchGoals = async () => {
    const response = await fetch('/api/goals');
    const data = await response.json();
    setGoals(data.goals);
  };

  const decryptGoals = async () => {
    const decrypted = new Map<string, DecryptedGoal>();
    for (const goal of goals) {
      try {
        // Decrypt content
        const content = await decryptData(goal.encryptedContent, goal.iv);

        // Decrypt each custom_field to get type, status, targetDate, progressPercentage
        let type: 'short_term' | 'long_term' = 'short_term';
        let status = 'not_started';
        let targetDate = null;
        let progressPercentage = 0;

        for (const cf of goal.custom_fields || []) {
          if (!cf) continue;
          const fieldData = JSON.parse(await decryptData(cf.encryptedData, cf.iv));
          switch (fieldData.fieldKey) {
            case 'type': type = fieldData.value; break;
            case 'status': status = fieldData.value; break;
            case 'targetDate': targetDate = fieldData.value; break;
            case 'progressPercentage': progressPercentage = fieldData.value; break;
          }
        }

        decrypted.set(goal.id, { content, type, status, targetDate, progressPercentage });
      } catch (error) {
        console.error('Decryption failed for goal:', goal.id);
      }
    }
    setDecryptedGoals(decrypted);
  };

  // Filter goals by type (client-side after decryption)
  const filteredGoals = goals.filter(goal => {
    const decrypted = decryptedGoals.get(goal.id);
    return decrypted?.type === activeTab;
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Goals</h1>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
          + New Goal
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button
          className={`px-4 py-2 ${activeTab === 'short_term' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-600'}`}
          onClick={() => setActiveTab('short_term')}
        >
          Short-Term Goals
        </button>
        <button
          className={`px-4 py-2 ${activeTab === 'long_term' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-600'}`}
          onClick={() => setActiveTab('long_term')}
        >
          Long-Term Goals
        </button>
      </div>

      {/* Goals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredGoals.map((goal) => {
          const decrypted = decryptedGoals.get(goal.id);
          return (
            <div key={goal.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <h3 className="text-lg font-semibold mb-2">
                {decrypted?.content || 'Decrypting...'}
              </h3>

              {/* Progress Bar */}
              <div className="mb-2">
                <div className="flex justify-between text-sm mb-1">
                  <span>Progress</span>
                  <span>{decrypted?.progressPercentage || 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all"
                    style={{ width: `${decrypted?.progressPercentage || 0}%` }}
                  />
                </div>
              </div>

              {/* Meta Info */}
              <div className="flex justify-between text-xs text-gray-500 mt-4">
                <span className="capitalize">{decrypted?.status?.replace('_', ' ') || 'Loading...'}</span>
                {decrypted?.targetDate && (
                  <span>Due: {new Date(decrypted.targetDate).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- Goals display in grid layout
- Tabs switch between short-term/long-term
- Goals decrypt and display title/description
- Progress bar shows completion percentage
- Target date displayed if set

---

### Phase 7 Summary

**Critical Files Created:**
- ✅ Updated `src/lib/db/schemaManager.ts` - Goals/Milestones tables
- ✅ `src/app/api/goals/route.ts` - Goals CRUD
- ✅ `src/app/api/goals/[id]/route.ts` - Single goal operations
- ✅ `src/app/api/goals/[id]/milestones/route.ts` - Milestones creation
- ✅ `src/app/api/goals/[goalId]/milestones/[milestoneId]/route.ts` - Milestone updates
- ✅ `src/components/goals/GoalsDashboard.tsx` - Goals UI
- ✅ `src/app/(dashboard)/goals/page.tsx` - Goals page

**Additional Components Needed:**
- AddGoalModal.tsx - Create/edit goals
- MilestoneList.tsx - Display and manage milestones
- GoalDetailView.tsx - Single goal with milestones
- ProgressVisualization.tsx - Charts and stats

---

## Phases 8-12 Overview

The remaining phases follow the same pattern from the plan:

- **Phase 8**: Medical Tracking (Week 4) - Optional
- **Phase 9**: Calendar Integration (Week 4-5)
- **Phase 10**: AI Integration (Week 5-6)
- **Phase 11**: Voice Input & Entry Sharing (Week 6)
- **Phase 12**: Polish & Security (Week 6-7)

Each phase includes the same granular subtask structure with:
- Task descriptions
- Code examples
- Acceptance criteria
- Critical files list

---

## Testing Strategy

### Unit Tests
- Encryption/decryption roundtrip
- Key derivation consistency
- API endpoint logic
- Validation schemas

### Integration Tests
- Auth flow: register → login → session
- Entry flow: encrypt → store → fetch → decrypt
- Password change: re-encryption flow

### E2E Tests
- User journey: register → create entry → logout → login
- Password warning acceptance
- Entry CRUD operations

### Security Tests
- Encrypted data unreadable in DB
- Auth bypass attempts
- Key never leaves client
- Shared entry URL security

---

## Success Criteria

✅ Users can register, login, change password
✅ Split-screen interface functional
✅ Quick and expanded entry modes work
✅ Task auto-migration runs daily
✅ **Goals tracking with milestones functional**
✅ **Short-term and long-term goals can be created**
✅ **Progress automatically calculated from milestones**
✅ All entry content encrypted client-side
✅ Export functionality works
✅ Security audit passed
✅ Mobile responsive

---

## Timeline Summary

### Core MVP (Phases 1-6, 12): 4-5 weeks
### With Goals (Add Phase 7): +1 week
### With Medical (Add Phase 8): +1 week
### With Calendar (Add Phase 9): +1 week
### With AI (Add Phase 10): +1 week
### With Voice & Sharing (Add Phase 11): +1 week
### Full Feature Set: 8-9 weeks

---

**Document Version:** 1.0
**Last Updated:** 2025-01-15
**Related Documents:** [ARCHITECTURE.md](ARCHITECTURE.md), [PLAN.md](PLAN.md)
