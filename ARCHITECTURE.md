# Chronicles - System Architecture

This document describes the structure and technical design of Chronicles, a zero-knowledge encrypted journal application.

---

## System Overview

Chronicles is an encrypted journal application where all user content is encrypted client-side before transmission. The server never sees plaintext user data.

**Core Properties:**
- Client-side encryption using AES-256-GCM
- Schema-per-user database isolation
- Searchable Symmetric Encryption (SSE) for server-side search without decryption
- WordPress-style flexible content model with custom fields

---

## Multi-Tenant Architecture

Each user gets an isolated PostgreSQL schema. This is database-level isolation, not row-level security.

```
PostgreSQL Database
├── auth schema (shared)
│   ├── accounts
│   ├── sessions
│   └── schema_counter
│
├── chronicles_x7k9m2_1 (user 1's schema)
│   ├── topics
│   ├── entries
│   ├── custom_fields
│   ├── entry_relationships
│   ├── user_settings
│   └── shared_entries
│
└── chronicles_p3n8q5_2 (user 2's schema)
    └── ... same tables
```

**Schema Naming:** `chronicles_<random_6_char>_<auto_increment>` — not derived from user info.

**Registration Flow:**
1. Create account in `auth.accounts`
2. Generate schema name using random prefix + counter
3. Create schema and run migrations
4. Seed default topics
5. Store schema name in account record

**Query Flow:**
1. Validate session from `auth.sessions`
2. Fetch `schemaName` from `auth.accounts`
3. All queries scoped to user's schema

---

## Security Model

Two separate layers: authentication (server-side) and encryption (client-side).

### Authentication Layer

- Password hashed with bcrypt (10 rounds)
- Database-backed sessions (not JWT) for immediate revocation
- Session token stored in httpOnly cookie

### Encryption Layer

- Auto-generated 256-bit master key (not derived from password)
- Master key encrypted with password-derived KEK (Key Encryption Key)
- KEK derived via PBKDF2-SHA256 (100,000 iterations)
- Master key stored encrypted on server, decrypted only in browser memory

**Password Change:** Re-encrypts only the master key wrapper (instant). No data re-encryption needed.

**Key Rotation:** Optional full re-encryption of all data with new master key.

---

## Database Schema

### Auth Schema (Shared)

**accounts**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| email | String | Unique, for login |
| passwordHash | String | bcrypt hash |
| encryptedMasterKey | Text | Master key wrapped with KEK |
| encryptedMasterKeyWithRecovery | Text | Master key wrapped with recovery key |
| salt | String | For KEK derivation |
| recoveryKeySalt | String | For recovery key derivation |
| schemaName | String | User's schema name |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |

**sessions**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| sessionToken | String | SHA-256 hash of token |
| accountId | FK | References accounts.id |
| deviceInfo | Text | Browser/device identifier |
| ipAddress | String | Last known IP |
| userAgent | Text | |
| lastActiveAt | Timestamp | |
| expiresAt | Timestamp | 30 days from creation |
| revokedAt | Timestamp | NULL = active |
| revokedReason | String | password_change, admin_action, user_logout |
| createdAt | Timestamp | |

**schema_counter**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| currentNumber | Integer | Auto-increment for schema naming |
| updatedAt | Timestamp | |

### User Schema (Per-User)

**topics**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| encryptedName | Text | AES-GCM encrypted topic name |
| iv | String | IV for encryptedName |
| nameToken | String | HMAC hash for server-side lookup |
| color | String | Hex color (plaintext) |
| icon | String | Icon identifier (plaintext) |

**entries**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| topicId | FK | References topics.id |
| encryptedContent | Text | AES-GCM encrypted content |
| iv | String | IV for encryptedContent |
| searchTokens | Text[] | HMAC tokens for SSE search |
| customType | String | task, goal, medication, symptom, etc. (plaintext) |
| entryDate | Date | For timeline sorting (plaintext) |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |

**custom_fields**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| entryId | FK | References entries.id |
| encryptedData | Text | AES-GCM encrypted JSON: `{ fieldKey, value }` |
| iv | String | IV for encryptedData |

**entry_relationships**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| entryId | FK | Source entry |
| relatedToId | FK | Target entry |
| relationshipType | String | e.g., "goal_milestone" |
| createdAt | Timestamp | |

**user_settings**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| medicalTopicsEnabled | Boolean | Show medication/symptom types |
| goalsTrackingEnabled | Boolean | Show goal type |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |

**shared_entries**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| entryId | FK | References entries.id |
| shareToken | String | Unique token for sharing |
| expiresAt | Timestamp | Link expiration |
| viewCount | Integer | Access counter |
| createdAt | Timestamp | |

### Database Indexes

```sql
-- Entries
CREATE INDEX idx_entries_date ON entries(entryDate);
CREATE INDEX idx_entries_topic ON entries(topicId);
CREATE INDEX idx_entries_custom_type ON entries(customType);
CREATE INDEX idx_entries_date_type ON entries(entryDate, customType);
CREATE INDEX idx_entries_search_tokens ON entries USING GIN(searchTokens);

-- Topics
CREATE UNIQUE INDEX idx_topics_name_token ON topics(nameToken);

-- Custom fields
CREATE INDEX idx_custom_fields_entry ON custom_fields(entryId);

-- Shared entries
CREATE INDEX idx_shared_token ON shared_entries(shareToken);
CREATE INDEX idx_shared_expires ON shared_entries(expiresAt);

-- Auth
CREATE INDEX idx_accounts_email ON auth.accounts(email);
CREATE INDEX idx_sessions_token ON auth.sessions(sessionToken);
CREATE INDEX idx_sessions_account ON auth.sessions(accountId);
```

---

## Encryption

### Specification

| Parameter | Value |
|-----------|-------|
| Algorithm | AES-256-GCM |
| Key Size | 256 bits |
| IV | 12 bytes, random per encryption |
| Tag Length | 128 bits |
| Key Derivation | PBKDF2-SHA256 |
| Iterations | 100,000 |
| Salt | 32 bytes, random per user |

### Encrypted Fields

| Table | Field | Contains |
|-------|-------|----------|
| topics | encryptedName | Topic name |
| entries | encryptedContent | Journal text |
| custom_fields | encryptedData | JSON with fieldKey and value |

### Plaintext Fields (Required for Queries)

| Table | Field | Purpose |
|-------|-------|---------|
| entries | topicId | Join to topics |
| entries | entryDate | Timeline sorting |
| entries | customType | Type-based routing |
| topics | color, icon | UI display |

### IV Per Row

Each encrypted field has its own IV stored alongside it. Using the same IV twice with the same key breaks AES-GCM security. Fresh IV per encryption operation ensures identical plaintext produces different ciphertext.

---

## Searchable Symmetric Encryption (SSE)

SSE enables server-side search on encrypted data without decryption.

### How It Works

**On Entry Save:**
1. Client encrypts content with AES-GCM
2. Client tokenizes plaintext into keywords
3. Client generates HMAC token for each keyword: `HMAC-SHA256(masterKey, keyword)`
4. Client sends encrypted content + search tokens to server
5. Server stores both (cannot reverse tokens to keywords)

**On Search:**
1. Client generates token for search term: `HMAC-SHA256(masterKey, "searchterm")`
2. Client sends token to server
3. Server matches token against stored searchTokens
4. Server returns matching encrypted entries
5. Client decrypts results

### Topic Lookup

Topics use `nameToken` for server-side lookup:

1. Client generates: `HMAC(masterKey, "topic name")`
2. Server matches against `topics.nameToken`
3. Server returns `encryptedName` + `iv`
4. Client decrypts for display

### What Leaks

| Information | Visible to Server |
|-------------|-------------------|
| Search patterns | Which tokens are queried |
| Result counts | How many entries match |
| Token frequency | How often tokens appear |
| Entry metadata | Dates, custom types, topic IDs |

### What Stays Hidden

- Actual keywords (tokens are one-way HMAC)
- Entry content
- Topic names
- Custom field values

---

## Custom Types and Fields

Chronicles uses a WordPress-style content model. All content lives in `entries`, with type-specific metadata in `custom_fields`.

### Custom Types

| customType | Description | Common Custom Fields |
|------------|-------------|---------------------|
| (null) | Regular journal entry | None |
| task | Task with completion tracking | isCompleted, isAutoMigrating |
| goal | Goal with progress tracking | progressPercentage, goalStatus, targetDate |
| milestone | Goal milestone | orderIndex, isCompleted, completedAt |
| medication | Medication log | medicationStatus, scheduledTime, takenTime, schedule |
| symptom | Symptom log | severity |
| food | Food diary entry | None (content only) |

### Custom Field Structure

Each custom field is stored as an encrypted JSON blob:

```json
{ "fieldKey": "isCompleted", "value": true }
{ "fieldKey": "severity", "value": 7 }
{ "fieldKey": "scheduledTime", "value": "08:00" }
```

### Querying by Type

1. Server filters by `entries.customType` (plaintext)
2. Server returns entries + associated custom_fields (encrypted)
3. Client decrypts and filters by field values

### Feature Toggles

`user_settings` controls which custom types are available:

- `goalsTrackingEnabled`: Shows goal/milestone types
- `medicalTopicsEnabled`: Shows medication/symptom types

Task type is always available.

---

## Recovery Key

Optional recovery mechanism for forgotten passwords.

1. During registration, generate random 256-bit recovery key
2. Encrypt master key with recovery key (separate from password-based encryption)
3. Display recovery key once to user (must save externally)
4. Store `encryptedMasterKeyWithRecovery` on server

**Recovery Flow:**
1. User enters recovery key
2. Client decrypts master key
3. User sets new password
4. Master key re-wrapped with new password-derived KEK

**No Recovery Key + Forgotten Password = Permanent Data Loss**

---

## Session Management

Database-backed sessions enable immediate revocation.

**Session Lifecycle:**
- Created on login with 30-day expiry
- Validated on every request (check `revokedAt IS NULL` and `expiresAt > now()`)
- Revoked on logout, password change, or admin action

**Revocation Events:**

| Event | Action |
|-------|--------|
| User logout | Revoke current session |
| Password change | Revoke all sessions |
| "Sign out everywhere" | Revoke all except current |
| Admin action | Revoke all sessions |

---

## Task Auto-Migration

Incomplete tasks with `isAutoMigrating = true` automatically move to the current date.

**Trigger:** Login or scheduled job

**Process:**
1. Query entries where `customType = 'task'` and `entryDate < today`
2. Fetch and decrypt associated custom_fields
3. Filter where `isCompleted = false` and `isAutoMigrating = true`
4. Update `entryDate` to today

Completed tasks remain on their original date for historical record.

---

## Data Export

Client-side export maintains zero-knowledge:

1. Fetch all encrypted data from user's schema
2. Decrypt everything client-side
3. Format as JSON, CSV, Markdown, or PDF
4. Download to user's device

Server never sees plaintext during export.

---

## Account Deletion

Complete removal of user data:

1. User confirms with email + password
2. `DROP SCHEMA chronicles_xxx CASCADE` (removes all user tables)
3. `DELETE FROM auth.accounts` (removes account record)
4. Session invalidated

Irreversible. No recovery possible after deletion.
