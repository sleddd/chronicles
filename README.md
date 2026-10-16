# Chronicles - In Active Design/Development

A zero-knowledge encrypted journal and digital day planner for those too busy to journal. Capture the key moments of your day, organize with topics, and track health, goals, and more — all encrypted on your device before it ever leaves the browser.

## Features

- **Zero-Knowledge Encryption** - AES-256-GCM client-side encryption with non-extractable keys; server never sees plaintext
- **Two-Factor Authentication** - TOTP-based 2FA (authenticator app); inline setup wizard with QR code, confirmation step, and 8 backup codes; disable with password confirmation
- **Dashboard Home** - Two-column drag-and-drop widget layout; quick entry, daily priorities, events & meetings, mini calendar, affirmations, daily wellness check-in, tasks, shopping list, medication schedule, weather, and menu plan; daily quote and greeting; Add your custom topic widget
- **Rich Text Editor** - TipTap-based editor with formatting toolbar, inline freehand drawing, and voice dictation
- **Voice Dictation** - Tap the mic button to dictate entries hands-free using the Web Speech API; interim text previews in real-time as you speak; works offline on iOS/Safari (on-device processing); auto-continues after silence
- **Topic Organization** - Categorize entries with custom topics, icons, and drag-and-drop reordering; define your own custom fields per topic (text, number, date, yes/no, URL) — fields appear in the entry editor and dashboard quick entry; any topic can optionally hide the main text area so its entries are fields-only
- **Fields-First Entries** - Structured topics are written in their fields, not a text area: meals (Meal Description), medication (Medication Name), allergies (Allergen), goals and milestones (Objective), shopping lists, menu plans, books, quotes, and exercise. Each entry's title is generated from its fields — "Piranesi — Susanna Clarke", "“Be here now” — Ram Dass", "Running · 30 min · 3 mi" — so lists, the calendar and search always show something meaningful. Any filled-in field is enough to save. Tasks keep the full text area for longer notes
- **Clean, Consistent Forms** - Every form uses the same single-column rows with filled input boxes; nutrients sit in a compact grid with units inside each box
- **Quick Tab Filters** - Today, Date (with active filter bar and clear button), Tasks, All, Bookmarks, and Search views; the Date view lists events and meetings on their scheduled day, matching the calendar
- **Search** - Search by keyword, topic, and date range from the journal's Search tab; clicking a topic label on any row filters to that topic, with a clear bar to undo it
- **Edit Anywhere, Return Where You Were** - Opening or creating an entry from any page (topics, health, planning, calendar, shopping) opens it full width in the journal with the list filtered to its topic; Save, New, Discard, or × takes you straight back to the page you came from
- **Spreadsheet-Style Lists** - Every entry list shows the date as "OCT 11, 2026", highlights the first row as a hint, and outlines rows in your accent color on hover; swipe a row for Edit/Delete on touch devices
- **Bulk Edit** - Select multiple journal entries (or all of them) and delete them in one go
- **Breadcrumbs** - The editor's breadcrumb trail remembers where you came from (e.g. Journal / Health / Symptoms) and leads back there
- **Goals & Milestones** - Track goals with milestone progress and task linking; milestone status cycle (Not Started → In Progress → Completed) with tap-to-advance on the card; goal cards display the entry's featured image as a banner
- **Custom Planner Filters** - Cross-hierarchy search across goals, milestones, tasks, and todos; filter by keyword, item type, status, priority, parent goal, and parent milestone; save named filters that persist and can be reloaded in one tap. The applied filter lives in the page address, so it's still there after editing a result, reloading, or opening a bookmark
- **From the Kitchen** - A kitchen dashboard (today's meals and your open shopping list as a tick-off checklist) plus Menu, Recipes, and Shopping Lists tabs; the weekly menu planner autosaves as you type or link a recipe; recipes render as a formatted recipe page — name, description, prep/cook/serves/calories/difficulty stats band, photo hero, checkable ingredients, and numbered method steps — with live serving scaling that recalculates ingredient amounts, one-tap "Add to shopping list" (appends all ingredients and cross-links the entries), and "Add to menu"
- **Shopping Lists** - Checklist-style lists linkable to recipes; dashboard widget shows active list with inline check-off
- **Health Tracking** - Medications, symptoms, meals, exercise, and allergies; a Health dashboard with today's nutrition, a wellness check-in, quick meal and exercise logging, and the medication schedule; printable medication lists (with dosage and schedule), symptom logs, and allergy records
- **Meals Log & Nutrition** - Log meals with calories, iron, vitamin D, B12, and vitamin C; daily totals against your goals, a 7/30/90-day and yearly at-a-glance view, and a review table for correcting entries; medication doses with nutrients (e.g. a vitamin D supplement) count toward the day automatically
- **Medication Schedule** - Daily dose tracking with time-based scheduling; real-time sync on tab focus
- **Daily Wellness Check-in** - Tap-to-fill water glasses, mood faces (1–5), sleep hours, period toggle, and flow intensity on the dashboard and Health dashboard, with the next expected period estimated from your history; entries stored encrypted under the Wellness topic and fully editable in the journal
- **Health Reporting** - Correlation analysis, severity trends, exercise impact, and wellness trends (water/mood/sleep) with cross-correlation insights (sleep→mood, water→symptoms, exercise→sleep, mood→symptoms); cycle calendar showing period and flow days by month; date range filtering
- **Mini Calendar Widget** - Monthly grid on dashboard with entry-presence dots; click any day to jump to that day's journal entries
- **Calendar View** - Month, week, and day views with today circled; the Today button jumps to today's day view; events and meetings appear on their scheduled date; add an entry for any day straight from the calendar
- **Calendar Sync** - Two-way sync of Event and Meeting entries with Google Calendar (pick any calendar you own); optional import of events created directly in Google; read-only Apple Calendar subscription feed (ICS) for iPhone/iPad/Mac; connect, disconnect, and sync on demand from Settings
- **Entry Images** - Attach up to 7 photos per entry, stored **zero-knowledge in your own Cloudflare R2 bucket**; images are encrypted in the browser with your master key before upload, so your bucket only ever holds ciphertext; thumbnail strip, tap-to-open lightbox, and an optional featured image that renders as a hero banner above the entry
- **Entry Sharing** - Share entries via public links; the share dialog manages the links for that entry (create, copy, revoke). Shared copies are stored unencrypted on the server by design — creating a link is an explicit opt-out of zero-knowledge for that entry, and revoking it removes access. Sharing is hidden for entries with images, except recipes, which share their formatted text while the photo stays private
- **Title-Led Entry Headers** - Events, meetings, quotes, books, music, goals, and milestones open with their own name in place of the date block — events/meetings add a date · time · location line, quotes render formatted with author attribution, books show title and author
- **AI Assistant (bring your own key)** - Optional calorie and nutrient estimates for meals and exercise using your own Claude (Anthropic), Amazon Bedrock, or OpenAI credentials, which are encrypted with your master key; requests go straight from your browser to the provider, and typed values are never overwritten
- **AI Chat** - A small chat bubble for talking things through; chats are never saved, and `/save <topic> <text>` turns a thought into an encrypted journal entry
- **PWA Support** - Installable as a standalone app with offline shell caching
- **Customizable Theme** - Light/dark mode with 30 muted accent color presets (reds, oranges, greens, blues, purples, and neutrals) that recolor the whole app; high-contrast text on the white light theme
- **Display Name** - Edit your display name in place in Settings; it's shown in the dashboard greeting
- **Data Import & Export** - Export all entries to CSV; import entries from CSV or a Daily Log JSON export, with downloadable example files for both
- **Apple Pencil Support** - Scribble handwriting-to-text in all fields; freehand drawing canvas with pressure sensitivity, palm rejection, and undo — drawings saved inline as encrypted SVG
- **Mobile Responsive** - Slide-out navigation on phones and tablets, one pane at a time in the journal (with an Entries back bar), touch-friendly tap targets, single-column dashboard and stacked form labels on small screens
- **Weather** - Current conditions beside the date in the page header and a 5-day dashboard widget (Open-Meteo; set your city in Settings)
- **Accessible** - ARIA roles, focus management, keyboard navigation, reduced motion support

## Privacy & Security

- All entry content is encrypted in the browser before transmission
- **Images never touch the Chronicles server** — they are encrypted client-side and uploaded straight to your own R2 bucket with URLs signed in the browser; your R2 credentials are themselves encrypted with your master key, so the server stores only ciphertext it cannot read
- **Two-factor authentication** (TOTP) — no external services; secrets stored encrypted server-side
- Recovery key system allows password reset without compromising zero-knowledge design
- **Sharing is the one deliberate exception**: creating a share link stores a plaintext copy of that entry on the server so the link works for anyone — you opt in per entry, and revoking the link removes access
- Schema-per-user database isolation (not row-level security)
- Session management — view and revoke active sessions from any device
- Non-extractable CryptoKeys — master key cannot be exported from the browser's crypto subsystem
- Split-token sessions — database leaks cannot reconstruct valid session tokens
- **Remember me** (opt-in, for personal devices) — stay unlocked until the browser closes; the browser keeps only an encrypted copy of the key, and the server holds the matching secret in memory only, never on disk
- **AI is optional and bring-your-own** — when you turn it on, the meal or exercise description you're estimating (or your chat message) goes from your browser straight to the provider you chose; nothing passes through the Chronicles server

## Screenshots

Chronicles is in active design and development, with a phone app via React Native planned. These screenshots are from June 2026 — the UI has been refined since (filled form fields, fields-first entries, collapsible settings, and more).
<img width="1374" height="720" alt="Screenshot 2026-06-24 at 11 45 57 PM" src="https://github.com/user-attachments/assets/9c574af0-c97b-4dd2-9dd5-194044513e7e" />
<img width="1374" height="722" alt="Screenshot 2026-06-24 at 11 47 51 PM" src="https://github.com/user-attachments/assets/fcef5215-b3eb-4f76-b7d2-65aa8b4e0f2b" />
<img width="1382" height="718" alt="Screenshot 2026-06-24 at 11 48 00 PM" src="https://github.com/user-attachments/assets/dc28747f-120f-431c-8ac4-343d26efae7d" />
<img width="1367" height="707" alt="Screenshot 2026-06-24 at 11 48 28 PM" src="https://github.com/user-attachments/assets/c7481ecb-735f-4de4-82c4-ac3674f59483" />
<img width="1372" height="723" alt="Screenshot 2026-06-24 at 11 49 25 PM" src="https://github.com/user-attachments/assets/97e33025-ade1-41b6-bb0a-17f853c1d448" />
<img width="1370" height="700" alt="Screenshot 2026-06-24 at 11 49 55 PM" src="https://github.com/user-attachments/assets/45d5a801-b54d-4ff1-8da8-23433498eac9" />
<img width="1374" height="709" alt="Screenshot 2026-06-24 at 11 50 17 PM" src="https://github.com/user-attachments/assets/4ac9fd6e-2a0b-47a0-8101-56342ae40cc8" />
<img width="1376" height="689" alt="Screenshot 2026-06-24 at 11 50 27 PM" src="https://github.com/user-attachments/assets/f9036d87-8593-4b32-855a-783c042f5330" />
<img width="1373" height="701" alt="Screenshot 2026-06-24 at 11 50 42 PM" src="https://github.com/user-attachments/assets/5d3b70b8-9dbd-4e3f-8ad5-40b8fc4a2e86" />
<img width="1378" height="708" alt="Screenshot 2026-06-24 at 11 51 49 PM" src="https://github.com/user-attachments/assets/3fb1861a-254f-41a7-8eb9-e9a0dd441787" />
<img width="1383" height="720" alt="Screenshot 2026-06-24 at 11 52 00 PM" src="https://github.com/user-attachments/assets/bef2ad9d-c12f-40c9-8bb4-84c7a1d5810f" />
<img width="1381" height="721" alt="Screenshot 2026-06-24 at 11 52 19 PM" src="https://github.com/user-attachments/assets/f5f9938c-7022-4986-a1aa-05c7f2cda893" />


## Architecture

This is a complete rebuild combining the best of the original Chronicles UI with a cleaner, modular architecture:

- **Client**: React 19 SPA (Vite) — no Next.js, ready for React Native
- **Server**: Express 5 API with TypeScript
- **Shared**: Crypto, types, validation, and theme tokens shared across platforms
- **Components**: Atomic Design (atoms -> molecules -> organisms -> templates -> views)
- **Styling**: styled-components (CSS-in-JS) on the Chronicles design system (`design-system/`): white / deep-charcoal themes, borderless tonal panels, filled inputs, Work Sans display type and Open Sans for UI

```
chronicles-rebuild/
├── client/          # React SPA (Vite + styled-components + PWA)
├── server/          # Express API (Prisma + PostgreSQL)
├── shared/          # Shared code (crypto, types, theme)
└── docs/            # BLUEPRINT.md, ACCESSIBILITY_UX_PLAN.md
```

## How It Works

Chronicles is a daily journal. Capture moments, organize with topics, and track what matters to you.

### Topics

Topics categorize your entries — like tags or folders. Each has an icon and color.

**Default Topics** with special fields:
- **Task** - Todo items with completion tracking and auto-migration; written in the full text area
- **Goal** - Objectives with milestone progress tracking; named by the Goal Objective field
- **Milestone** - Checkpoints within goals, linkable to tasks; named by the Milestone Objective field
- **Medication** - Medication Name, dosage, frequency, schedule times, dose logging, and nutrients per dose
- **Meals** - Meal Description, meal type, calories, and micronutrients (iron, vitamin D, B12, vitamin C)
- **Symptom** - Severity tracking (1-10 scale) with duration
- **Exercise** - Type, duration, intensity, and distance tracking
- **Allergy** - Allergen (the entry's name), severity, and reaction tracking
- **Wellness** - Auto-created by the dashboard check-in widget; water, mood, and sleep fields
- **Event** - Name, date/time, location, and contact details; opens with the event name as its header
- **Meeting** - Name, attendees, topic, location, and scheduling
- **Recipe** - Formatted recipe page: description, category, prep/cook/serves/calories/difficulty, checkable ingredients with serving scaling, numbered method steps, photo hero, shopping-list and menu integration
- **Shopping List** - Checklist items with categories, linkable to recipes; titled automatically ("Shopping list created on Oct 7, 2026")
- **Menu Plan** - Weekly meal slots, linkable to recipes; editable in the journal or on the Menu page
- **Priorities** - Auto-created by the dashboard priorities widget
- **Music / Books / TV/Movies** - Entertainment tracking; books are titled "Title — Author" and music leads with the artist from your custom fields
- **Research / Idea / Quote** - Inspiration collection; quotes are titled "“Quote” — Author" and display formatted with author attribution

You can create your own topics for anything else. Any topic can have **user-defined custom fields** — add them by editing a topic in the Topics view. Fields appear in the entry editor and Quick Entry widget. Supported types: text, number, date, yes/no, URL. Turn on "hide main text field" for a topic and its entries become fields-only, titled from their field values.

### Navigation

- **Dashboard** (`/`) - Home view with daily widgets and quick entry
- **Journal** (`/journal`) - Main entry view with quick tab filters (Today, Date, Tasks, All, Bookmarks, Search)
- **Topics** - Manage and browse entries by topic
- **Calendar** - Month, week, and day views; today is circled and the Today button opens today's day view
- **Planning** - Goals, Milestones, Tasks, Todos, and Filters tabs; Custom Filters view at `/goals/filter`
- **From the Kitchen** (`/kitchen`) - Kitchen dashboard, Menu planner, Recipes, and Shopping Lists
- **Health** (`/health`) - Health dashboard, Meals log, Exercise, Symptoms, Med List, Allergies, and Reports
- **Quick Links** - Entertainment and inspiration collections

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + N | New entry |
| Ctrl/Cmd + D | Delete selected entry |
| Enter | Save entry (when editor is focused) |
| Shift + N | New entry (when not typing) |
| Escape | Collapse the full-width editor (or return to the page you came from) |

### Dashboard Widgets

The dashboard has two columns. Default layout:

| Left | Right |
|------|-------|
| Quick Entry | Mini Calendar |
| Priorities | Affirmations |
| Events & Meetings | Daily Wellness Check-in |
| Menu Plan | *(add more from widget tray)* |

Additional widgets available in the tray: Tasks, Shopping List, Medication Schedule, Weather.

Drag to reorder within or across columns. Layout is saved per-browser.

**Quick Entry** works like the journal editor: pick a topic and its fields appear. Field-led topics (meals, medication, allergies, exercise, events, meetings, books, quotes, music) show just their fields — no text area — and are titled from them when saved.

### Health Reporting

Analyze health data with correlation analysis:
- **Symptom frequency** and **severity trends** over time
- **Food-symptom correlations** — identify trigger ingredients
- **Exercise impact** on symptom patterns
- **Wellness trends** — water, mood, and sleep over time with cross-correlations (sleep→mood, water→symptoms, exercise→sleep, mood→symptoms)
- **Calorie summaries** by meal type
- **Date range filtering** — Today, Week, Month, Year, or custom date range

### Calendar Sync

Keep Event and Meeting entries in sync with the calendars you already use:

- **Google Calendar (two-way)** — Connect your Google account in Settings → Calendar Sync and pick which calendar to sync to. Events and meetings you create in Chronicles appear there; edits and deletions propagate. Optionally import events created directly in Google (from today onward) as Chronicles entries.
- **Apple Calendar (subscription feed)** — Enable the ICS feed to get a private `webcal://` URL you can subscribe to from iPhone, iPad, or Mac (one-way: Chronicles → Apple Calendar). Regenerate the URL any time if it leaks.

Only event titles, times, and locations are synced — never your journal content. Requires Google OAuth credentials on the server (see `server/.env.example`); the Apple feed works with no external setup.

### Entry Images

Add up to 7 photos to any journal entry — without giving up zero-knowledge:

1. **Bring your own bucket** — Create a free Cloudflare R2 bucket and an API token (Object Read & Write, scoped to that bucket). Your storage, your bill (R2's free tier has no egress fees).
2. **Enter credentials in Settings → Entry images** — They autosave as you type, get encrypted with your master key, and are stored as ciphertext the server cannot read. The setup guide in Settings walks through the bucket, token, and the required CORS policy, and an optional "Test connection" verifies everything from your browser.
3. **Attach images in the editor** — Photos are downscaled, encrypted with AES-256-GCM in the browser, and uploaded directly to your bucket with browser-signed URLs. Chronicles' server never sees the images or your credentials — your bucket only ever contains encrypted noise.

Star an image to feature it as a full-width banner above the entry (recipes and goal cards use it too); tap any thumbnail for a full-screen lightbox with keyboard and swipe navigation. Deleting an image or an entry (including bulk delete) also removes the objects from your bucket. Sharing is automatically disabled for entries that contain images — except recipes, which share only their formatted text while the photo stays in your bucket.

### Printable Views

Medication lists, symptom logs, and allergy records can be printed directly from the browser for sharing with healthcare providers.

### Settings

Each section is a collapsible card (all start collapsed; Settings remembers which you open):

- **Account** - Username, display name (edit in place), and email (changing it asks for your password)
- **Preferences** - Timezone and the weather forecast city
- **Theme** - Light/dark mode and 30 accent color presets
- **Features** - Enable/disable health tracking, planning, entertainment, cycle tracking, and more
- **Calendar Sync** - Connect Google Calendar, choose the target calendar, toggle imports, manage the Apple ICS feed, and clean up old events
- **Entry Images** - Toggle the feature, enter your Cloudflare R2 credentials (autosaved and master-key encrypted), test the connection, and follow the built-in setup guide
- **AI Assistant** - Choose Claude, Amazon Bedrock, or OpenAI, add your credentials and model, and leave notes for the chat assistant
- **Security** - Remember me, change password, active sessions, recovery key, and two-factor authentication (TOTP setup wizard with QR code and backup codes)
- **Data** - Default topics, seed test data, export to CSV, import entries (CSV) and a Daily Log (JSON) — each import has a downloadable example file
- **Privacy** and **Sign Out**

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

3. Set up environment variables:
   ```bash
   cp server/.env.example server/.env
   # Edit server/.env with your database credentials
   ```
   Optional: to enable Google Calendar sync, add Google OAuth credentials and a
   `CALENDAR_TOKEN_KEY` (see comments in `.env.example`). Entry images need **no**
   server configuration — each user connects their own R2 bucket from Settings.

4. Set up the database:
   ```bash
   cd server
   npx prisma generate
   npx prisma db push
   ```

5. Run both servers:
   ```bash
   npm run dev
   ```
   This starts the Express API on port 3001 and the Vite dev server on port 5173.

### Registration

**Password requirements:**
- Minimum 12 characters
- At least one uppercase letter, lowercase letter, and number

**Recovery Key:**
At registration, you'll receive a recovery key (formatted as hex with dashes). Save it securely — it's the only way to recover your account if you forget your password.

## Commands

```bash
npm run dev              # Start both client and server
npm run dev:client       # Start Vite dev server only
npm run dev:server       # Start Express API only
npm run build            # Build all packages
npm run test             # Run all tests (shared + server + client)
npm run test:watch       # Run all test suites in watch mode
npm run test:coverage    # Run tests with coverage
```

## Tech Stack

- **Frontend**: React 19, Vite, react-router-dom, styled-components, Zustand, TipTap, perfect-freehand, dnd-kit
- **Backend**: Express 5, TypeScript, Prisma
- **Database**: PostgreSQL (schema-per-user isolation)
- **Encryption**: Web Crypto API (AES-256-GCM, PBKDF2-SHA256 600k iterations)
- **Image Storage**: User-owned Cloudflare R2 buckets; dependency-free in-browser AWS SigV4 signing (Web Crypto HMAC)
- **Calendar**: Google Calendar API (OAuth 2.0, two-way) + self-hosted ICS subscription feed
- **AI (optional, bring your own key)**: Anthropic SDK (Claude), Amazon Bedrock Converse API signed in the browser with `@smithy/signature-v4`, and OpenAI chat completions — all called directly from the browser
- **Weather**: Open-Meteo (no API key)
- **Auth**: Split-token sessions (selector + SHA-256 verifier hash) + TOTP 2FA (otplib)
- **PWA**: vite-plugin-pwa with Workbox (shell caching, no encrypted data cached)
- **Accessibility**: ARIA roles, focus trapping, keyboard navigation, prefers-reduced-motion
- **Testing**: Vitest, React Testing Library, supertest

## License

© 2025/2026 Claudette Raynor. All rights reserved.You may not use this for any commercial purpose. You can download this application for personal use only, but you may not modify it.
