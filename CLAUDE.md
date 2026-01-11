# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chronicles is a **zero-knowledge encrypted journal application** with client-side encryption. The server never sees plaintext user data. Key privacy guarantees:
- All entry content is encrypted in the browser before transmission
- Master encryption key stored in browser `sessionStorage` (persists across page refreshes, cleared on logout/timeout/browser close)
- Recovery key provided at registration for password recovery

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build (also runs TypeScript checks)
npm run lint     # Run ESLint
npx prisma generate  # Regenerate Prisma client after schema changes
npx prisma migrate dev --name <name>  # Create and apply migration
```

## Architecture

### Multi-Tenant Schema-per-User Database

Each user gets an isolated PostgreSQL schema. This is **not** row-level security.

```
PostgreSQL Database
├── auth schema (shared)
│   ├── accounts - authentication only (email, passwordHash, schemaName reference)
│   ├── sessions - database-backed sessions (enables immediate revocation)
│   └── schema_counter - atomic counter for unique schema names
│
├── chronicles_x7k9m2_1 (user 1's isolated schema)
│   ├── topics - encrypted names with SSE nameToken
│   ├── entries - encrypted content with searchTokens for SSE
│   ├── custom_fields - encrypted type-specific metadata (WordPress-style)
│   ├── entry_relationships - links between entries (goal → milestones)
│   ├── user_settings - feature toggles (food, medication, goals enabled)
│   ├── shared_entries - public sharing via token (stores decrypted content)
│   ├── calendar_events - calendar integration with encrypted titles
│   ├── medication_dose_logs - dose logging with timestamps
│   ├── favorites - favorited entries
│   └── entry_images - image attachments (metadata; data on filesystem)
│
└── chronicles_p3n8q5_2 (user 2's isolated schema)
    └── ... same tables
```

**Schema naming**: `chronicles_<random_6_char>_<auto_increment>` - NOT derived from user info for security.

### Two-Layer Security Model

1. **Authentication Layer (Server)**: bcrypt password hash, database sessions with immediate revocation
2. **Encryption Layer (Client)**: AES-256-GCM with auto-generated master key wrapped by password-derived KEK

Password changes only re-wrap the master key (instant). Data is never re-encrypted on password change.

### Recovery Key System

The master key is wrapped with two different keys:
1. **Password-derived key** (PBKDF2) - for normal login
2. **Recovery-derived key** - for password recovery

At registration:
- Client generates a random master key and recovery key (32 bytes each)
- Master key is wrapped with password-derived key (stored as `encryptedMasterKey`)
- Master key is also wrapped with recovery-derived key (stored as `encryptedMasterKeyWithRecovery`)
- Recovery key is shown once to user (formatted as hex with dashes) - must be saved

For password recovery:
1. User provides email and recovery key
2. Client fetches encrypted master key (recovery-wrapped) from server
3. Client unwraps master key using recovery key
4. Client wraps master key with new password-derived key
5. Server updates password hash and wrapped master key

### Key Files

**Database & Auth:**
- `prisma/schema.prisma` - Auth schema only (Account, Session, SchemaCounter)
- `src/lib/db/schemaManager.ts` - Creates per-user schemas with all tables dynamically
- `src/lib/db/prisma.ts` - Prisma client singleton

**Encryption:**
- `src/lib/crypto/encryption.ts` - AES-256-GCM encryption/decryption utilities
- `src/lib/hooks/useEncryption.ts` - Zustand store for encryption key state

**State Management (Zustand Stores):**
- `src/lib/hooks/useEntriesCache.ts` - Client-side encrypted cache for entries, topics, and settings (reduces DB calls)
- `src/lib/hooks/useAccentColor.tsx` - Dynamic accent color and background image state
- `src/lib/hooks/useTimezone.ts` - User timezone handling
- `src/lib/hooks/useSecurityClear.ts` - Centralized cleanup registry for logout/timeout
- `src/lib/hooks/useTaskMigration.ts` - Auto-migrates incomplete tasks to current day at midnight
- `src/lib/hooks/useInactivityTimeout.ts` - Session timeout on user inactivity

**Providers:**
- `src/components/providers/EncryptionProvider.tsx` - Encryption key lifecycle management
- `src/components/providers/AccentColorInitializer.tsx` - CSS custom properties for theming
- `src/components/providers/SessionProvider.tsx` - NextAuth session wrapper
- `src/components/providers/DevToolsBlocker.tsx` - Production devtools protection

**Core Components:**
- `src/components/layout/Header.tsx` - Main navigation header (customizable colors)
- `src/components/layout/BackgroundImage.tsx` - Dynamic background image handling
- `src/components/journal/` - Journal entry editor, list, and layout
- `src/components/topics/` - Topic management (sidebar, browser, selector)
- `src/components/goals/` - Goals and milestones tracking
- `src/components/tasks/` - Task management with milestone linking
- `src/components/health/` - Health tracking (medications, symptoms, food, exercise, schedule, allergies)
- `src/components/calendar/` - Calendar view
- `src/components/sharing/` - Entry sharing functionality
- `src/components/entertainment/` - Entertainment tracking view
- `src/components/inspiration/` - Quotes and inspiration view

**API Routes:**
- `src/app/api/entries/` - CRUD for journal entries
- `src/app/api/topics/` - Topic management
- `src/app/api/user/register/` - User registration (with email whitelist)
- `src/app/api/user/recover/` - Password recovery (accepts recovery key)
- `src/app/api/user/setup-recovery-key/` - Add recovery key to existing account
- `src/app/api/medications/` - Medication tracking
- `src/app/api/calendar/` - Calendar data
- `src/app/api/favorites/` - Favorite entries
- `src/app/api/share/` - Public sharing

**Security:**
- `src/lib/sanitize.ts` - DOMPurify HTML sanitization
- `src/lib/validation/password.ts` - Password strength and entropy validation
- `src/components/auth/LegacyKeyMigration.tsx` - PBKDF2 iteration and recovery key migration
- `next.config.js` - CSP headers configuration

User data tables are created dynamically via `createUserSchema()`, not in Prisma schema.

### Querying User Data

User-specific tables require raw SQL with the schema name:
```typescript
// Get schemaName from authenticated session
const schemaName = session.user.schemaName; // e.g., "chronicles_x7k9m2_1"

// Query user's entries
await client.query(`SELECT * FROM "${schemaName}"."entries" WHERE ...`);
```

## Features

### Implemented
- User authentication with bcrypt password hashing
- Email whitelist for registration (`REGISTRATION_WHITELIST` env var)
- Terms of Service agreement on registration
- Client-side AES-256-GCM encryption
- Journal entries with rich text editor
- Topic organization with icons and colors
- Goals with milestone tracking
- Task management with milestone linking and auto-migration
- Health tracking (medications, symptoms, food, exercise, schedule, allergies)
- Calendar view
- Entry sharing via public links
- Favorites system
- Image attachments
- Mobile responsive design
- Customizable header colors (18 options + transparent)
- Background images (28 curated options)
- Client-side entry caching for performance
- Entertainment and inspiration views

### Registration Flow
1. Email must be on whitelist (env: `REGISTRATION_WHITELIST`)
2. User must acknowledge recovery key requirement
3. User must agree to Terms of Service
4. Password requirements: 12+ chars, uppercase, lowercase, number
5. After registration: master key and recovery key generated client-side
6. Recovery key displayed once - user must save it securely

### Password Recovery Flow
1. User clicks "Forgot password?" on login page
2. Enters email address
3. Enters recovery key (hex format with dashes)
4. If valid, enters new password
5. Master key re-wrapped with new password
6. **New recovery key generated** - old recovery key is invalidated
7. User must save new recovery key

## Encryption Specification

```
Algorithm: AES-256-GCM
IV: Random 12 bytes per entry
Key Derivation: PBKDF2-SHA256, 600,000 iterations (OWASP 2023 recommendation)
Salt: 32 bytes random per user
Legacy Support: Automatic migration from 100,000 iterations
```

All encrypted fields store: `encryptedContent` (base64) + `iv` (base64)

## Security Hardening

### Content Security Policy (CSP)
Strict CSP headers configured in `next.config.js`:
- `default-src 'self'` - Only allow same-origin resources
- `script-src 'self'` - No inline scripts (with Next.js nonce for required scripts)
- `style-src 'self' 'unsafe-inline'` - Styles (unsafe-inline required for Tailwind)
- `img-src 'self' data: blob:` - Images from same origin and data URIs
- `connect-src 'self'` - API calls to same origin only

### XSS Prevention
- **DOMPurify**: All user-generated HTML content sanitized before rendering
- **TipTap Configuration**: Rich text editor configured with safe allowed tags/attributes
- **Sanitization Location**: `src/lib/sanitize.ts` - centralized sanitization utility

### Rate Limiting
- Login attempts rate-limited per IP/email combination
- Prevents brute force password attacks
- Implemented in `/api/auth/[...nextauth]/route.ts`

### Password Strength
- Minimum 12 characters with complexity requirements
- **Entropy validation**: Passwords checked against common patterns and dictionary words
- Implemented in `src/lib/validation/password.ts`

### Legacy Migration
Component `src/components/auth/LegacyKeyMigration.tsx` handles:
- Migrating users from 100k to 600k PBKDF2 iterations
- Adding recovery key for accounts created before recovery system
- Transparent upgrade on next login

## State Management

**Zustand** is used for client-side state (not Redux). Rationale:

- **Session-only persistence** - Encryption key is stored in `sessionStorage` for cross-refresh persistence, but cleared on logout, inactivity timeout, or browser close. Never persisted to `localStorage`.
- **Minimal footprint** - ~1KB vs Redux Toolkit's ~11KB. Smaller attack surface for privacy-focused app.
- **Simple state shape** - No reducers/actions needed.
- **No middleware** - Web Crypto API is already Promise-based; no thunks required.

### Zustand Stores

1. **useEncryption** - Encryption key lifecycle: `{ key, deriveKey(), encrypt(), decrypt(), clearKey() }`
2. **useEntriesCache** - Encrypted entries/topics/settings cache with methods for CRUD operations
3. **useAccentColor** - Theme customization (header color, background image, derived CSS variables)

### Key Storage Security

- Master key exported to JWK format and stored in `sessionStorage`
- **CSP headers are a critical security control** - sessionStorage is accessible to same-origin scripts
- Key is cleared on: logout, inactivity timeout (configurable), browser/tab close
- Key is never sent to server or persisted to disk

### Client-Side Caching

The `useEntriesCache` store provides:
- **Encrypted cache** - All cached data remains encrypted (safe to hold in memory)
- **Reduced DB calls** - Initial load fetches all entries, then cache serves reads
- **Immediate writes** - Changes write to DB first, then update cache
- **Security cleanup** - Registered with `useSecurityClear` for logout/timeout

## UI Theme

### Dynamic Theming

Header and accent colors are user-customizable via Settings. The `useAccentColor` hook:
- Reads `headerColor` from cached settings
- Derives hover color (darker) and light background color automatically
- Sets CSS custom properties: `--accent-color`, `--accent-hover`, `--accent-light`
- Supports transparent header with gray fallback for accent elements

### Default Colors
- Default header: `#4281a4` (steel blue)
- Fallback accent (transparent header): `#6b7280` (gray-500)
- Neutral background: `#f7f7f7`

### Background Images
- 28 curated images from Unsplash artists
- Brightness analysis for header text contrast (light/dark text)
- Cached brightness results for performance
