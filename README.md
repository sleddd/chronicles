# Chronicles - [mydailychronicles.com](https://mydailychronicles.com)

Chronicles is now available to sign up for beta testing at [mydailychronicles.com](https://mydailychronicles.com/#beta), with a native phone app via React Native planned.

### Dashboard
The home page, where signing in lands, in light, dark or auto mode. A greeting, a Quick entry box that writes any topic with its own fields, world clocks with the weather, and **Your Agenda**: a date strip you can scroll through the calendar, then the day as a timeline. Events and meetings sit at their times, tasks you planned fill the free time around them and med doses show as small icons at their times. Drag a card to another time or stretch it by its foot. Beside the timeline are your priorities, tasks due today, wins, what's coming up and your shopping list. Tasks with no day yet can be dragged straight onto the schedule. The rest are cards you can drag anywhere and fold away: the wellness check-in, shortcuts, the daily quote, today's menu, habits, a quick meal log, a symptom log, recent entries, time tracked and stats. Under the Quick entry and across the top of Your Agenda, cards sit in rows of up to three columns. Drop a card beside another and they share the row two thirds and one third, stack cards in a column, or give one a full-width row of its own. Choose which show, and the theme, from the sliders button. Say what you want to log with **Voice** ("add task call the dentist due Friday"), and a bell at the top shows a dot while a dose, bill, task or meeting is due.

<img width="1600" height="1150" alt="The dashboard in dark mode: the greeting, Quick entry and Your Agenda" src="client/src/assets/landing/dashboard-dark-v3.jpg" />

### Journal
Pick a topic, write a line (or fill in the topic's fields) and save. Topics with fields of their own (tasks, events, meals, symptoms…) lay them out as labelled rows under the text, and a text-only topic is just the writing area. Entries are grouped by month, with Today, All and Bookmarks views and search by keyword, topic and date. The editor has rich text, encrypted photos stored in your own Cloudflare R2 bucket (bring your own key), voice dictation, Apple Pencil handwriting and drawing, bookmarks and public share links. Open an entry from any other page and it shows as a card the width of its fields over the journal, and saving takes you back there. Journal writing gets the full width.

<img width="1268" height="1001" alt="The journal with entries by month and a Sunday entry open" src="client/src/assets/landing/features/journal-dark.jpg" />

### Health
A health dashboard you can rearrange by dragging widgets into rows, with today's nutrition against your goals, a wellness check-in (with a notes box for anything the questions don't ask), quick meal and exercise logging, today's habits and your medication schedule, plus tabs for Meals, Exercise (schedule, training plans and history), Habits, Symptoms, Med list, Med history, Allergies and Reports. A training plan breaks a goal (a climb, a race) into phases with hours per category, and shows each week's progress. Your exercise schedule shows on both dashboards with a timer beside each routine. Stopping it marks the session done. The quick exercise log offers your routines as one-tap chips. Marking a dose taken adds its nutrients (a vitamin D supplement, say) to the day's totals. **Habits** are anything you want to keep doing, each with a target such as 3 times a week or twice a day. Every habit is a small card with a tick for each day, how the week stands against its target and a streak of weeks met. A missed day doesn't break the streak if the week still reaches its target. Pick a habit to see how often you did it over a month, a quarter or a year as a bar chart, with a CSV download. Reports chart water, mood and sleep over time, symptom frequency and severity, and the patterns between them, such as how water, foods or exercise relate to your symptoms. They also line each habit up with your mood or a symptom ("You feel better on days you tick Balance board"). Medication lists, symptom logs and allergy records print for appointments.

<img width="1268" height="1300" alt="The health dashboard: nutrients against goals, the wellness check-in, quick logs, habits and today’s doses" src="client/src/assets/landing/features/health-dashboard-dark.jpg" />

### In-App AI
Optional, and you bring your own key from OpenAI, Claude (Anthropic) or Amazon Bedrock. It estimates calories and nutrients for meals and exercise, and a chat bubble helps with the app and suggests ready-made saves — `/save Meals oatmeal with berries` files a journal entry without going to the AI. The chat and the estimates never see your journal entries, only what you type to them. Chats aren't kept: they're gone when you clear them or sign out, unless you save one to your journal with `/save chat`. Add notes in Settings for things you want the AI to always know. Requests go from your browser straight to the provider, never through the Chronicles server.

Two further features can read your entries, and both are off until you turn them on:

- **AI task planning** — A button on the Planner sends your unscheduled tasks, the tasks already planned, your goals and milestones with their notes, your visions, the names of your goal categories and task types, and the names and times of the next 14 days' events. The AI suggests days and times for tasks, new tasks and milestones, cleaner titles, better filing and the dates that fill out your Roadmap. You review every suggestion, untick what you don't want, and nothing changes until you press Apply. Event moves start unticked.
- **AI insights** — A button on the Journal sends the text of your Journal entries for the last 7 or 30 days, and no other topic. The AI writes a short reflection with prompts you can copy or start a new entry from. The reflection is screened for safety before you see it, and support resources are shown when your writing shows a risk sign.

Each has its own switch in Settings and its own notice to agree to, in every browser you use it from. Every press then shows exactly what will be shared and waits for OK. What is sent leaves Chronicles' encryption and is covered by your provider's terms. The request and the answer are never stored.

<img width="1268" height="900" alt="The AI plan review, with suggested days for tasks and changes to goals to tick or untick" src="client/src/assets/landing/features/ai-plan-dark.jpg" />

### Topics
Entries are organized by topic — tasks, goals, meals, medication, recipes, books, quotes and more — or your own. Add, remove and reorder topics, choose their icons and give them custom fields (text, number, date, yes/no, link). Each topic's page is a table of its entries you can group by month or tag, sort and search. Text entries take tags of your own, and events and meetings list when they start and end and where.

<img width="1268" height="730" alt="The Topics list with an icon and entry count for each topic" src="client/src/assets/landing/features/topics-list-dark.jpg" />

<img width="1268" height="730" alt="Events as a table with when each starts and ends, and where" src="client/src/assets/landing/features/topic-event-dark.jpg" />

### Planning
Your vision and areas of life, then goals, milestones and tasks as lists or on Kanban boards. The lists show each goal's progress as a ring, its start and deadline and how many tasks are done, and each task's priority, the day it's planned and how late it is. Drag a card to another column to change its status, or up and down to set its order. Milestones roll up into goals and tasks into milestones. Todos are tasks with no goal, shown with the rest or on their own. Tasks can sit in Idea / Backlog until you're ready to plan them. Search, sort and filter by goal, milestone, category or status, and save the views you use often. Every card has a timer chip, so you can time a task without opening it.

- **Goal categories** — Give each goal an area of your life (Health, Career, Finances, Relationships, Growth, Home, or your own). Its milestones, tasks and habits take the same category, and you can filter and group by it.
- **Vision** — An overall vision, then a card per area of life with its photo, its vision, its goals and how far along each is, and this week's tasks and habits for it.
- **Roadmap** — Every goal as a bar from its start date to its target date, grouped by category, opening to its milestones. Each bar fills as its milestones are completed. Drag a bar to move it, or drag an end to change one date. View a month, a quarter, a year or five years.
- **Planner** — Your week or a single day at a glance, each day ruled by the hour. Drag tasks from Unscheduled onto a day at the time you want, move them between days, and stretch a card to change how long it takes. Events and meetings sit at their own times and nothing overlaps. Tick a task off on its day. A task set to move on rolls to today if you didn't finish it.

<img width="1268" height="900" alt="Tasks as a list under their goals, with priority, the day planned, the deadline and how late" src="client/src/assets/landing/features/planning-tasks-list-dark.jpg" />

### Time Tracking
Time anything with a tap. Tasks, todos, goals, milestones, exercise and routines each have a timer, and the Time Tracking topic holds anything else you want to track time to ("Writing the novel", "Client: Acme"). One timer runs at a time, a floating timer shows it from any page, and you can add time by hand. The Time tracked card on the dashboard totals today, this week or this month and starts a timer for any activity by name. Your time is encrypted in your browser like everything else.

### Calendar
Day, week and month views of what's scheduled: events and meetings, including ones that repeat, tasks you planned for a day in the Planner, and bills due. The month shows a dot on any day with something on it, with the details beside it and in the day view. US holidays are marked too. Two-way sync with Google Calendar and a private subscription feed for Apple Calendar. Only titles, times and locations are synced, never your journal.

<img width="1268" height="1100" alt="The month view with a dot per kind of item and the chosen day beside it" src="client/src/assets/landing/features/calendar-dark.jpg" />

### From the Kitchen
A kitchen dashboard with today's meals and your shopping list, a weekly menu planner, recipes and shopping lists. Recipes and shopping lists are tables you can group, sort and search, with each recipe's prep and cook times, servings and difficulty, and each list's item count. Recipes have checkable ingredients, numbered steps, a photo and a print view. Link recipes to menu slots and shopping lists, and turn a week's menu into a shopping list in one tap.

<img width="1268" height="730" alt="The kitchen dashboard with today's meals and the shopping list to tick off" src="client/src/assets/landing/features/kitchen-dashboard-dark.jpg" />

### Media Journal
Books, movies, TV shows and music on one shelf. Covers and details are found for you from Open Library, iTunes, TVmaze and Wikipedia (never from an address you type), with half-star ratings, how far through you are, and notes. Each item sits on a shelf: reading or watching, want to, finished, paused or didn't finish. Search, filter by type, shelf and rating, and sort. Bookmark the ones you want to share and they appear on a **public shelf** anyone can open from a link, with the same search and filters. Only the catalogue cover, title, maker, year, rating and shelf are published. Notes, progress and your own photos never are, and turning the shelf off deletes it.

<img width="1268" height="855" alt="The Media Journal: a row of book covers with how far along each one is, the stars and the shelf, under the search and filters" src="client/src/assets/landing/features/media-dark.jpg" />

### Finance (optional)
Off until you turn it on in Settings. A manual budget by category with a chart of where your money goes, bills and subscriptions (mark paid, pay part, mark cleared at the bank, pause, cancel), savings funds, debts you're paying down, money goals, a current balance that keeps itself up to date as you pay bills and log spending, and reports on what you've paid by bill, category, month or year. Filter bills by unpaid, paid or category with a total for each, sort them by due date, name or amount, and work things out with the built-in calculator. It's all encrypted in your browser and there are no bank connections. Export everything as CSV spreadsheets plus a JSON backup. See the [Finance disclaimer](#finance).

<img width="1268" height="1440" alt="The budget with the current balance, and planned, bills, spending and what's left by category" src="client/src/assets/landing/features/finance-dark.jpg" />

### Settings
Your account, theme (light or dark and 30 accent colors), which features are on, calendar sync, entry images, In-App AI, security (passkeys, two-factor authentication, trusted browsers, active sessions, recovery key) and data import and export. Every section folds away.

<img width="1600" height="1150" alt="Settings with the Theme section open: light, dark or auto, and the background photos" src="client/src/assets/landing/settings-dark.jpg" />

## Privacy & Security

- All entry content is encrypted in the browser before transmission
- **Images never touch the Chronicles server** — they are encrypted client-side and uploaded straight to your own R2 bucket with URLs signed in the browser; your R2 credentials are themselves encrypted with your master key, so the server stores only ciphertext it cannot read
- **Two-factor authentication** (TOTP) — no external services; secrets stored encrypted server-side
- Recovery key system allows password reset without compromising zero-knowledge design
- **Your password never leaves your browser** — sign-in sends a separate value derived from it, which can't unlock your data
- **Strong passwords** — a strength meter as you type, and new passwords must be hard to guess (no common passwords, keyboard patterns, or your name or email)
- **Shared computers** — every sign-in starts from a clean browser, so nothing of the last person carries over, and signing out always ends the session on the server
- **Sharing and calendar sync are the deliberate exceptions**, and both are opt-in: a share link stores a plaintext copy of that entry on the server so anyone with the link can read it (revoking the link deletes it), and calendar sync sends event titles, times and locations to Google, or keeps an unencrypted copy of them on the server for the Apple Calendar feed
- Schema-per-user database isolation (not row-level security)
- Session management — view and revoke active sessions from any device
- Non-extractable CryptoKeys — master key cannot be exported from the browser's crypto subsystem
- Split-token sessions — database leaks cannot reconstruct valid session tokens
- **Passkeys** — sign in and open your journal with a fingerprint, face or device PIN. The passkey's own secret opens its copy of your key, and that secret never leaves your device
- **Nothing that opens your journal is stored** — the key lives only in the open tab's memory. A new tab takes it from one that's already open, and 15 minutes away signs you out
- **Trusted browsers** (opt-in, with two-factor on) — skip the code on a browser you use for 30 days. Your password is still asked every time
- **Unsaved writing survives** — what you're typing is sealed with your key as you go and offered back after you sign in again
- **Finance data is zero-knowledge too** — budgets, bills, payments, savings, goals and paydays are encrypted in the browser and stored in their own tables as ciphertext; the server never sees an amount, name or date. There are no bank connections. Chronicles is still not a banking app — see the [Finance disclaimer](#finance)
- **AI is optional and bring-your-own** — when you turn it on, the meal or exercise description you're estimating (or your chat message) goes from your browser straight to the provider you chose; nothing passes through the Chronicles server
- **AI never reads your entries unless you ask it to** — AI task planning and AI insights are separate switches, off by default. Each needs its own consent in each browser, and each press lists what will be sent and waits for OK. What you send is readable by your provider, and nothing sent or returned is stored unencrypted

## Upcoming Features

- **Text to Journal** - Add journal entries by sending a text message
- **Recurring Events in Calendar Sync** - Repeating events sent to Google and Apple Calendar as repeats
- **Calorie Correlation Reporting** - How meals and calories relate to symptoms, mood, and sleep in Health Reports
- **Phone App** - A native iOS/Android app built with React Native, sharing the same encrypted account

## Architecture

This is a complete rebuild combining the best of the original Chronicles UI with a cleaner, modular architecture:

- **Client**: React 19 SPA (Vite) — no Next.js, ready for React Native
- **Server**: Express 5 API with TypeScript
- **Shared**: Crypto, types, validation, and theme tokens shared across platforms
- **Components**: Atomic Design (atoms -> molecules -> organisms -> templates -> views)
- **Styling**: styled-components (CSS-in-JS) on the Chronicles design system (tokens in `client/src/App.tsx`, core primitives in `client/src/components/atoms/core/`): white / deep-charcoal themes, borderless tonal panels, filled inputs, Work Sans display type and Open Sans for UI

```
chronicles/
├── client/          # React SPA (Vite + styled-components + PWA)
├── server/          # Express API (Prisma + PostgreSQL)
├── shared/          # Shared code (crypto, types, theme)
└── docs/            # BLUEPRINT.md, ACCESSIBILITY_UX_PLAN.md, AI_PLANNING_INSIGHTS_PLAN.md, AUTH_REDESIGN_PLAN.md, IMAGES_FEATURE_PLAN.md, SCALE_TEST_REPORT.md, SHARDING.md, THEME_DESIGN_UPDATE.md, compliance/
```

## How It Works

### Finance

An optional, manual money tracker — turn it on in **Settings → Features → Finance** (it's off by default). Nothing connects to your bank: you enter what you want to track, and it's encrypted in your browser like your journal.

- **Current balance** — Type in what you have available once, and it keeps itself current as you mark bills paid and log spending, showing what's left after the bills still due this month.
- **Budget & Bills** — Monthly categories with a planned amount, compared with the bills due that month (counted as soon as you add a bill) and the spending you log. List every bill and subscription with how often it's due and what it costs a month; **Mark paid** records a payment on the bill, and you can pause or cancel subscriptions you're reconsidering. Totals show your monthly and yearly bills and what subscriptions cost you.
- **Goals** — A target amount and date, with a progress bar fed by a savings fund or an amount you enter.
- **Savings** — Named funds (emergency fund, a trip, car repairs) with a log of what you add and take out.
- **Debts** — What you owe on each debt, paid down with a log of payments until it reads Paid off.
- **Reports** — Search what you've paid by bill name, type (bill or subscription) and category, for this or last month, this or last year, or any dates — totals by bill and by month.
- **Calendar** — Bill due dates appear on the calendar.
- **Export** — Settings → Data → Export Finance Data downloads everything, decrypted in your browser, as one ZIP: a spreadsheet each for budget categories, bills, bill payments, spending, savings funds and entries, debts and debt payments, and goals; one sheet of every transaction; and a complete JSON backup. The download is not encrypted, so keep it somewhere safe.

> **Disclaimer:** Chronicles takes reasonable steps to keep your data secure — everything in Finance is encrypted in your browser before it's saved, and the server never sees it. But Chronicles is **not a banking app or a financial service**, and no system is perfectly secure. You are responsible for your financial data: what you choose to store, keeping your own records and backups, and securing your account and devices. By using Finance you accept the risk of storing and maintaining that information here.

### Calendar Sync

Keep Event and Meeting entries in sync with the calendars you already use:

- **Google Calendar (two-way)** — Connect your Google account in Settings → Calendar Sync and pick which calendar to sync to. Events and meetings you create in Chronicles appear there; edits and deletions propagate. Optionally import events created directly in Google (from today onward) as Chronicles entries.
- **Apple Calendar (subscription feed)** — Enable the ICS feed to get a private `webcal://` URL you can subscribe to from iPhone, iPad, or Mac (one-way: Chronicles → Apple Calendar). Regenerate the URL any time if it leaks.

Only event titles, times, and locations are synced — never your journal content. The Apple feed keeps an unencrypted copy of them on the Chronicles server so Apple Calendar can fetch it; turning the feed off deletes it. Requires Google OAuth credentials on the server (see `server/.env.example`); the Apple feed works with no external setup.

### Entry Images

Add up to 7 photos to any journal entry — without giving up zero-knowledge:

1. **Bring your own bucket** — Create a free Cloudflare R2 bucket and an API token (Object Read & Write, scoped to that bucket). Your storage, your bill (R2's free tier has no egress fees).
2. **Enter credentials in Settings → Entry Images** — They autosave as you type, get encrypted with your master key, and are stored as ciphertext the server cannot read. The setup guide in Settings walks through the bucket, token, and the required CORS policy, and an optional "Test connection" verifies everything from your browser.
3. **Attach images in the editor** — Photos are downscaled, encrypted with AES-256-GCM in the browser, and uploaded directly to your bucket with browser-signed URLs. Chronicles' server never sees the images or your credentials — your bucket only ever contains encrypted noise.

Photos show under the entry's text — one larger, several in a row — and a recipe's page leads with its photo; tap any photo for a full-screen lightbox with keyboard and swipe navigation. Deleting an image or an entry (including bulk delete) also removes the objects from your bucket. Sharing is automatically disabled for entries that contain images — except recipes, which share only their formatted text while the photo stays in your bucket.

### Settings

Each section is a collapsible card (all start collapsed; Settings remembers which you open):

- **Account** - Username, display name (edit in place), email (changing it asks for your password), how you'd like to hear about a security incident, the welcome tour, and delete account (asks for your password, plus a 2FA code when 2FA is on)
- **Preferences** - Timezone (weather cities are set from the dashboard's Theme and layout panel)
- **Theme** - Light, dark or auto, 30 accent color presets, and a background photo (or one of your own)
- **Features** - Turn on or off meals, medication, goals, milestones, exercise, allergies, cycle tracking, holidays, the Media journal (and its public shelf) and inspiration; Finance is off until you turn it on
- **Calendar Sync** - Connect Google Calendar, choose the target calendar, toggle imports, manage the Apple ICS feed, and clean up old events
- **Entry Images** - Toggle the feature, enter your Cloudflare R2 credentials (autosaved and master-key encrypted), test the connection, and follow the built-in setup guide
- **In-App AI** - Choose Claude, Amazon Bedrock, or OpenAI, add your credentials and model, and leave notes for the chat assistant. Switch on the chat, AI task planning and AI insights separately. The last two show a notice to agree to first
- **Security** - Passkeys, change password, active sessions, recovery key, two-factor authentication (TOTP setup wizard with QR code and backup codes) and trusted browsers
- **Data** - Default topics, seed test data (and sample Finance data when Finance is on), export to CSV, export all Finance data (a ZIP of spreadsheets plus a JSON backup), import entries (CSV) and a Daily Log (JSON) — each import has a downloadable example file
- **Feedback/Report a Bug**, **Privacy** and **Sign Out**

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 15+

### Installation

1. Clone the repository (it's invite-only: email support@mydailychronicles.com for an invite, or for a zip file)

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
   Sign-up is closed by default: approve each email with
   `npm run beta -- --approve <email>` (or, outside production, list them in `REGISTRATION_WHITELIST` — it is ignored when `NODE_ENV=production`). Sign-up links last 30 days.
   `REGISTRATION_OPEN=true` lets anyone create an account on your server.

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
- At least one uppercase letter, lowercase letter, number and symbol
- Hard to guess: a strength meter shows as you type, and common passwords, keyboard patterns and your own name or email are refused

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

© 2025–2026 Claudette Raynor. All rights reserved.

**Personal copies are welcome, on request.** The repository is invite-only. Email support@mydailychronicles.com and you'll be invited to it or sent a zip file. Run your copy yourself, and change your own copy however you like on your own devices. **Commercial use of any kind is prohibited**, including selling it, charging for access, hosting it as a service, using it for a business or client, and distributing it through any app store or marketplace (paid or free). The license covers the **visual design, theme system and assets** (layouts, look and feel, design tokens and colour palettes, the name, logo, icons, screenshots and artwork) as well as the code, whether copied or closely recreated. See [LICENSE](LICENSE) for the full terms.

**No distribution — not even non-commercial.** "Personal, non-commercial use" means *using* it yourself. It does not mean you may share it. You may not copy, re-host, mirror, upload, bundle or hand out Chronicles (original or changed, source or built, whole or in part) to anyone, free or paid, public or private — friends and family included. Anyone who wants a copy asks for one at support@mydailychronicles.com. Your own changes stay on your own machine; the only way to share a change is a pull request to this repository (LICENSE, Section 6).

**Contributions.** Pull requests and bug reports through GitHub issues are welcome. Contributions don't change the license: the app stays personal-use only, and anything you contribute can be used in Chronicles (see LICENSE, Section 6). Please keep personal or health information out of issues, and report security problems privately to support@mydailychronicles.com. You can also report a bug or send feedback in the app (Settings → Feedback/Report a Bug).
