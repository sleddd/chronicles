# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chronicles is a **zero-knowledge encrypted journal application** with client-side encryption. The server never sees plaintext user data. Key privacy guarantees:
- All entry content is encrypted in the browser before transmission
- Master encryption key exists only in browser memory (lost on refresh)
- Password loss = permanent data loss (by design, no recovery)

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
│   ├── user_settings - feature toggles
│   └── shared_entries - public sharing via token
│
└── chronicles_p3n8q5_2 (user 2's isolated schema)
    └── ... same tables
```

**Schema naming**: `chronicles_<random_6_char>_<auto_increment>` - NOT derived from user info for security.

### Two-Layer Security Model

1. **Authentication Layer (Server)**: bcrypt password hash, database sessions with immediate revocation
2. **Encryption Layer (Client)**: AES-256-GCM with auto-generated master key wrapped by password-derived KEK

Password changes only re-wrap the master key (instant). Data is never re-encrypted on password change.

### Key Files

- `prisma/schema.prisma` - Auth schema only (Account, Session, SchemaCounter)
- `src/lib/db/schemaManager.ts` - Creates per-user schemas with all tables dynamically
- `src/lib/db/prisma.ts` - Prisma client singleton

User data tables (topics, entries, custom_fields, entry_relationships, user_settings, shared_entries) are created dynamically via `createUserSchema()`, not in Prisma schema.

### Querying User Data

User-specific tables require raw SQL with the schema name:
```typescript
// Get schemaName from authenticated session
const schemaName = session.user.schemaName; // e.g., "chronicles_x7k9m2_1"

// Query user's entries
await client.query(`SELECT * FROM "${schemaName}"."entries" WHERE ...`);
```

## Implementation Status

**Phase 1 Complete**: Project foundation with Next.js 16, Prisma 7, schema management utilities.

See `IMPLEMENTATION.md` for remaining phases (Authentication, Encryption, Topics, Journal UI, etc.).

## Encryption Specification

```
Algorithm: AES-256-GCM
IV: Random 12 bytes per entry
Key Derivation: PBKDF2-SHA256, 100,000 iterations
Salt: 32 bytes random per user
```

All encrypted fields store: `encryptedContent` (base64) + `iv` (base64)

## State Management

**Zustand** is used for encryption key state (not Redux). Rationale:

- **No persistence needed** - Encryption key must never be persisted (security requirement). Zustand defaults to in-memory only.
- **Minimal footprint** - ~1KB vs Redux Toolkit's ~11KB. Smaller attack surface for privacy-focused app.
- **Simple state shape** - Just `{ key, deriveKey(), encrypt(), decrypt(), clearKey() }`. No reducers/actions needed.
- **No middleware** - Web Crypto API is already Promise-based; no thunks required.

If complex UI state grows (undo/redo, offline queue), Redux could be added separately - but encryption state should stay in an isolated minimal store.
