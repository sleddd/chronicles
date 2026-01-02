# Chronicles

A zero-knowledge encrypted journal application with client-side encryption. The server never sees your plaintext data.

## Privacy Guarantees

- All entry content is encrypted in the browser before transmission
- Master encryption key exists only in browser memory (cleared on logout/refresh)
- Recovery key system allows password reset without compromising zero-knowledge design
- Schema-per-user database isolation (not row-level security)

## Features

- **Encrypted Journal Entries** - Rich text editor with client-side encryption
- **Topic Organization** - Categorize entries with custom topics, icons, and colors
- **Goals & Milestones** - Track goals with milestone progress
- **Medical Tracking** - Log medications, symptoms, food, and schedules
- **Calendar View** - Visual overview of entries by date
- **Entry Sharing** - Share specific entries via secure public links
- **Favorites** - Mark and quickly access important entries
- **Mobile Responsive** - Works on desktop and mobile devices

## How It Works

Chronicles is designed as a simple daily log. The core philosophy is to capture the key moments of your day briefly in less than 10-15 minutes, then use topics to organize and find them later.

**Important**: You can only add entries for today or edit past entries. You cannot create entries for future dates. This keeps Chronicles focused as a record of what happened, not a planning tool. However, you can use it to track goals, milestones, events, and ideas.

### Topics

Topics are how you categorize entries. Think of them as tags or folders.

**Creating a Topic:**
1. Click "Browse Topics" in the sidebar
2. Click "+ Add Topic"
3. Enter a name, choose an icon, and pick a color
4. Click "Create Topic"

**Default Topics**: Chronicles comes with several built-in topics that have special functionality:
- **Task** - Todo items with completion tracking
- **Goal** - Long-term objectives with milestone support
- **Milestone** - Checkpoints within goals
- **Medication** - Medication schedules and tracking
- **Food** - Meal logging with ingredients
- **Symptom** - Health symptom tracking with severity
- **Event** - Calendar events with date/time/location
- **Meeting** - Meetings with attendees and agenda

You can create your own topics for anything else (Work, Personal, Ideas, etc.).

### Entries

Entries are the core of Chronicles. Each entry belongs to a topic and contains your encrypted content.

**Creating an Entry:**
1. Select a topic from the sidebar (or use "All Entries")
2. Type your content in the editor
3. Use the toolbar for formatting (bold, italic, headings, lists, etc.)
4. Press Enter or click "Save"

**Entry Features:**
- **Expand Entry** - By default, entries are limited to 200 characters for brevity. Check "Expand entry" for longer notes.
- **Bookmark** - Click the bookmark icon to mark important entries for quick access
- **Share** - Generate a secure public link to share a specific entry (decrypted for viewing)
- **Delete** - Remove entries you no longer need

**Keyboard Shortcuts:**
- `Enter` - Save the entry
- `Shift+Enter` - New line within the entry

### Special Entry Types

When you select certain topics, additional settings appear:

#### Tasks

Tasks are actionable items you need to complete.

- **Completed** - Check when the task is done
- **Auto-migrate if incomplete** - Uncompleted tasks automatically move to the current day at midnight, so they stay visible until done
- **Link to Milestones** - Connect tasks to milestones to track progress toward goals

#### Goals

Goals are larger objectives you're working toward.

- **Type** - Short-term or Long-term
- **Status** - Active, Completed, or Archived
- **Target Date** - Optional deadline
- **Progress** - Automatically calculated from linked milestones

Goals appear in the dedicated Goals view where you can:
- See all goals organized by status
- Drag and drop to reorder priorities
- View milestone progress at a glance

#### Milestones

Milestones are checkpoints within a goal.

- **Link to Goals** - Connect the milestone to one or more goals
- **Linked Tasks** - View all tasks connected to this milestone with completion status

When you complete tasks linked to a milestone, the goal's progress automatically updates.

#### Medications

Track your medication schedule and doses.

- **Dosage** - Amount per dose (e.g., "500mg")
- **Frequency** - Once daily, twice daily, three times daily, as needed, or custom
- **Schedule Times** - Specific times for each dose
- **Notes** - Instructions like "Take with food"
- **Active** - Toggle when starting/stopping a medication

The Medical view shows your medication schedule and lets you log doses when taken.

#### Food

Log meals for dietary tracking or symptom correlation.

- **Meal Type** - Breakfast, lunch, dinner, or snack
- **Time Consumed** - When you ate
- **Ingredients** - Comma-separated list (used for correlation analysis with symptoms)
- **Notes** - Any additional details

#### Symptoms

Track health symptoms with severity.

- **Severity** - Scale of 1-10 (mild to severe)
- **Time Occurred** - When the symptom started
- **Duration** - How long it lasted (in minutes)
- **Notes** - Additional details

The Medical view includes a reporting feature that can correlate symptoms with foods and medications to identify patterns.

#### Events & Meetings

Calendar entries with scheduling details.

- **Start/End Date & Time** - When the event occurs
- **Location/Venue** - Where it takes place
- **Address** - Full address for navigation
- **Phone Contact** - Contact number if needed
- **Notes** - Additional details

Meetings add:
- **Topic** - What the meeting is about
- **Attendees** - Who will be there

Events and meetings appear in the Calendar view.

### Calendar View

The calendar provides a monthly overview of all your entries. Click any day to see entries from that date. Past dates can be edited; future dates cannot have entries added.

### Goals View

A dedicated view for managing goals:

- **Tabs** - Filter by Active, Short-term, Long-term, or All
- **Drag & Drop** - Reorder goals by priority
- **Progress Bars** - Visual progress based on completed milestones
- **Milestone List** - Expand to see all milestones and their status

### Medical View

Comprehensive health tracking dashboard:

- **Medications Tab** - All active medications with schedules
- **Doses Tab** - Log medication doses with timestamps
- **Food Tab** - View food log entries
- **Symptoms Tab** - View symptom log entries
- **Schedule Tab** - Today's medication schedule
- **Reporting Tab** - Analyze correlations between food, medications, and symptoms

### Settings

Access settings from the header menu:

- **Sessions** - View and revoke active sessions on other devices
- **Change Password** - Update your password (master key is re-wrapped, data is not re-encrypted)
- **Feature Toggles** - Enable/disable features like the medical tracker

### Favorites

Bookmarked entries appear in the Favorites section for quick access. Click the bookmark icon on any entry to add/remove it from favorites.

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 15+

### Installation

1. Clone the repository

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables in `.env.local`:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/chronicles"
   NEXTAUTH_SECRET="your-secret-key"
   NEXTAUTH_URL="http://localhost:3000"

   # Required: Restrict registration to specific emails (comma-separated)
   REGISTRATION_WHITELIST="user1@example.com,user2@example.com"
   ```

4. Set up the database:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

## Registration

Registration is currently invite-only. To allow a user to register:

1. Add their email to the `REGISTRATION_WHITELIST` environment variable
2. Users must acknowledge the recovery key requirement
3. Users must agree to Terms of Service

**Password requirements:**
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- Minimum entropy score (resists common patterns and dictionary words)

**Recovery Key:**
At registration, you'll receive a recovery key (formatted as hex with dashes). This key is shown only once - save it securely. If you forget your password, this key is the only way to recover your account.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # Run ESLint
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js with database sessions
- **Encryption**: Web Crypto API (AES-256-GCM)
- **State Management**: Zustand
- **Styling**: Tailwind CSS

## Architecture

### Multi-Tenant Schema-per-User Database

Chronicles uses PostgreSQL with complete schema isolation per user. This is **not** row-level security - each user gets their own PostgreSQL schema with their own tables.

```
PostgreSQL Database
├── auth schema (shared)
│   ├── accounts        # Authentication only (email, passwordHash, wrapped keys)
│   ├── sessions        # Database-backed sessions (enables immediate revocation)
│   └── schema_counter  # Atomic counter for unique schema names
│
├── chronicles_x7k9m2_1 (user 1's isolated schema)
│   ├── topics          # Encrypted topic names
│   ├── entries         # Encrypted journal content
│   ├── custom_fields   # Type-specific metadata (goals, medications, etc.)
│   ├── entry_relationships  # Links between entries (goal → milestones)
│   ├── medications     # Medication tracking
│   ├── medication_doses    # Dose logging
│   ├── symptoms        # Symptom tracking
│   ├── food_entries    # Food/diet logging
│   ├── exercise_entries    # Exercise logging
│   └── favorites       # Favorited entries
│
└── chronicles_p3n8q5_2 (user 2's isolated schema)
    └── ... same tables, completely isolated
```

**Schema naming**: `chronicles_<random_6_char>_<counter>` - NOT derived from user info.

### Client-Server Boundary

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Master Key  │  │  Encrypt/    │  │  Plaintext Data   │  │
│  │ (memory)    │──│  Decrypt     │──│  (user sees)      │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Encrypted Data (ciphertext)             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTPS (encrypted in transit)
┌─────────────────────────────────────────────────────────────┐
│                        SERVER                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │     Only sees: encrypted blobs, wrapped keys,        │   │
│  │     password hashes, session tokens                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              PostgreSQL (encrypted at rest)          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

The server **never** has access to:
- Your password (only bcrypt hash)
- Your master encryption key (only wrapped/encrypted version)
- Your recovery key (only derived key used to wrap master key)
- Your plaintext journal content

## Security

### Encryption

- **Algorithm**: AES-256-GCM with random 12-byte IV per entry
- **Key Derivation**: PBKDF2-SHA256 with 600,000 iterations (OWASP 2023 recommendation)
- **Salt**: 32 bytes random per user
- **Legacy Support**: Automatic migration from 100,000 iterations for existing accounts

### Two-Layer Key Architecture

Chronicles uses a two-layer encryption system that separates authentication from encryption:

1. **Master Key**: A randomly generated AES-256 key that encrypts all your data. This key never leaves your browser in plaintext.

2. **Key Encryption Keys (KEKs)**: Your master key is "wrapped" (encrypted) by two separate keys:
   - **Password-derived KEK**: Derived from your password using PBKDF2. Used for normal login.
   - **Recovery-derived KEK**: Derived from your recovery key. Used for password reset.

**Why this matters:**
- Changing your password only re-wraps the master key (instant operation)
- Your data is never re-encrypted when you change your password
- The server stores only wrapped (encrypted) versions of your master key
- Even with database access, an attacker cannot decrypt your data without your password or recovery key

### Password Recovery Flow

1. Enter your email and recovery key on the forgot password page
2. Your browser fetches the recovery-wrapped master key from the server
3. Your browser unwraps the master key using your recovery key (client-side)
4. You set a new password
5. Your browser wraps the master key with your new password-derived key
6. A new recovery key is generated and displayed (save it!)
7. Server stores the new wrapped keys and password hash

The server never sees your master key, recovery key, or password in plaintext.

### Authentication & Session Security

- **Password Hashing**: bcrypt with automatic cost factor
- **Sessions**: Database-backed sessions with immediate revocation capability
- **Rate Limiting**: Login attempts are rate-limited to prevent brute force attacks
- **Secure Cookies**: HttpOnly, Secure, SameSite=Lax

### Input Sanitization & XSS Prevention

- **Content Security Policy (CSP)**: Strict CSP headers prevent inline scripts and unauthorized resource loading
- **HTML Sanitization**: All user content is sanitized with DOMPurify before rendering
- **Rich Text**: TipTap editor output is sanitized to allow only safe HTML tags and attributes

### Database Isolation

Each user gets their own PostgreSQL schema (e.g., `chronicles_x7k9m2_1`). This provides:
- Complete data isolation between users
- No risk of query bugs leaking data across users
- Easy per-user backup and deletion
- Schema names are random, not derived from user information

## License

© 2025 Claudette Raynor | All Rights Reserved. You may not use this for any commericial purpose. You can download this appliaction for personal use only, but cannot modify it.