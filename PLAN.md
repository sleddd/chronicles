# Chronicles - Encrypted Bullet Journal App

## Project Overview
Build a comprehensive Next.js bullet journal application with client-side encryption where users can create journal entries (text, images, links) organized by topics/tags. Entries are encrypted with a key derived from the user's password, ensuring only they can decrypt their data.

### Key Features Summary
📝 **Quick Note-Taking**: Fast 200-character entries (expandable for creative writing)
📅 **Split-Screen View**: Calendar on left, daily entries on right
✅ **Smart Tasks**: Auto-migrating tasks that move forward until completed
🎯 **Goals Tracking**: Long-term and short-term goals with progress tracking and milestones
💊 **Medical Tracking**: Medications with scheduling, symptoms, medical history (optional)
📊 **Flexible Views**: View entries by all/day/week/month/year, filter by topic
🌤️ **Contextual UI**: Weather and time display, current day highlighted
🤖 **AI Assistance**: Writing help for expanded entries, smart tagging, insights
🔒 **Zero-Knowledge Encryption**: Client-side encryption, no password recovery
📱 **Mobile-Ready**: Responsive web app, clear path to React Native mobile app

## Technology Stack
- **Framework**: Next.js 14+ (App Router) with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js (credentials provider)
- **Encryption**: Web Crypto API (AES-GCM, PBKDF2)
- **Rich Text Editor**: Tiptap
- **Styling**: Tailwind CSS

## Core Features

### Split-Screen Interface
**Left Side: Calendar View**
- Full month calendar grid
- Current day highlighted
- Weather widget at top (current temperature, conditions)
- Time display
- Hamburger menu with:
  - Settings
  - Medical (if enabled)
  - Calendar date picker
- Navigate between months/years

**Right Side: Entry List View**
- Quick entry input (200 char limit by default)
- Type and hit Enter to save immediately
- List of all entries for selected day below
- Each entry shows:
  - Topic badge/icon
  - Content (truncated if > 200 chars)
  - Completion checkbox (for tasks)
  - Expand option (for "expanded writing")
- Carousel navigation (previous/next day arrows)
- View filters: All / Day / Week / Month / Year
- Topic filter dropdown

### Entry Types
1. **Quick Entry** (default): 200 character limit, plain text, fast input
2. **Expanded Writing**: Unlimited characters, rich text editor, for poems/long-form
3. **Voice Entry**: Voice-to-text input option for hands-free entry creation
4. All types support topic tagging and encryption
5. **Shareable Entries**: Option to share specific entries via unique link (decryption key in URL)

### Task Auto-Migration
- **When**: Runs automatically (on login, or via scheduled job at midnight)
- **What**: Moves incomplete auto-migrating tasks from previous days to current date
- **How**: Updates `entryDate` field while preserving all encrypted content
- **User Control**: Users can toggle auto-migration per task, mark tasks complete

### Medical Tracking (Optional Feature)
- **Settings toggle**: Enable/disable medical tracking features
- **Medications**: Track medication list with scheduled times (daily/weekly/monthly)
- **Symptoms**: Track symptoms list for logging
- **Medical History**: Store diagnosis, doctors, hospitals information
- **Auto-generated entries**: Medication schedule creates daily entries with completion checkboxes
- **Visual indicators**: Missed medications highlighted in red with notifications
- **All medical data encrypted**: Medications, symptoms, and history stored securely

### Specialized Views

**Key Philosophy**: Chronicles uses an **entry-first approach**. You don't "manage medications" or "track symptoms" in separate interfaces. Instead, you **create entries** in your daily journal (just like tasks or notes), and the specialized views provide **analytics and visualization** of those entries.

**How It Works**:
1. **Create entries**: Type medication dose, symptom, or food intake as regular journal entries
2. **Special fields**: When topic=medication/symptom, extra fields appear (status, severity, etc.)
3. **Views analyze**: Specialized views query entries and provide charts, compliance tracking, pattern detection

Chronicles provides specialized views for analyzing different types of entries:

#### 1. Goals Management View
**Purpose**: Manage goals, track progress, and edit milestones in one place

**Features**:
- View all goals (filterable by status: not started, in progress, completed, archived, abandoned)
- See goal progress calculated from linked milestones
- Expand goal to show:
  - All linked milestones with completion status
  - Progress bar (auto-calculated from milestone completion)
  - Target date and days remaining
  - Edit goal details inline (title, description, target date, status)
  - Add new milestones directly from goal view
  - Reorder milestones via drag-and-drop
  - Mark milestones complete (auto-updates goal progress)
- Quick actions:
  - Archive completed goals
  - Abandon goals
  - Link existing tasks to goals

#### 2. Symptoms Analytics View
**Purpose**: Track symptom patterns and identify triggers

**How It Works**: Users create symptom entries in their daily journal (with topic=symptom). This view analyzes those entries.

**Features**:
- **List View**: All symptom entries with frequency counts
- **Timeline View**: Symptoms plotted on calendar
- **Filtering & Sorting**:
  - By date range (today, last 7 days, last 30 days, custom range)
  - By specific symptom (select from library)
  - By severity (1-10 scale)
  - Sort by: date, frequency, severity
- **Analytics & Visualizations**:
  - **Bar Chart**: Most frequent symptoms for selected time period
  - **Pie Chart**: Symptom distribution (percentage breakdown)
  - Average severity per symptom (line chart over time)
  - Symptom occurrence by day of week (heatmap)
  - Symptom patterns over time (trend chart)
- **Detail View**: Click symptom to see:
  - All occurrences with dates
  - Severity ratings over time
  - Associated medications taken that day
  - Associated food entries that day
  - Associated events that day

**Note**: Symptoms are created as regular journal entries with topic="symptom". This view provides analytics over those entries.

#### 3. Medications Analytics & Compliance View

**How It Works**: Users create medication entries in their daily journal (with topic=medication). Each entry has status: taken/missed/skipped and timestamps. This view provides analytics and compliance tracking.

**Entry Fields** (when creating a medication entry):
- Content: Medication name (encrypted)
- Status: taken | missed | skipped (stored as `medicationStatus`)
- Scheduled time (when it should be taken)
- Taken time (when it was actually taken, if status=taken)
- Schedule metadata (daily at 8am, weekly on Mon/Wed/Fri, etc.)

**Analytics & Visualizations**:

**3a. Compliance Chart**
- **Line Chart**: Adherence rate over time (% of doses taken on time)
- **Bar Chart**: Adherence by medication (shows which meds are taken consistently)
- **Calendar Heatmap**: Visual representation of adherence patterns
  - Green = taken, Red = missed, Yellow = skipped, Gray = no dose scheduled
- Date range selector (last 7 days, last 30 days, last 90 days, custom)

**3b. Medication Schedule View**
- **Day View**: Today's medication entries grouped by scheduled time
  - Time-based list (8am, 2pm, 8pm, etc.)
  - Each entry shows: Name | Status | Taken time (if applicable)
  - Visual indicators: ✓ taken, ⊗ missed, ⊘ skipped
- **Week View**: 7-day grid
  - Rows: Medications (unique names from entries)
  - Columns: Days of week
  - Cells show status indicator
  - Click cell to see entry details
- **Month View**: Monthly calendar
  - Each day shows count of: taken/missed/skipped
  - Click day for detailed list

**3c. Statistics Dashboard**
- Overall adherence rate (% taken on time)
- Per-medication adherence rates
- Most commonly missed medications
- Best/worst adherence times
- Streak tracking (consecutive days with 100% adherence)

**Note**: Medications are journal entries with special fields. No separate "medication management" UI - you log medications like any other entry, then analyze them in this view.

#### 4. Correlation View (Cross-Feature Analysis)
**Purpose**: Identify patterns and relationships between symptoms, medications, food, and events

**Features**:
- **Day Detail View**: See everything that happened on a specific day:
  - All symptoms logged (with severity)
  - All medications taken (with times)
  - All food entries (meals)
  - All events
  - Regular journal entries
- **Pattern Detection**:
  - "Did symptom X occur more often when taking medication Y?"
  - "What foods were eaten on days with high symptom severity?"
  - "What events coincided with symptom flare-ups?"
- **Filters**:
  - Select specific symptoms to track
  - Select specific medications
  - Date range selector
  - Topic filters (food, event, symptom, medication)
- **Visualization**:
  - Timeline showing all entry types
  - Color-coded by topic
  - Severity/intensity indicators
  - Cluster view showing correlations

#### 5. Food Diary View
**Purpose**: Track dietary intake and identify food-related patterns

**Features**:
- List of all food entries by date
- Search/filter by food item
- Group by meal type (breakfast, lunch, dinner, snack)
- View food intake for specific date ranges
- See food entries alongside symptoms (correlation)
- Export food diary for sharing with healthcare providers

#### 6. Journal Usage Guide View
**Purpose**: Help users get the most out of their journaling practice

**Features**:
- **How to Use This Journal**: Step-by-step guide
  - Best practices for daily journaling
  - How to use topics effectively
  - When to use quick entries vs expanded writing
  - Tips for task auto-migration
- **Medical Tracking Best Practices**:
  - How to log symptoms effectively
  - Setting up medication schedules
  - Using the correlation view to find patterns
  - Preparing data for healthcare appointments
- **Goals Tracking Guide**:
  - Setting effective goals
  - Breaking goals into milestones
  - Tracking progress
  - When to archive vs abandon
- **Privacy & Security Tips**:
  - Understanding encryption
  - Backup strategies
  - Password management
  - Export your data
- **Quick Reference**:
  - Keyboard shortcuts
  - Topic icons reference
  - Entry type comparisons
  - View mode explanations

**Implementation Note**: This view should be accessible from:
- Hamburger menu → "How to Use"
- Settings → "Guide"
- First-time user onboarding flow

## Core Architecture Decisions

### 1. Multi-Tenant Architecture (WordPress Multisite Style)
- **Schema-per-user isolation**: Each user gets their own PostgreSQL schema
- **Global users table**: Single `public.users` table for authentication
- **Auto-incrementing schema naming**: `chronicles_<number>` (e.g., chronicles_1, chronicles_2) to prevent collisions
- **Schema counter table**: `public.schema_counter` tracks the next available schema number
- **Dynamic schema creation**: On user registration, atomically increment counter and create schema
- **Connection management**: Prisma multi-schema support or dynamic connection switching
- **Benefits**: Database-level isolation, easier data export per user, true multi-tenancy, guaranteed unique schemas
- **Trade-offs**: More complex migrations, need to manage multiple schemas

### 2. Two-Layer Security Model with Master Key Architecture
- **Authentication Layer**: bcrypt password hashing (server validates login)
- **Encryption Layer**: Auto-generated 256-bit master key, encrypted with password-derived KEK
- Password for authentication only - encryption uses independent master key
- **Key Benefits**: Instant password changes, optional key rotation

### 3. Client-Side Encryption Strategy
- **Master Key**: Random 256-bit key generated at registration
- **KEK (Key Encryption Key)**: Derived from password + salt via PBKDF2 (100k iterations)
- **Storage**: Master key encrypted with KEK, stored as `encryptedMasterKey` in database
- **Runtime**: Master key decrypted at login, kept in browser memory only
- All entry content encrypted with master key (not password-derived key)
- Server stores encrypted blobs, cannot decrypt

### 4. Critical User Constraint
⚠️ **No password recovery possible** - if user forgets password, all data is permanently lost
- Master key is encrypted with password-derived KEK
- Without password, cannot decrypt master key
- Prominent warnings during registration
- Export functionality critical for backups

### 5. Password Change Strategy (Instant)
With master key architecture, password changes are instant - no data re-encryption needed.

#### Password Change Flow:
```typescript
// 1. User provides OLD password and NEW password
// 2. Verify old password (authenticate)
// 3. Fetch encryptedMasterKey + salt
// 4. Derive OLD KEK from old password + salt
// 5. Decrypt master key with OLD KEK
// 6. Generate NEW salt
// 7. Derive NEW KEK from new password + new salt
// 8. Re-encrypt master key with NEW KEK
// 9. Update: passwordHash + salt + encryptedMasterKey (single atomic update)
```

#### Why This is Better:
- ⚡ **Instant operation** - re-encrypts 1 key, not thousands of entries
- ✅ **No progress bars** - completes in < 100ms
- ✅ **No session timeout issues**
- ✅ **No rollback complexity** - single atomic UPDATE
- ✅ **Users can change passwords frequently**

#### Critical Files for Password Change:
- `src/app/api/user/change-password/route.ts` - Password change endpoint (master key re-wrap)
- `src/lib/crypto/keyManagement.ts` - Master key encryption/decryption
- `src/components/settings/ChangePasswordModal.tsx` - Password change UI

---

### 6. Master Key Rotation (Optional Security Feature)
Users can rotate their master encryption key on-demand for security.

#### Key Rotation Flow:
```typescript
// 1. User clicks "Rotate Encryption Key" (in settings)
// 2. Confirm + enter password
// 3. Decrypt current master key
// 4. Fetch ALL encrypted data
// 5. Decrypt with OLD master key
// 6. Generate NEW master key (256-bit random)
// 7. Re-encrypt all data with NEW master key
// 8. Encrypt NEW master key with KEK (same password)
// 9. Atomic update: encryptedMasterKey + all re-encrypted data
```

#### When to Rotate:
- Suspected key compromise
- Compliance requirements
- Paranoia (valid reason!)

#### Implementation:
- Time-intensive (minutes for thousands of entries)
- Progress indicator required
- Separate from password change (different operation)

#### Critical Files for Key Rotation:
- `src/app/api/keys/rotate/route.ts` - Key rotation endpoint
- `src/lib/crypto/reencryption.ts` - Batch re-encryption utilities
- `src/components/settings/RotateKeyDialog.tsx` - Key rotation UI

---

### 7. Data Export Functionality

**WHY:** Users need to back up their data and comply with data portability requirements (GDPR).

**Features:**
- Client-side decryption and export (maintains zero-knowledge architecture)
- Multiple export formats:
  - **JSON** - Complete backup with all metadata (recommended for backup)
  - **CSV** - Spreadsheet format for Excel/Google Sheets
  - **Markdown** - Human-readable format organized by date
  - **PDF** - Printable archive suitable for healthcare providers
- Export options:
  - All data (complete backup)
  - Date range filtering
  - Topic filtering
- Progress indicator for large exports
- No server-side plaintext exposure

#### Export Flow:
```typescript
// 1. User clicks "Export Data" in settings
// 2. Select format (JSON/CSV/Markdown/PDF) and filters
// 3. Fetch all encrypted data from user's schema
// 4. Decrypt all entries client-side with encryption key
// 5. Format data according to selected export format
// 6. Generate and download file (e.g., chronicles_export_2025-01-15.json)
```

#### Critical Files for Export:
- `src/app/api/export/all/route.ts` - Fetches all encrypted data
- `src/lib/export/formats.ts` - Export format generators (JSON, CSV, MD, PDF)
- `src/components/settings/ExportDataModal.tsx` - Export UI

---

### 8. Account Deletion & Schema Cleanup

**WHY:** Users have right to delete their data (GDPR compliance) and free up database resources.

**Features:**
- Complete account and data deletion
- Pre-deletion export prompt (encourage users to backup first)
- Multi-step confirmation:
  - Type email address to confirm
  - Enter current password to verify ownership
  - Checkbox: "I understand this is permanent and irreversible"
- Atomic deletion (transaction wraps schema drop + user record deletion)
- Immediate session invalidation

#### What Gets Deleted:
- User's entire PostgreSQL schema (`chronicles_<number>`)
- All tables: entries, topics, symptoms_library, entry_relationships, user_settings, shared_entries
- User record from `public.users` table
- All session tokens (force logout)
- All shared entry tokens (invalidates shared links)

#### What Does NOT Get Deleted:
- Schema counter (maintains sequence for future users)
- Anonymized application logs
- Anonymized analytics data

#### Deletion Flow:
```typescript
// 1. User navigates to Settings → Delete Account
// 2. Show warning: "This is PERMANENT and IRREVERSIBLE"
// 3. Prompt: "Export your data first?" [Export] [Skip]
// 4. User types email to confirm
// 5. User enters password to verify
// 6. User checks "I understand" checkbox
// 7. API verifies credentials
// 8. DROP SCHEMA chronicles_<number> CASCADE
// 9. DELETE FROM public.users WHERE id = userId
// 10. Invalidate session and redirect to homepage
```

#### Critical Files for Account Deletion:
- `src/app/api/user/delete/route.ts` - Account deletion endpoint
- `src/components/settings/DeleteAccountDialog.tsx` - Deletion UI with warnings

---

## Database Schema (Multi-Tenant Architecture)

### Schema Structure
```
PostgreSQL Database
├── public schema (global)
│   ├── users table (authentication only)
│   └── schema_counter table (auto-incrementing schema number tracking)
├── chronicles_1 schema (isolated per user)
│   ├── entries table (all journal entries)
│   ├── topics table (including special topics: medication, symptom, doctor, hospital, goal, milestone)
│   ├── user_settings table
│   ├── symptoms_library table (reusable symptom definitions)
│   └── entry_relationships table (links entries to goals/milestones)
├── chronicles_2 schema (isolated per user)
│   └── ... (same structure)
└── chronicles_3 schema (isolated per user)
    └── ... (same structure)
```

**Key Architectural Change:**
Instead of separate tables for medications, goals, milestones, etc., everything is an **Entry** with a **Topic** that determines its special functionality. This creates a unified, flexible system.

### Global Schema: public.users
**Location**: `public` schema (shared across all users)
```prisma
model User {
  id                  String   @id @default(cuid())
  email               String   @unique
  passwordHash        String   // bcrypt for authentication
  encryptedMasterKey  String   @db.Text // Master key encrypted with password-derived KEK
  salt                String   // Random salt for KEK derivation
  schemaName          String   // e.g., "chronicles_42"
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@map("users")
  @@schema("public")
}
```

**Key Fields:**
- `passwordHash`: bcrypt hash for authentication (server-side validation)
- `encryptedMasterKey`: 256-bit random master key, encrypted with KEK derived from password
- `salt`: Used to derive KEK from password (PBKDF2, 100k iterations)
- `schemaName`: User's isolated PostgreSQL schema (e.g., "chronicles_42")

### User-Specific Schema: user_<userId>.entries
**Location**: `user_<userId>` schema (isolated per user)
```prisma
model Entry {
  id                String   @id @default(cuid())
  encryptedContent  String   @db.Text
  iv                String   // initialization vector
  topicId           String   // foreign key to topics (determines special functionality)
  entryDate         DateTime // date this entry belongs to
  isExpandedWriting Boolean  @default(false)

  // Task-specific fields (when topicId = "task")
  isCompleted       Boolean  @default(false)
  isAutoMigrating   Boolean  @default(false)

  // Goal/Milestone-specific fields (when topicId = "goal" or "milestone")
  progressPercentage Int?    // For goals: 0-100
  targetDate        DateTime? // For goals: target completion date
  goalStatus        String?  // "not_started" | "in_progress" | "completed" | "archived" | "abandoned"

  // Medication-specific fields (when topicId = "medication")
  schedule          Json?    // {frequency: "daily", times: ["08:00", "20:00"], daysOfWeek: [1,3,5]}
  scheduledTime     DateTime? // For individual medication dose entries
  takenTime         DateTime? // When medication was actually taken
  medicationStatus  String?  // "pending" | "taken" | "missed" | "skipped"

  // Symptom-specific fields (when topicId = "symptom")
  symptomId         String?  // FK to symptoms_library for reusable symptoms
  severity          Int?     // 1-10 scale

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@map("entries")
  @@schema("user") // Will be dynamically set
}
```

**Note**:
- No userId field needed - schema isolation provides separation
- No separate title field - content-only
- Special fields are nullable and only used when relevant to the topic type
- This unified approach allows entries to have topic-specific metadata without separate tables

### User-Specific Schema: user_<userId>.topics
```prisma
model Topic {
  id            String   @id @default(cuid())
  name          String   @unique
  color         String   @default("#6366f1")
  icon          String?
  isDefault     Boolean  @default(false)
  isSpecial     Boolean  @default(false) // true for medication, symptom, goal, milestone, doctor, hospital
  specialType   String?  // "medication" | "symptom" | "goal" | "milestone" | "doctor" | "hospital" | "task"
  isEnabled     Boolean  @default(true)  // Can be disabled in settings
  createdAt     DateTime @default(now())

  @@map("topics")
  @@schema("user")
}
```

**Default Topics** (seeded on user registration):
- **task** (specialType: "task", isSpecial: true, isDefault: true, cannot be deleted)
- **idea** (specialType: null, isSpecial: false)
- **research** (specialType: null, isSpecial: false)
- **event** (specialType: null, isSpecial: false)
- **meeting** (specialType: null, isSpecial: false)
- **food** (specialType: null, isSpecial: false, isDefault: true) - For tracking meals and dietary intake

**Optional Special Topics** (enabled via settings):
- **medication** (specialType: "medication", isSpecial: true, isEnabled: false by default)
- **symptom** (specialType: "symptom", isSpecial: true, isEnabled: false by default)
- **doctor** (specialType: "doctor", isSpecial: true, isEnabled: false by default)
- **hospital** (specialType: "hospital", isSpecial: true, isEnabled: false by default)
- **goal** (specialType: "goal", isSpecial: true, isEnabled: false by default)
- **milestone** (specialType: "milestone", isSpecial: true, isEnabled: false by default)

### UserSettings Table
```prisma
model UserSettings {
  id                      String   @id @default(cuid())
  medicalTopicsEnabled    Boolean  @default(false) // Enables medication, symptom, doctor, hospital topics
  goalsTrackingEnabled    Boolean  @default(false) // Enables goal and milestone topics
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@map("user_settings")
  @@schema("user")
}
```

### SymptomsLibrary Table
```prisma
model SymptomLibrary {
  id                   String   @id @default(cuid())
  encryptedName        String   @db.Text
  encryptedDescription String?  @db.Text
  iv                   String   // initialization vector
  color                String   @default("#ef4444")
  usageCount           Int      @default(0) // How many times this symptom has been used
  createdAt            DateTime @default(now())

  @@map("symptoms_library")
  @@schema("user")
}
```

**Purpose**: Reusable symptom definitions. When a user creates a symptom entry, they can either:
- Select from existing symptoms library (auto-complete)
- Create a new symptom (which gets added to library for future reuse)

### EntryRelationships Table
```prisma
model EntryRelationship {
  id              String   @id @default(cuid())
  entryId         String   // The entry being linked (e.g., a task, milestone, or regular entry)
  relatedToId     String   // The entry it's related to (e.g., a goal)
  relationshipType String  // "milestone_of_goal" | "task_for_goal" | "supports_goal"
  createdAt       DateTime @default(now())

  @@unique([entryId, relatedToId, relationshipType])
  @@map("entry_relationships")
  @@schema("user")
}
```

**Purpose**: Links entries to each other, especially:
- Milestones to Goals: `relationshipType = "milestone_of_goal"`
- Tasks to Goals: `relationshipType = "task_for_goal"`
- Any entry supporting a goal: `relationshipType = "supports_goal"`

**Example**: A milestone entry (topicId="milestone") can be linked to a goal entry (topicId="goal") via this table.

---

## Special Topics Functionality

### How Special Topics Work

**Core Concept**: Instead of having separate database tables for goals, medications, symptoms, milestones, doctors, and hospitals, Chronicles uses a **unified entries table** where the `topicId` determines what special features and UI elements are available.

All entries use the same `entries` table, but **special topics** unlock additional UI and functionality based on the `topic.specialType` field.

**Key Benefits**:
- ✅ **Unified data model**: One table for all content simplifies queries and encryption
- ✅ **Flexible categorization**: Any entry can be re-categorized by changing topic
- ✅ **Extensible**: New special topic types can be added without schema changes
- ✅ **Progressive disclosure**: Optional features (medical, goals) only appear when enabled
- ✅ **Simpler re-encryption**: All encrypted content in one table

**How It Works**:
1. Every entry has a `topicId` that references the `topics` table
2. Topics have a `specialType` field (`null` for regular topics, or a specific type like "task", "goal", etc.)
3. When the UI renders an entry, it checks the topic's `specialType` to determine which fields and controls to show
4. Special fields in the `entries` table are `NULL` unless the entry's topic requires them

### Special Topic Types

#### 1. **Task Topic** (specialType: "task")
- **Always enabled**, cannot be disabled
- **Special Fields Used**: `isCompleted`, `isAutoMigrating`
- **UI Features**:
  - Checkbox to mark complete
  - Toggle for auto-migration to current day
  - Red highlight if incomplete from previous days
- **Behavior**: Auto-migrates to current day if `isAutoMigrating = true` and `isCompleted = false`

#### 2. **Medication Topic** (specialType: "medication")
- **Enabled via Settings**: `medicalTopicsEnabled = true`
- **Special Fields Used**: `schedule`, `scheduledTime`, `takenTime`, `medicationStatus`
- **UI Features**:
  - Schedule configuration modal (daily/weekly/monthly + times)
  - Auto-generates daily entries based on schedule
  - Mark as taken/missed/skipped
  - Visual indicators: red for missed, green for taken
- **Behavior**: Creates scheduled entries automatically each day

#### 3. **Symptom Topic** (specialType: "symptom")
- **Enabled via Settings**: `medicalTopicsEnabled = true`
- **Special Fields Used**: `symptomId`, `severity`
- **UI Features**:
  - Autocomplete from `symptoms_library`
  - Severity slider (1-10)
  - Quick-add previously used symptoms
- **Behavior**: Builds symptom library for easy reuse

#### 4. **Doctor Topic** (specialType: "doctor")
- **Enabled via Settings**: `medicalTopicsEnabled = true`
- **Special Fields Used**: None (standard entry)
- **UI Features**:
  - Standard entry with date
  - Can link to medical history
- **Behavior**: Standard entry, categorized as doctor visit

#### 5. **Hospital Topic** (specialType: "hospital")
- **Enabled via Settings**: `medicalTopicsEnabled = true`
- **Special Fields Used**: None (standard entry)
- **UI Features**:
  - Standard entry with date
  - Can link to medical history
- **Behavior**: Standard entry, categorized as hospital visit

#### 6. **Goal Topic** (specialType: "goal")
- **Enabled via Settings**: `goalsTrackingEnabled = true`
- **Special Fields Used**: `progressPercentage`, `targetDate`, `goalStatus`
- **UI Features**:
  - Progress bar (0-100%)
  - Target date picker
  - Status dropdown (not started, in progress, completed, archived, abandoned)
  - Milestones list (linked via `entry_relationships`)
  - Auto-calculated progress from linked milestones
- **Behavior**: Progress updates when linked milestones are completed

#### 7. **Milestone Topic** (specialType: "milestone")
- **Enabled via Settings**: `goalsTrackingEnabled = true`
- **Special Fields Used**: `isCompleted`
- **UI Features**:
  - Checkbox to mark complete
  - Link to parent goal
  - Order/sequence indicator
- **Behavior**: When completed, triggers parent goal progress recalculation

### Linking Entries

**Any entry can be linked to a goal** using the `entry_relationships` table:

```typescript
// Example: Link a task to a goal
{
  entryId: "task_abc123",           // A task entry
  relatedToId: "goal_xyz789",       // The goal it supports
  relationshipType: "task_for_goal" // The relationship type
}

// Example: Link a milestone to a goal
{
  entryId: "milestone_def456",         // A milestone entry
  relatedToId: "goal_xyz789",          // The goal it belongs to
  relationshipType: "milestone_of_goal" // The relationship type
}
```

### Settings Toggle Behavior

When a user enables **Medical Topics** in settings:
1. System creates/enables medication, symptom, doctor, hospital topics (if not already exist)
2. Topics appear in topic selector
3. Special UI components activate for those topics

When a user enables **Goals Tracking** in settings:
1. System creates/enables goal and milestone topics
2. Topics appear in topic selector
3. Goal management UI becomes available

**Disabling** a feature:
- Sets `topic.isEnabled = false`
- Hides topics from topic selector
- Existing entries remain in database (not deleted)
- Can be re-enabled later without data loss

---

## Architecture Decision: Why Special Topics Instead of Separate Tables?

### The Traditional Approach (❌ Rejected)
```
❌ Separate tables:
- goals table (id, encryptedTitle, encryptedDescription, iv, progressPercentage, targetDate...)
- milestones table (id, goalId, encryptedTitle, iv, isCompleted...)
- medications table (id, encryptedName, iv, schedule, scheduledTime...)
- symptoms table (id, encryptedName, iv, severity...)
- doctors table (id, encryptedName, iv...)
- hospitals table (id, encryptedName, iv...)
- tasks table (id, encryptedContent, iv, isCompleted, isAutoMigrating...)
- journal_entries table (id, encryptedContent, iv, topicId...)
```

**Problems with this approach:**
- 🔴 **Data fragmentation**: Content scattered across 8+ tables
- 🔴 **Complex queries**: Need UNION queries to show all entries for a day
- 🔴 **Difficult re-encryption**: Password change requires iterating 8+ tables
- 🔴 **Rigid schema**: Adding new features requires new tables and migrations
- 🔴 **Redundant fields**: Every table needs encryptedContent, iv, createdAt, updatedAt
- 🔴 **Export complexity**: Must export from multiple tables and merge

### The Special Topics Approach (✅ Chosen)
```
✅ Unified architecture:
- entries table (all content with conditional special fields)
- topics table (defines which special features each topic has)
- entry_relationships table (links related entries like goals→milestones)
- symptoms_library table (reusable symptom definitions)
```

**Mental Model - Like WordPress:**

This is similar to how WordPress works:
- **Entry = Post**: All content (blog posts, pages, media) stored in `wp_posts`
- **Topic = Category**: Categorizes and adds special functionality
- **Special Fields = Post Meta**: Type-specific metadata
- **Difference**: Chronicles stores metadata as columns (faster), not separate meta table

| Chronicles | WordPress | Purpose |
|-----------|-----------|---------|
| entries | wp_posts | All content in one table |
| topics | wp_terms | Categories/taxonomies |
| Special fields | wp_postmeta | Type-specific data |
| specialType | Custom post type | Defines behavior |

**Why this is better:**
- ✅ **Single source of truth**: All content in one `entries` table
- ✅ **Simpler queries**: `SELECT * FROM entries WHERE entryDate = '2025-01-15'` gets everything
- ✅ **Easy re-encryption**: One loop through `entries` table + `symptoms_library`
- ✅ **Flexible schema**: New special topic types need no migration (just add new specialType value)
- ✅ **DRY principle**: Shared fields (encryptedContent, iv, timestamps) defined once
- ✅ **Easy export**: Single table dump for all user content
- ✅ **Natural filtering**: `WHERE topicId IN (...)` filters by feature set
- ✅ **Cross-feature relationships**: Goals can link to tasks, milestones, or any entry type
- ✅ **Better than WordPress**: Metadata as columns (no JOINs), encrypted content, type-safe validation

### Real-World Example

**User workflow with special topics:**
```typescript
// 1. User enables Goals Tracking in settings
//    → topics table: goal and milestone topics set isEnabled = true

// 2. User creates a goal entry
POST /api/entries {
  topicId: "topic_goal",              // References special goal topic
  encryptedContent: "encrypted...",    // Goal title + description
  progressPercentage: 0,               // Goal-specific field
  goalStatus: "not_started",           // Goal-specific field
  targetDate: "2025-12-31"             // Goal-specific field
}

// 3. User creates milestone entries
POST /api/entries {
  topicId: "topic_milestone",          // References special milestone topic
  encryptedContent: "encrypted...",    // Milestone title
  isCompleted: false                   // Milestone-specific field
}

// 4. User links milestone to goal
POST /api/relationships {
  entryId: "milestone_123",
  relatedToId: "goal_456",
  relationshipType: "milestone_of_goal"
}

// 5. User views daily entries - gets goals, milestones, tasks, notes all in one query
GET /api/entries?date=2025-01-15
// Returns: All entries for that date, UI checks topic.specialType to render appropriately
```

### Field Usage Matrix

| Entry Type | encryptedContent | topicId | isCompleted | isAutoMigrating | progressPercentage | goalStatus | schedule | symptomId | severity |
|-----------|-----------------|---------|-------------|-----------------|-------------------|-----------|----------|-----------|----------|
| **Regular Entry** | ✓ | ✓ | - | - | - | - | - | - | - |
| **Task** | ✓ | ✓ | ✓ | ✓ | - | - | - | - | - |
| **Goal** | ✓ | ✓ | - | - | ✓ | ✓ | - | - | - |
| **Milestone** | ✓ | ✓ | ✓ | - | - | - | - | - | - |
| **Medication** | ✓ | ✓ | - | - | - | - | ✓ | - | - |
| **Symptom** | ✓ | ✓ | - | - | - | - | - | ✓ | ✓ |
| **Doctor/Hospital** | ✓ | ✓ | - | - | - | - | - | - | - |

**Legend**: ✓ = Always used, - = NULL (not used for this type)

### Migration from Traditional to Special Topics

If you started with separate tables and want to migrate:

```sql
-- Example: Migrate goals table to entries table
INSERT INTO entries (id, encryptedContent, iv, topicId, entryDate, progressPercentage, goalStatus, targetDate)
SELECT
  g.id,
  g.encryptedTitle || ' | ' || g.encryptedDescription AS encryptedContent,
  g.iv,
  'topic_goal' AS topicId,
  g.createdAt AS entryDate,
  g.progressPercentage,
  g.status AS goalStatus,
  g.targetDate
FROM goals g;

-- Then drop old table
DROP TABLE goals;
```

---

## Implementation Phases

### Phase 1: Project Foundation (Week 1)
**Goal**: Set up development environment and multi-tenant infrastructure

#### Tasks:
1. Initialize Next.js project with TypeScript and Tailwind CSS
2. Install dependencies:
   - Database: `@prisma/client`, `prisma`
   - Auth: `next-auth`, `@auth/prisma-adapter`, `bcryptjs`
   - Editor: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link`
   - Utilities: `zod`, `date-fns`, `pg` (PostgreSQL client for schema management)
3. **Configure Multi-Tenant Prisma Setup:**
   - Create `public` schema with Users model
   - Create template schema structure for user-specific tables
   - Setup Prisma with multi-schema support
4. **Build Schema Management System:**
   - Schema creator utility (`src/lib/db/schemaManager.ts`)
     - Function to create new user schema
     - Function to run migrations on user schema
     - Function to seed default topics for new user
   - Migration templates for user schemas
5. Run initial migration for `public.users` table
6. Setup environment variables

#### Multi-Tenant Implementation Details:
```typescript
// Registration flow:
// 1. Create user in public.users
// 2. Generate schemaName (e.g., "user_abc123")
// 3. Execute: CREATE SCHEMA user_abc123
// 4. Run migrations on new schema (create all tables)
// 5. Seed default topics in new schema
// 6. Store schemaName in users.schemaName field

// Query flow:
// 1. User authenticates → get userId from session
// 2. Fetch user.schemaName from public.users
// 3. Set Prisma schema context to user's schema
// 4. All queries automatically scoped to user's schema
```

#### Key Files:
- `package.json` - Project dependencies
- `prisma/schema.prisma` - Multi-schema database models
- `src/lib/db/schemaManager.ts` - Schema creation and management
- `src/lib/db/prisma.ts` - Prisma client with schema context
- `.env.local` - Environment configuration
- `next.config.js` - Next.js configuration
- `tailwind.config.ts` - Styling configuration

### Phase 2: Authentication System (Week 1-2)
**Goal**: Implement user registration and login with NextAuth.js

#### Tasks:
1. Create Prisma client singleton (`src/lib/db/prisma.ts`)
2. Configure NextAuth.js with credentials provider (`src/lib/auth/authOptions.ts`)
3. Create NextAuth API route (`src/app/api/auth/[...nextauth]/route.ts`)
4. Build registration API endpoint (`src/app/api/user/register/route.ts`)
   - Validate email and password strength
   - Hash password with bcrypt
   - Generate random salt for encryption
   - **Create user in public.users table**
   - **Generate unique schema name (user_<userId>)**
   - **Create new PostgreSQL schema for user**
   - **Run migrations on user schema (create all tables)**
   - **Seed default topics in user schema**
   - Store schema name in user record
5. Build salt retrieval endpoint (`src/app/api/user/salt/route.ts`)
6. Create registration page with password warning (`src/app/(auth)/register/page.tsx`)
7. Create login page (`src/app/(auth)/login/page.tsx`)
8. Setup middleware for route protection (`src/middleware.ts`)
9. **Build password change functionality:**
   - Password change API endpoint (`src/app/api/user/change-password/route.ts`)
   - Re-encryption utilities (`src/lib/crypto/reencryption.ts`)
   - Change password modal (`src/components/settings/ChangePasswordModal.tsx`)
   - Batch re-encryption with progress tracking
   - Rollback mechanism if re-encryption fails

#### Key Features:
- Prominent "no password recovery" warning during registration
- Email/password validation
- Secure session management with JWT
- **Password change with full data re-encryption**

#### Critical Files:
- `src/lib/auth/authOptions.ts` - NextAuth configuration
- `src/app/api/auth/[...nextauth]/route.ts` - Auth handlers
- `src/app/api/user/register/route.ts` - Registration endpoint
- `src/app/api/user/salt/route.ts` - Salt retrieval for key derivation
- `src/app/api/user/change-password/route.ts` - Password change with re-encryption
- `src/lib/crypto/reencryption.ts` - Re-encryption batch processing
- `src/app/(auth)/register/page.tsx` - Registration UI
- `src/app/(auth)/login/page.tsx` - Login UI
- `src/components/settings/ChangePasswordModal.tsx` - Password change UI

### Phase 3: Encryption Infrastructure (Week 2)
**Goal**: Build client-side encryption system

#### Tasks:
1. Implement PBKDF2 key derivation (`src/lib/crypto/keyDerivation.ts`)
   - Derive 256-bit AES-GCM key from password + salt
   - 100,000 iterations for security
2. Implement AES-GCM encryption/decryption (`src/lib/crypto/encryption.ts`)
   - Generate random IV for each encryption
   - Return base64 encoded data
3. Create encryption React hook (`src/lib/hooks/useEncryption.ts`)
   - Store key in memory (not localStorage)
   - Provide encrypt/decrypt methods
   - Handle key derivation on login
4. Create encryption context provider
5. Add password re-entry modal for page refresh

#### Key Features:
- Web Crypto API for browser-native encryption
- Encryption key only in memory (lost on refresh)
- Automatic re-authentication prompt

#### Critical Files:
- `src/lib/crypto/keyDerivation.ts` - PBKDF2 implementation
- `src/lib/crypto/encryption.ts` - AES-GCM encrypt/decrypt
- `src/lib/hooks/useEncryption.ts` - React encryption hook
- `src/components/auth/PasswordWarning.tsx` - Warning modal

### Phase 4: Topics System (Week 2)
**Goal**: Allow users to manage entry topics/tags with special task functionality

#### Tasks:
1. Create Prisma seed script for default topics (`prisma/seed.ts`)
   - idea, research, event, meeting, task (task cannot be deleted)
2. Build topics API endpoints:
   - GET `/api/topics` - List all (default + user custom)
   - POST `/api/topics` - Create custom topic
   - PUT `/api/topics/[id]` - Update topic
   - DELETE `/api/topics/[id]` - Delete (prevent deletion of "task" topic specifically)
3. Create TopicManager component (`src/components/topics/TopicManager.tsx`)
4. Create TopicBadge component (`src/components/topics/TopicBadge.tsx`)
5. Create TopicSelector component (`src/components/topics/TopicSelector.tsx`)
6. Build topics management page (`src/app/(dashboard)/topics/page.tsx`)

#### Key Features:
- 5 default topics (idea, research, event, meeting, task)
- **"Task" topic is special**: Cannot be deleted, has extra functionality
- Users can add custom topics with colors and icons
- Visual topic badges throughout UI

#### Critical Files:
- `prisma/seed.ts` - Default topics seeding
- `src/app/api/topics/route.ts` - Topics CRUD
- `src/components/topics/TopicManager.tsx` - Topic management UI
- `src/components/topics/TopicSelector.tsx` - Select topic for entry

### Phase 5: Split-Screen Journal UI (Week 2-3)
**Goal**: Build the main split-screen interface with calendar and entry views

#### Tasks:
1. **Build Left Side - Calendar View:**
   - CalendarGrid component (`src/components/calendar/CalendarGrid.tsx`)
     - Month view with clickable dates
     - Highlight current day
     - Show dots/indicators for days with entries
   - WeatherWidget component (`src/components/weather/WeatherWidget.tsx`)
     - Integrate OpenWeather API or similar
     - Show current temp and conditions
     - Weather API endpoint (`src/app/api/weather/route.ts`)
   - TimeDisplay component (`src/components/ui/TimeDisplay.tsx`)
   - HamburgerMenu component (`src/components/nav/HamburgerMenu.tsx`)
     - Settings link
     - Medical link (conditional)
     - Date picker modal

2. **Build Right Side - Entry View:**
   - QuickEntryInput component (`src/components/journal/QuickEntryInput.tsx`)
     - 200 char limit by default
     - Save on Enter key
     - Topic selector dropdown inline
     - Option to toggle "Expanded Writing" mode
   - DailyEntryList component (`src/components/journal/DailyEntryList.tsx`)
     - List all entries for selected date
     - Decrypt entries client-side
     - Show topic badges
     - Task checkboxes (if topic is "task")
     - Click to expand/edit
   - ViewModeSelector component (`src/components/journal/ViewModeSelector.tsx`)
     - Buttons: All / Day / Week / Month / Year
     - Filter entries based on selection
   - DayCarousel component (`src/components/journal/DayCarousel.tsx`)
     - Previous/Next day arrows
     - Date display

3. **Build Entries API:**
   - GET `/api/entries` - List entries with filters (date range, topic, view mode)
   - POST `/api/entries` - Create encrypted entry (quick or expanded)
   - PUT `/api/entries/[id]` - Update entry
   - DELETE `/api/entries/[id]` - Delete entry

4. **Expanded Writing Modal:**
   - ExpandedWritingModal component (`src/components/journal/ExpandedWritingModal.tsx`)
   - Tiptap rich text editor (only for expanded writing)
   - Save/Cancel buttons
   - Character count display

5. **Main Dashboard:**
   - Build journal page (`src/app/(dashboard)/page.tsx`)
   - Split screen layout (50/50 or 40/60)
   - Responsive: Stack vertically on mobile

#### Entry Data Structure (Before Encryption):
```typescript
{
  content: string; // Plain text (quick entry) OR Tiptap JSON (expanded writing)
  isExpandedWriting: boolean; // false = 200 char limit, true = unlimited
  // For tasks only:
  isCompleted?: boolean;
  isAutoMigrating?: boolean;
}
```

#### Key Features:
- **Quick Entry Mode** (default): 200 char plain text, instant save on Enter
- **Expanded Writing Mode**: Unlimited length, rich text editor (Tiptap)
- Client-side encryption before API call
- Client-side decryption after fetch
- Topic filtering
- **View Modes**: All / Day / Week / Month / Year
- **Task-specific features**:
  - Checkbox to mark task as completed
  - Toggle for auto-migration
  - Auto-migrating tasks move to current day if incomplete

#### Critical Files:
- `src/app/api/entries/route.ts` - Entry list/create with filters
- `src/app/api/entries/[id]/route.ts` - Entry update/delete
- `src/app/api/weather/route.ts` - Weather data fetching
- `src/components/calendar/CalendarGrid.tsx` - Month calendar view
- `src/components/weather/WeatherWidget.tsx` - Weather display
- `src/components/journal/QuickEntryInput.tsx` - Fast 200-char entry input
- `src/components/journal/DailyEntryList.tsx` - Entry list for selected date
- `src/components/journal/ExpandedWritingModal.tsx` - Rich text modal
- `src/components/journal/ViewModeSelector.tsx` - All/Day/Week/Month/Year filters
- `src/components/journal/DayCarousel.tsx` - Navigate between days
- `src/app/(dashboard)/page.tsx` - Main split-screen dashboard

### Phase 6: Task Auto-Migration System (Week 3)
**Goal**: Implement automatic task migration for incomplete auto-migrating tasks

#### Tasks:
1. Create task migration utility (`src/lib/utils/taskMigration.ts`)
   - Function to identify incomplete auto-migrating tasks from previous days
   - Move tasks to current date (update entryDate field)
2. Create migration API endpoint (`src/app/api/tasks/migrate/route.ts`)
   - POST endpoint to trigger migration
   - Can be called manually or via cron job
3. Add task-specific UI components:
   - TaskCheckbox component for marking completed (`src/components/tasks/TaskCheckbox.tsx`)
   - AutoMigrateToggle component (`src/components/tasks/AutoMigrateToggle.tsx`)
4. Update EntryEditor to show task controls when topic is "task"
5. Implement migration trigger options:
   - **Option A**: Client-side on login (check for pending migrations)
   - **Option B**: Scheduled job (cron/background worker)
   - **Option C**: Midnight trigger via Vercel Cron or similar
6. Add migration notification system
   - Show user which tasks were migrated
   - Optional: Allow user to manually trigger migration

#### Migration Logic:
```typescript
// When day ends (or when triggered):
// 1. Find all entries where:
//    - topicId = "task"
//    - isAutoMigrating = true
//    - isCompleted = false
//    - entryDate < current date
// 2. Update their entryDate to current date
// 3. Keep all other data (encrypted content, etc.) the same
```

#### Key Features:
- Automatic migration runs once per day
- Only migrates tasks marked as auto-migrating AND incomplete
- Completed tasks stay on their original date
- Tasks can be moved back manually if needed
- Migration history/log (optional)

#### Critical Files:
- `src/lib/utils/taskMigration.ts` - Migration logic
- `src/app/api/tasks/migrate/route.ts` - Migration endpoint
- `src/components/tasks/TaskCheckbox.tsx` - Completion checkbox
- `src/components/tasks/AutoMigrateToggle.tsx` - Auto-migrate toggle
- `src/components/journal/EntryEditor.tsx` - Updated for task controls

### Phase 7: Medical Tracking System (Week 4) - OPTIONAL FEATURE
**Goal**: Implement comprehensive medical tracking with medications, symptoms, and history

#### Tasks:
1. Add UserSettings model and create settings API (`src/app/api/settings/route.ts`)
   - Toggle medical tracking on/off
2. Create medical database models (Medications, Symptoms, MedicalHistory, MedicationLogs)
3. Build Medications Management:
   - Medications list API (`src/app/api/medical/medications/route.ts`)
   - Schedule configuration (daily/weekly/monthly with times)
   - MedicationsList component (`src/components/medical/MedicationsList.tsx`)
   - AddMedicationForm component (`src/components/medical/AddMedicationForm.tsx`)
   - MedicationScheduler component (`src/components/medical/MedicationScheduler.tsx`)
4. Build Medication Schedule View:
   - Display full medication schedule (`src/app/(dashboard)/medical/schedule/page.tsx`)
   - Auto-generate daily entries for scheduled medications
   - Medication scheduler utility (`src/lib/utils/medicationScheduler.ts`)
5. Build Symptoms Management:
   - Symptoms list API (`src/app/api/medical/symptoms/route.ts`)
   - SymptomsList component (`src/components/medical/SymptomsList.tsx`)
   - AddSymptomForm component (`src/components/medical/AddSymptomForm.tsx`)
   - Symptoms can be tagged to entries
6. Build Medical History:
   - Medical history API (`src/app/api/medical/history/route.ts`)
   - MedicalHistoryList component (`src/components/medical/MedicalHistoryList.tsx`)
   - Add diagnosis, doctors, hospitals
   - Timeline view of medical history
7. Medication Entry Auto-Generation:
   - Cron job/scheduled task creates entries for medications
   - Entry type: "medication" (add to topics or separate field)
   - Includes completion checkbox
   - Links to medication record
8. Medication Status Tracking:
   - Mark medication as taken (updates MedicationLog)
   - Missed medications show in red
   - Notification badge for missed medications
   - Update entry completion status

#### Medical Data Encryption:
```typescript
// Encrypted fields:
- Medication name, dosage, notes
- Symptom name, description
- Medical history data (diagnosis names, doctor names, etc.)

// NOT encrypted (needed for scheduling/display):
- Medication schedule (times, frequency)
- Symptom colors
- Medical history dates and types
- MedicationLog statuses
```

#### Medication Schedule Logic:
```typescript
// Daily medication at 8 AM and 8 PM:
{
  frequency: "daily",
  times: ["08:00", "20:00"],
  daysOfWeek: null,
  daysOfMonth: null
}

// Weekly medication on Mon/Wed/Fri at 9 AM:
{
  frequency: "weekly",
  times: ["09:00"],
  daysOfWeek: [1, 3, 5],
  daysOfMonth: null
}

// Monthly medication on 1st and 15th at 10 AM:
{
  frequency: "monthly",
  times: ["10:00"],
  daysOfWeek: null,
  daysOfMonth: [1, 15]
}
```

#### Key Features:
- Settings toggle to enable/disable medical features
- Encrypted medication, symptom, and history data
- Flexible medication scheduling (daily/weekly/monthly)
- Auto-generated journal entries for medications
- Visual indicators for missed medications (red text/background)
- Notification system for missed medications
- Complete medical history timeline
- All medical data exportable with journal data

#### Critical Files:
- `src/app/api/settings/route.ts` - User settings
- `src/app/api/medical/medications/route.ts` - Medications CRUD
- `src/app/api/medical/symptoms/route.ts` - Symptoms CRUD
- `src/app/api/medical/history/route.ts` - Medical history CRUD
- `src/app/api/medical/logs/route.ts` - Medication log updates
- `src/app/(dashboard)/medical/schedule/page.tsx` - Medication schedule view
- `src/app/(dashboard)/medical/medications/page.tsx` - Medications list
- `src/app/(dashboard)/medical/symptoms/page.tsx` - Symptoms list
- `src/app/(dashboard)/medical/history/page.tsx` - Medical history
- `src/app/(dashboard)/settings/page.tsx` - Settings page
- `src/components/medical/MedicationsList.tsx`
- `src/components/medical/AddMedicationForm.tsx`
- `src/components/medical/MedicationScheduler.tsx`
- `src/components/medical/SymptomsList.tsx`
- `src/components/medical/MedicalHistoryList.tsx`
- `src/lib/utils/medicationScheduler.ts` - Schedule processing

### Phase 8: Calendar Integration (Week 4-5)
**Goal**: Integrate with external calendars and add calendar view

#### Tasks:
1. Build calendar view component (`src/components/calendar/CalendarView.tsx`)
   - Month/week/day grid display of entries
   - Navigate between dates easily
   - Click date to view/add entries
2. Google Calendar integration:
   - OAuth setup for Google Calendar API
   - Import events API endpoint (`src/app/api/calendar/import/route.ts`)
   - Pull events and create journal entries
   - Scheduled sync (daily/hourly)
3. iCal/ICS export:
   - Generate ICS files from entries (`src/lib/utils/icalGenerator.ts`)
   - Export endpoint (`src/app/api/calendar/export/route.ts`)
4. Medication schedule calendar sync:
   - Generate calendar events for medications
   - Subscribe to medication schedule via ICS feed
   - Device native reminders for medications
5. Calendar settings page:
   - Connect/disconnect calendar accounts
   - Configure sync frequency
   - Select which topics to sync

#### Key Features:
- Visual calendar grid showing all entries
- Import Google Calendar events as journal entries
- Export journal entries as ICS for any calendar app
- Medication schedule syncs to device calendar
- All imported calendar data encrypted before storage

#### Critical Files:
- `src/components/calendar/CalendarView.tsx` - Calendar grid UI
- `src/app/api/calendar/import/route.ts` - Import from Google Calendar
- `src/app/api/calendar/export/route.ts` - Export as ICS
- `src/lib/utils/icalGenerator.ts` - ICS file generation
- `src/app/(dashboard)/calendar/page.tsx` - Calendar view page
- `src/app/(dashboard)/settings/calendar/page.tsx` - Calendar settings

### Phase 9: AI Integration (Week 5-6)
**Goal**: Add AI-powered writing assistance and insights

#### Tasks:
1. Setup AI integration (OpenAI API or Claude API):
   - API configuration and key management
   - AI utility wrapper (`src/lib/ai/client.ts`)
2. Writing assistance for creative entries:
   - AI writing panel component (`src/components/ai/WritingAssistant.tsx`)
   - Suggest improvements, rhyme schemes, metaphors
   - Real-time suggestions while typing poems/creative writing
   - Optional: AI completion mode
3. Smart tagging/categorization:
   - Analyze entry content to suggest topics (`src/lib/ai/topicSuggestion.ts`)
   - API endpoint (`src/app/api/ai/suggest-topics/route.ts`)
   - Show suggested topics when creating entry
4. Entry analysis/insights:
   - Analyze entries for mood, themes, patterns
   - Generate insights dashboard (`src/app/(dashboard)/insights/page.tsx`)
   - Mood tracking over time
   - Theme identification across entries
   - API endpoint (`src/app/api/ai/analyze/route.ts`)
5. "Quick Write" freeform entry mode:
   - Minimal UI for rapid creative writing
   - AI writing assistance always available
   - Quick-add without topic selection (can add later)
   - Component: `src/components/journal/QuickWriteModal.tsx`

#### AI & Encryption Consideration:
```typescript
// IMPORTANT: AI analysis happens on decrypted content client-side OR
// Send encrypted content to server, decrypt server-side for AI, never store
// Options:
// 1. Client-side: Decrypt → Send to AI → Get suggestions (exposes data to AI)
// 2. Server-side: Decrypt on server → AI → Re-encrypt (data in transit only)
// 3. Opt-in: Users choose if they want AI features (disables encryption for AI)

// Recommended: Opt-in AI features with clear privacy notice
```

#### Key Features:
- AI writing assistance for poems and creative content
- Smart topic suggestions based on content
- Mood and theme analysis across entries
- Insights dashboard showing patterns
- Quick Write mode for rapid freeform entries
- Privacy-conscious: User opts in, data sent to AI only with consent

#### Critical Files:
- `src/lib/ai/client.ts` - AI API wrapper
- `src/lib/ai/topicSuggestion.ts` - Topic suggestion logic
- `src/components/ai/WritingAssistant.tsx` - AI writing panel
- `src/components/journal/QuickWriteModal.tsx` - Quick write mode
- `src/app/api/ai/suggest-topics/route.ts` - Topic suggestions
- `src/app/api/ai/analyze/route.ts` - Entry analysis
- `src/app/(dashboard)/insights/page.tsx` - Insights dashboard

### Phase 10: Voice Input & Entry Sharing (Week 6)
**Goal**: Add voice-to-text entry creation and secure entry sharing

#### Tasks:

**1. Voice-to-Text Entry Creation:**
   - Integrate Web Speech API (browser native) or AssemblyAI/Deepgram
   - VoiceInput component (`src/components/journal/VoiceInput.tsx`)
     - Microphone button in quick entry input
     - Recording indicator (visual feedback)
     - Real-time transcription display
     - Option to edit before saving
   - Voice recording API endpoint (`src/app/api/voice/transcribe/route.ts`)
     - If using cloud service for better accuracy
   - Settings for voice input:
     - Language selection
     - Auto-punctuation toggle
     - Voice input enabled/disabled

**2. Entry Sharing System:**
   - Share button on each entry
   - Generate unique shareable link with decryption key in URL
   - ShareEntry component (`src/components/journal/ShareEntry.tsx`)
     - Copy link button
     - QR code generation (optional)
     - Expiration time selector (1 hour, 1 day, 1 week, never)
     - Revoke share button
   - Shared entry viewing:
     - Public route: `/share/[shareId]`
     - Decrypts entry client-side using key from URL fragment
     - Read-only view (no editing)
     - Shows topic, date, content
   - SharedEntry model in database:
     - id, entryId, shareToken, expiresAt, createdAt
     - Track view count (optional)
   - Share API endpoints:
     - POST `/api/entries/[id]/share` - Create share link
     - DELETE `/api/entries/[id]/share` - Revoke share
     - GET `/api/share/[shareToken]` - Fetch encrypted entry for viewing

#### Entry Sharing Security Model:
```typescript
// Sharing flow:
// 1. User clicks "Share" on entry
// 2. Generate unique shareToken
// 3. Entry already encrypted in DB
// 4. Create share URL: /share/{shareToken}#{encryptionKey}
// 5. Decryption key in URL fragment (#) - never sent to server
// 6. Anyone with full URL can decrypt and view entry
// 7. Optional expiration time - share link stops working after expiry

// Share URL format:
// https://app.com/share/abc123#eyJrZXkiOiJiYXNlNjRlbmNvZGVkIn0=
//                       ^token  ^encryption key (not sent to server)

// Server only stores: shareToken, entryId, expiresAt
// Server returns: encrypted content + IV
// Client decrypts using key from URL fragment
```

#### Voice Input Implementation:
```typescript
// Option 1: Web Speech API (Free, browser native)
const recognition = new webkitSpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = 'en-US';

// Option 2: Cloud API (Better accuracy)
// Record audio -> Send to AssemblyAI/Deepgram -> Get transcript
```

#### Key Features:
- **Voice input**: Hands-free entry creation using speech recognition
- **Shareable links**: Generate unique URLs to share specific entries
- **URL-based decryption**: Encryption key in URL fragment for client-side decryption
- **Expiring shares**: Optional time limits on shared links
- **Revocable**: User can revoke share links at any time
- **Read-only**: Shared entries are view-only, cannot be edited

#### Critical Files:
- `src/components/journal/VoiceInput.tsx` - Voice recording UI
- `src/components/journal/ShareEntry.tsx` - Share entry modal
- `src/app/api/voice/transcribe/route.ts` - Voice transcription (if cloud)
- `src/app/api/entries/[id]/share/route.ts` - Create/revoke share
- `src/app/api/share/[shareToken]/route.ts` - Fetch shared entry
- `src/app/share/[shareToken]/page.tsx` - Public share view page

### Phase 11: Polish & Security (Week 6-7)
**Goal**: Improve UX and harden security

#### Tasks:
1. Add loading states throughout app
2. Implement comprehensive error handling
3. Add confirmation dialogs (delete entry, logout, etc.)
4. Create empty states
5. Improve mobile responsiveness
6. Add rate limiting to API routes
7. Implement CSRF protection
8. Add input validation with Zod schemas
9. Security audit:
   - Verify encrypted data unreadable in database
   - Test authentication flows
   - Validate key derivation
   - Test shared entry security (ensure key not leaked to server)
10. Create export functionality:
    - Export all entries as decrypted JSON
    - Download backup file
11. Add data export button to settings

#### Critical Features:
- **Export**: Users can download all decrypted entries as JSON backup
- **Error Handling**: Clear messages for encryption failures
- **Re-auth Modal**: Prompt for password on page refresh

#### Critical Files:
- `src/components/journal/ExportData.tsx` - Export functionality
- `src/lib/utils/validation.ts` - Zod schemas
- `src/middleware.ts` - Rate limiting, CSRF protection

## Folder Structure

```
chronicles/
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── migrations/            # Migration history
│   └── seed.ts                # Default topics seed
├── public/
│   └── uploads/               # Encrypted file storage (optional)
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── journal/page.tsx        # Main dashboard
│   │   │   ├── entry/[id]/page.tsx     # Entry detail/edit
│   │   │   ├── topics/page.tsx         # Topic management
│   │   │   ├── medical/
│   │   │   │   ├── schedule/page.tsx   # Medication schedule
│   │   │   │   ├── medications/page.tsx
│   │   │   │   ├── symptoms/page.tsx
│   │   │   │   └── history/page.tsx
│   │   │   ├── settings/page.tsx       # Settings page
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── entries/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── topics/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── tasks/
│   │   │   │   └── migrate/route.ts
│   │   │   ├── medical/
│   │   │   │   ├── medications/route.ts
│   │   │   │   ├── symptoms/route.ts
│   │   │   │   ├── history/route.ts
│   │   │   │   └── logs/route.ts
│   │   │   ├── settings/route.ts
│   │   │   ├── upload/route.ts
│   │   │   ├── files/[id]/route.ts
│   │   │   └── user/
│   │   │       ├── register/route.ts
│   │   │       └── salt/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   └── PasswordWarning.tsx
│   │   ├── journal/
│   │   │   ├── EntryList.tsx
│   │   │   ├── EntryCard.tsx
│   │   │   ├── EntryEditor.tsx
│   │   │   ├── EntryDetail.tsx
│   │   │   └── ExportData.tsx
│   │   ├── topics/
│   │   │   ├── TopicManager.tsx
│   │   │   ├── TopicBadge.tsx
│   │   │   └── TopicSelector.tsx
│   │   ├── tasks/
│   │   │   ├── TaskCheckbox.tsx
│   │   │   └── AutoMigrateToggle.tsx
│   │   ├── medical/
│   │   │   ├── MedicationsList.tsx
│   │   │   ├── AddMedicationForm.tsx
│   │   │   ├── MedicationScheduler.tsx
│   │   │   ├── SymptomsList.tsx
│   │   │   ├── AddSymptomForm.tsx
│   │   │   ├── MedicalHistoryList.tsx
│   │   │   └── MedicationStatusBadge.tsx
│   │   ├── settings/
│   │   │   └── SettingsForm.tsx
│   │   ├── editor/
│   │   │   ├── RichTextEditor.tsx
│   │   │   ├── ImageUpload.tsx
│   │   │   └── LinkInserter.tsx
│   │   └── ui/                # Reusable UI components
│   ├── lib/
│   │   ├── crypto/
│   │   │   ├── encryption.ts
│   │   │   ├── keyDerivation.ts
│   │   │   └── fileEncryption.ts
│   │   ├── auth/
│   │   │   └── authOptions.ts
│   │   ├── db/
│   │   │   └── prisma.ts
│   │   ├── hooks/
│   │   │   ├── useEncryption.ts
│   │   │   ├── useEntries.ts
│   │   │   └── useTopics.ts
│   │   ├── utils/
│   │   │   ├── validation.ts
│   │   │   ├── errors.ts
│   │   │   ├── taskMigration.ts
│   │   │   └── medicationScheduler.ts
│   │   └── constants.ts
│   ├── types/
│   │   ├── entry.ts
│   │   ├── topic.ts
│   │   └── auth.ts
│   └── middleware.ts
├── .env.local
├── .env.example
├── next.config.js
├── tsconfig.json
├── tailwind.config.ts
└── package.json
```

## Security Considerations

### Critical Security Practices

1. **Password Handling**:
   - Authentication: bcrypt (server-side, 10 rounds)
   - Encryption: PBKDF2 (client-side, 100k iterations)
   - Never send raw password except during auth
   - Clear from memory after key derivation

2. **Encryption Key Management**:
   - Key exists ONLY in browser memory
   - Never sent to server or stored in localStorage
   - Re-derive on page refresh (prompt password)

3. **HTTPS Required**:
   - All production traffic over HTTPS
   - Prevents password/data interception

4. **Data Encryption**:
   - Entry titles and content encrypted
   - Image files encrypted
   - Topics/dates NOT encrypted (needed for filtering)

5. **Session Security**:
   - Secure, httpOnly cookies
   - Session timeout
   - CSRF protection

### Known Limitations & Trade-offs

1. **No Password Recovery**: User loses all data if password forgotten
   - Mitigation: Prominent warnings, export functionality

2. **Search Limitations**: Can't search encrypted content server-side
   - Solution: Decrypt client-side for search (works for small datasets)

3. **Page Refresh Loses Key**: Must re-enter password
   - Solution: Show modal prompting password (good UX)

4. **No Sharing**: Can't share encrypted entries
   - Workaround: Export as markdown/PDF

5. **Performance**: Decrypting many entries can be slow
   - Solution: Pagination, decrypt only visible entries

## Testing Strategy

### Unit Tests
- Encryption/decryption functions (verify roundtrip)
- Key derivation (consistent output)
- API endpoint logic

### Integration Tests
- Auth flow: register → login → session
- Entry flow: encrypt → store → fetch → decrypt
- File upload: encrypt → upload → download → decrypt

### E2E Tests
- Complete user journey
- Password warning acceptance
- Entry CRUD operations
- Export functionality

### Security Tests
- Verify encrypted data in DB is unreadable
- Test auth bypass attempts
- Validate encryption key never leaves client

## Success Criteria

✅ Users can register and login securely
✅ **Password change with re-encryption**: Users can change password, all data automatically re-encrypted
✅ **Split-screen interface**: Calendar on left, entries on right
✅ **Quick entry mode**: 200-character limit, type and hit Enter to save instantly
✅ **Expanded writing mode**: Unlimited length with rich text editor for creative content
✅ **Voice-to-text input**: Hands-free entry creation with speech recognition
✅ **Entry sharing**: Generate shareable links with encryption key in URL, optional expiration
✅ **View modes**: All / Day / Week / Month / Year filtering
✅ **Weather & time display**: Contextual information in header
✅ All entry content encrypted client-side
✅ Users can manage custom topics (except "task" which cannot be deleted)
✅ Users can filter entries by topic and date
✅ **Tasks have special functionality**:
  - Can be marked as completed
  - Can be set to auto-migrate
  - Incomplete auto-migrating tasks automatically move to current day
✅ **Medical tracking (optional feature)**:
  - Users can enable/disable in settings
  - Track medications with flexible scheduling (daily/weekly/monthly)
  - Auto-generate medication entries with completion tracking
  - Missed medications visually highlighted in red
  - Track symptoms for logging
  - Maintain encrypted medical history (diagnosis, doctors, hospitals)
  - Full medication schedule view
✅ **Calendar integration**:
  - Visual calendar grid view of all entries
  - Import events from Google Calendar
  - Export entries as ICS for any calendar app
  - Sync medication schedule to device calendar
✅ **AI-powered features**:
  - Writing assistance for creative entries (poems, etc.)
  - Smart topic suggestions based on content
  - Entry analysis for mood, themes, patterns
  - Insights dashboard showing trends
  - Quick Write mode for rapid freeform entries
✅ Users can export all data including medical records (decrypted)
✅ Password loss = permanent data loss (with warnings)
✅ Application works on mobile devices (responsive web)
✅ React Native mobile app path clearly defined for future
✅ No password recovery option available

## Estimated Timeline

### Phase 1: Core Journal (Weeks 1-3)
- **Week 1**: Project setup + Authentication + Encryption
- **Week 2**: Topics + Basic entries + Rich text editor
- **Week 3**: Entry management + Task auto-migration + Image upload

### Phase 2: Medical Tracking - OPTIONAL (Week 4)
- **Week 4**: Medical tracking system (medications, symptoms, history)

### Phase 3: Advanced Features (Weeks 5-6)
- **Week 5**: Calendar integration (import/export, calendar view)
- **Week 6**: AI integration (writing assistance, insights, quick write mode)

### Phase 4: Polish & Deploy (Week 7)
- **Week 7**: Polish + Security hardening + Testing + Deployment

**Total Timeline Options:**
- **Core MVP** (no medical/AI/calendar): 3-4 weeks
- **With medical tracking**: 4-5 weeks
- **With calendar integration**: 5-6 weeks
- **Full featured (all phases)**: 7-8 weeks

**Recommended approach**: Build incrementally, deploy after each phase

## React Native Mobile Translation Strategy

### How Easy is Translation from Next.js to React Native?

**Moderate Difficulty** - Approximately 40-60% code reusable with proper architecture

### What Can Be Shared:

✅ **100% Reusable:**
- **Encryption logic** (`src/lib/crypto/*`) - Web Crypto API works in React Native
- **Business logic** (`src/lib/utils/*`) - Pure TypeScript functions
- **Type definitions** (`src/types/*`) - Shared interfaces
- **API client logic** - HTTP requests to same backend
- **Validation schemas** (Zod) - Works identically

✅ **80-90% Reusable with Minor Changes:**
- **State management** - If using Zustand/Redux (platform-agnostic)
- **Hooks** (`src/lib/hooks/*`) - Most React hooks work in React Native
- **Data fetching logic** - Same patterns, different fetch libraries

⚠️ **Needs Rewriting:**
- **UI Components** (50-70% rewrite):
  - Replace `<div>` with `<View>`
  - Replace `<input>` with `<TextInput>`
  - Tailwind CSS → React Native StyleSheet or NativeWind
  - Rich text editor: Tiptap → React Native alternative (e.g., react-native-pell-rich-editor)
- **Navigation**: Next.js App Router → React Navigation
- **File uploads**: Different APIs for image picker
- **Calendar integration**: Different native APIs

### Recommended Mobile App Architecture:

```
mobile-app/                    # React Native app
├── src/
│   ├── screens/              # Mobile screens (replaces Next.js pages)
│   ├── components/           # Mobile UI components (RN-specific)
│   ├── lib/                  # SHARED from web app
│   │   ├── crypto/          # ✅ Copy from Next.js (100% reuse)
│   │   ├── utils/           # ✅ Copy from Next.js (100% reuse)
│   │   ├── hooks/           # ✅ Copy from Next.js (90% reuse)
│   │   └── api/             # ✅ Copy from Next.js (95% reuse)
│   ├── types/               # ✅ Copy from Next.js (100% reuse)
│   └── navigation/          # ❌ New for React Native
└── package.json

shared/                       # Shared package (monorepo approach)
├── crypto/
├── utils/
├── types/
└── validation/

web-app/                      # Next.js web app
└── Uses shared package
```

### Translation Steps:

1. **Extract shared logic to monorepo package:**
   - Create `packages/shared` with crypto, utils, types
   - Both web and mobile import from shared package

2. **Build React Native UI:**
   - Port components to React Native equivalents
   - Use React Native Paper or NativeBase for UI
   - Implement React Navigation

3. **Keep same backend:**
   - Mobile app calls same Next.js API routes
   - Authentication works identically
   - Encryption/decryption client-side on mobile

4. **Platform-specific features:**
   - Mobile: Biometric auth, native notifications, offline mode
   - Web: Better desktop UX, keyboard shortcuts

### Timeline to Add React Native:

- **2-3 weeks** if built after Next.js MVP (with shared architecture)
- **4-5 weeks** if built without shared architecture (duplicating logic)

### Recommendation:

**Build Next.js first** (your choice ✓), then add React Native later by:
1. Extracting shared logic into monorepo package
2. Building React Native UI that uses shared package
3. Both apps share same backend API and encryption logic

This gives you:
- ✅ Web app available immediately
- ✅ Progressive enhancement to mobile
- ✅ Shared encryption and business logic
- ✅ Single backend to maintain
- ✅ Lower risk (validate concept on web first)

## Post-MVP Enhancements

- Advanced filtering (date ranges, multiple topics, full-text search)
- Entry templates for common entry types
- Markdown export option
- Recovery key generation (optional backup method)
- Progressive Web App (PWA) for offline web access
- Dark mode theme
- Collaborative workspaces (multiple users in shared space - requires different encryption)
- Backup/restore functionality
- Multi-device sync (requires server-side key management or key sync)
- Browser extensions for quick capture
- Email-to-journal feature (forward emails to create entries)
- Webhooks for automation (IFTTT, Zapier integration)
