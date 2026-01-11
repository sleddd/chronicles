# Chronicles

A journal for those too busy to journal with zero-knowledge encryption. Chronicles is designed as a simple daily log. The core philosophy is to capture the key moments of your day briefly in less than 10-15 minutes, then use topics to organize and find them later.

## Features

- **Encrypted Journal Entries** - Rich text editor with client-side encryption
- **Topic Organization** - Categorize entries with custom topics, icons, and colors
- **Goals & Milestones** - Track goals with milestone progress
- **Medical Tracking** - Log medications, symptoms, food, and schedules
- **Calendar View** - Visual overview of entries by date
- **Entry Sharing** - Share specific entries via secure public links
- **Bookmarks** - Mark and quickly access important entries
- **Mobile Responsive** - Works on desktop and mobile devices
- **Customizable colors and background** - Choose from a variety of colors and background images

## Privacy Guarantees

- All entry content is encrypted in the browser before transmission
- Recovery key system allows password reset without compromising zero-knowledge design
- Schema-per-user database isolation (not row-level security)
- Session Management - Revoke sessions at any time if you see an unfamiliar device

## Screenshots
<img width="1403" height="661" alt="Screenshot 2026-01-11 at 12 12 38 PM" src="https://github.com/user-attachments/assets/8cbc963d-57a0-4ad4-92f8-b9984f9a21d5" />
<img width="1407" height="667" alt="Screenshot 2026-01-11 at 12 27 40 PM" src="https://github.com/user-attachments/assets/d64294f8-18b1-44e4-83e6-218073abbe83" />
<img width="1415" height="685" alt="Screenshot 2026-01-11 at 12 28 47 PM" src="https://github.com/user-attachments/assets/ed43fe9c-051c-461b-8517-f39242c35179" />

<img width="1417" height="668" alt="Screenshot 2026-01-11 at 12 11 47 PM" src="https://github.com/user-attachments/assets/8374c50b-9692-49a0-86b6-e884ca29aec5" />
<img width="1236" height="648" alt="Screenshot 2026-01-04 at 12 31 00 AM" src="https://github.com/user-attachments/assets/6f04e329-b85c-474c-99b1-9e983115407c" />

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
- **Exercise** - Daily logs of exercise types and duration
- **Event** - Calendar events with date/time/location
- **Meeting** - Meetings with attendees and agenda
- **Music** - Track music you're listening to
- **Books** - Log books you're reading
- **TV/Movies** - Track shows and films
- **Research** - Save research notes and findings
- **Idea** - Capture ideas for later
- **Quote** - Save inspiring quotes

You can create your own topics for anything else (Work, Personal, Ideas, etc.).

### Entries

Entries are the core of Chronicles. Each entry belongs to a topic and contains your encrypted content.

**Creating an Entry:**
1. Select a topic from the sidebar (or use "All Entries")
2. Type your content in the editor
3. Use the toolbar for formatting (bold, italic, headings, lists, etc.)
4. Press Enter or click "Save"

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

### Entertainment View

Track your media consumption:

- **Music Tab** - Music you're listening to
- **Books Tab** - Books you're reading or have read
- **TV/Movies Tab** - Shows and films you're watching

### Inspiration View

Collect ideas and inspiration:

- **Research Tab** - Research notes and findings
- **Ideas Tab** - Ideas you want to remember
- **Quotes Tab** - Inspiring quotes you've collected

### Settings

Access settings from the header menu:

- **Sessions** - View and revoke active sessions on other devices
- **Change Password** - Update your password (master key is re-wrapped, data is not re-encrypted)
- **Feature Toggles** - Enable/disable features like the medical tracker
- **Theme Customization**:
  - **Header and Accent Color** - Choose from 18 accent colors for the header bar (Dark, Navy, Teal, Coral, etc.) or set to transparent
  - **Background Image** - Select from 28 curated background images from Unsplash artists, or choose no background for a clean look

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

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL with Prisma ORM (supports Neon serverless)
- **Authentication**: NextAuth.js with database sessions
- **Encryption**: Web Crypto API (AES-256-GCM)
- **State Management**: Zustand
- **Styling**: Tailwind CSS

## License

© 2025 Claudette Raynor | All Rights Reserved. You may not use this for any commercial purpose. You can download this application for personal use only, but you may not modify it.
