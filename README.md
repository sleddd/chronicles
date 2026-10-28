# Chronicles - [mydailychronicles.com](https://mydailychronicles.com)

<img width="1439" height="639" alt="Screenshot 2026-10-20 at 7 11 07 PM" src="https://github.com/user-attachments/assets/7241bf25-198b-45ad-9ce2-2444c3c8fe39" />

## A Tour of Chronicles
Chronicles is now available to sign up for beta testing at [mydailychronicles.com](https://mydailychronicles.com/#beta), with a native phone app via React Native planned.

### Dashboard
Your day at a glance, in light or dark mode: a greeting with the date and local weather, a daily quote or your next medications, a wellness check-in for water, sleep, mood and cycle, world clocks, today's priorities, what's coming up, today's menu, your medication doses and your open shopping list. Choose which sections show with **Customize view**.
<img width="1600" height="1000" alt="dashboard-dark" src="https://github.com/user-attachments/assets/553e4f1e-126a-46c5-8ae0-cedbc3c99034" />
<img width="1268" height="1300" alt="dashboard" src="https://github.com/user-attachments/assets/4730ff94-ecf0-4fe6-82c5-cd69398f5411" />
<img width="1268" height="1300" alt="dashboard-2" src="https://github.com/user-attachments/assets/be1ce9b0-5700-4340-a0e2-94758b429036" />

### Journal
The main view, and where the app opens. Pick a topic, write a line (or fill in the topic's fields) and save. Entries are grouped by month, with Today, All and Bookmarks views and search by keyword, topic and date. The editor has rich text, encrypted photos stored in your own Cloudflare R2 bucket( Bring your key), voice dictation, Apple Pencil handwriting and drawing, bookmarks and public share links. Open an entry from any other page and saving takes you back there.

<img width="1460" height="738" alt="Screenshot 2026-10-17 at 9 44 50 PM" src="https://github.com/user-attachments/assets/063bd93e-17e8-4b6b-9951-366ab3ef7b8c" />

### Health
A health dashboard with today's nutrition against your goals, a wellness check-in, quick meal and exercise logging and your medication schedule, plus tabs for Meals, Exercise, Symptoms, Med list and Allergies. Marking a dose taken adds its nutrients (a vitamin D supplement, say) to the day's totals. Reports chart water, mood and sleep over time, symptom frequency and severity, and the patterns between them, such as how water, foods or exercise relate to your symptoms. Medication lists, symptom logs and allergy records print for appointments.

<img width="1268" height="1300" alt="health-dashboard" src="https://github.com/user-attachments/assets/f56348ea-cfec-41c8-a77a-0b5b22549104" />
<img width="1268" height="1300" alt="health-exercise" src="https://github.com/user-attachments/assets/f97909b2-053c-4b25-8e42-b5ba83b4a891" />
<img width="1268" height="1300" alt="health-meals" src="https://github.com/user-attachments/assets/3809319c-1f79-4125-80b5-7d8b348432ad" />
<img width="1268" height="1300" alt="health-reports" src="https://github.com/user-attachments/assets/1938f2ee-20cf-456a-b232-6bdb48eec498" />
<img width="1268" height="1293" alt="health-reports-symptoms" src="https://github.com/user-attachments/assets/c21cc625-26e4-4fba-bbb0-4b0092493a2a" />
<img width="1268" height="1300" alt="health-med-history" src="https://github.com/user-attachments/assets/80e29f46-29a7-4435-b4e7-1d3d468cc71a" />

### In-App AI
Optional, and you bring your own key from OpenAI, Claude (Anthropic) or Amazon Bedrock. It estimates calories and nutrients for meals and exercise, and a chat bubble helps with the app and suggests ready-made saves — `/save Meals oatmeal with berries` files a journal entry without going to the AI. The AI never sees your journal entries, only what you type to it. Chats aren't kept: they're gone when you clear them or sign out, unless you save one to your journal with `/save chat`. Add notes in Settings for things you want the AI to always know. Requests go from your browser straight to the provider, never through the Chronicles server.

<img width="1460" height="735" alt="Screenshot 2026-10-17 at 9 46 26 PM" src="https://github.com/user-attachments/assets/a6c25896-569a-4ea7-8172-1a3ddac153d0" />

### Topics
Entries are organized by topic — tasks, goals, meals, medication, recipes, books, quotes and more — or your own. Add, remove and reorder topics, choose their icons and give them custom fields (text, number, date, yes/no, link). Each topic's page lists its entries by month, with search. A topic can hide the text area so its entries are fields only, titled from what you filled in ("Piranesi — Susanna Clarke").

<img width="1454" height="746" alt="Screenshot 2026-10-17 at 9 47 38 PM" src="https://github.com/user-attachments/assets/c7177ae8-6287-44d3-97d3-58ea72660437" />
<img width="1464" height="731" alt="Screenshot 2026-10-17 at 9 47 49 PM" src="https://github.com/user-attachments/assets/9dbbb374-3cd1-4ea6-bb44-382f754a276f" />

### Planning
Goals, milestones, tasks and todos on Kanban boards or as lists. Drag a card to another column to change its status, or up and down to set its order. Milestones roll up into goals and tasks into milestones. Search, sort and filter by goal, milestone or status, and save the views you use often.

<img width="1460" height="732" alt="Screenshot 2026-10-17 at 9 52 16 PM" src="https://github.com/user-attachments/assets/c3f87add-04a1-4e2b-afe0-4ad9d32a6ea5" />
<img width="1455" height="734" alt="Screenshot 2026-10-17 at 9 52 02 PM" src="https://github.com/user-attachments/assets/bf3f6c0e-b0c3-4acb-9267-faffa85be020" />

### Calendar
Day, week and month views of what's scheduled: events, meetings, task deadlines, goal target dates and bills due. Two-way sync with Google Calendar and a private subscription feed for Apple Calendar. Only titles, times and locations are synced, never your journal.

<img width="1458" height="734" alt="Screenshot 2026-10-17 at 9 52 26 PM" src="https://github.com/user-attachments/assets/af8680bb-0fad-4699-85a8-dca4f166affb" />

### From the Kitchen
A kitchen dashboard with today's meals and your shopping list, a weekly menu planner, recipes and shopping lists. Recipes have checkable ingredients, numbered steps, a photo and a print view. Link recipes to menu slots and shopping lists, and turn a week's menu into a shopping list in one tap.

<img width="1458" height="735" alt="Screenshot 2026-10-17 at 9 54 58 PM" src="https://github.com/user-attachments/assets/254e2ef1-d66c-4d53-b66e-b8d8fec047b9" />
<img width="1450" height="740" alt="Screenshot 2026-10-17 at 9 55 07 PM" src="https://github.com/user-attachments/assets/0670fe02-87e2-422e-83fe-48a1da800f8c" />
<img width="1120" height="743" alt="Screenshot 2026-10-17 at 9 56 35 PM" src="https://github.com/user-attachments/assets/f2934c16-c80b-410c-a2a7-08f794a5b4d7" />
<img width="1455" height="726" alt="Screenshot 2026-10-17 at 9 55 39 PM" src="https://github.com/user-attachments/assets/af53e857-de29-423e-bebb-e1e696db768d" />

### Finance (optional)
Off until you turn it on in Settings. A manual budget by category, bills and subscriptions (mark paid, pause, cancel), savings funds, money goals, and reports on what you've paid by bill, category, month or year, with an optional paycheck reconcile. It's all encrypted in your browser and there are no bank connections. Export everything as CSV spreadsheets plus a JSON backup. See the [Finance disclaimer](#finance).

<img width="1464" height="739" alt="Screenshot 2026-10-17 at 9 52 36 PM" src="https://github.com/user-attachments/assets/67bd72a4-63e2-4dbd-8748-890fd9ed1fda" />
<img width="1448" height="743" alt="Screenshot 2026-10-17 at 9 52 47 PM" src="https://github.com/user-attachments/assets/dfa05480-7530-47ab-80c5-e4eac0ced4ad" />
<img width="1460" height="739" alt="Screenshot 2026-10-17 at 9 52 58 PM" src="https://github.com/user-attachments/assets/ea31a2eb-9e5a-486a-9f21-04ed740edae1" />
<img width="1454" height="737" alt="Screenshot 2026-10-17 at 9 53 09 PM" src="https://github.com/user-attachments/assets/043bcf4c-5563-4dde-9af6-c1b55f2c12c0" />
<img width="1461" height="724" alt="Screenshot 2026-10-17 at 9 53 24 PM" src="https://github.com/user-attachments/assets/614fc048-3aa9-4fcf-89c8-5bb58ef5f0dd" />
<img width="1109" height="742" alt="Screenshot 2026-10-17 at 9 56 44 PM" src="https://github.com/user-attachments/assets/08c2d2f0-aff8-4c55-abef-bc7cd312eabd" />

### Settings
Your account, theme (light or dark and 30 accent colors), which features are on, calendar sync, entry images, In-App AI, security (two-factor authentication, Remember me, active sessions, recovery key) and data import and export. Every section folds away.

<img width="1456" height="734" alt="Screenshot 2026-10-17 at 9 55 55 PM" src="https://github.com/user-attachments/assets/28b58f16-c629-446f-ac54-75acaaded3dd" />

## Privacy & Security

- All entry content is encrypted in the browser before transmission
- **Images never touch the Chronicles server** — they are encrypted client-side and uploaded straight to your own R2 bucket with URLs signed in the browser; your R2 credentials are themselves encrypted with your master key, so the server stores only ciphertext it cannot read
- **Two-factor authentication** (TOTP) — no external services; secrets stored encrypted server-side
- Recovery key system allows password reset without compromising zero-knowledge design
- **Your password never leaves your browser** — sign-in sends a separate value derived from it, which can't unlock your data
- **Sharing and calendar sync are the deliberate exceptions**, and both are opt-in: a share link stores a plaintext copy of that entry on the server so anyone with the link can read it (revoking the link deletes it), and calendar sync sends event titles, times and locations to Google, or keeps an unencrypted copy of them on the server for the Apple Calendar feed
- Schema-per-user database isolation (not row-level security)
- Session management — view and revoke active sessions from any device
- Non-extractable CryptoKeys — master key cannot be exported from the browser's crypto subsystem
- Split-token sessions — database leaks cannot reconstruct valid session tokens
- **Remember me** (opt-in, for personal devices) — stay unlocked until the browser closes; the browser keeps only an encrypted copy of the key, and the server holds the matching secret in memory only, never on disk
- **Finance data is zero-knowledge too** — budgets, bills, payments, savings, goals and paydays are encrypted in the browser and stored in their own tables as ciphertext; the server never sees an amount, name or date. There are no bank connections. Chronicles is still not a banking app — see the [Finance disclaimer](#finance)
- **AI is optional and bring-your-own** — when you turn it on, the meal or exercise description you're estimating (or your chat message) goes from your browser straight to the provider you chose; nothing passes through the Chronicles server

## Upcoming Features

- **Text to Journal** - Add journal entries by sending a text message
- **Recurring Calendar Events** - Events and meetings that repeat on a schedule
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
└── docs/            # BLUEPRINT.md, ACCESSIBILITY_UX_PLAN.md, IMAGES_FEATURE_PLAN.md, THEME_DESIGN_UPDATE.md
```

## How It Works

### Finance

An optional, manual money tracker — turn it on in **Settings → Features → Finance** (it's off by default). Nothing connects to your bank: you enter what you want to track, and it's encrypted in your browser like your journal.

- **Budget & Bills** — Monthly categories with a planned amount, compared with the bills due that month (counted as soon as you add a bill) and the spending you log. List every bill and subscription with how often it's due and what it costs a month; **Mark paid** records a payment on the bill, and you can pause or cancel subscriptions you're reconsidering. Totals show your monthly and yearly bills and what subscriptions cost you.
- **Goals** — A target amount and date, with a progress bar fed by a savings fund or an amount you enter.
- **Savings** — Named funds (emergency fund, a trip, car repairs) with a log of what you add and take out.
- **Reconcile** *(its own opt-in switch)* — For each paycheck: your bank balance once everything has posted, the bills you're paying, and what's left to spend. Tick each line as it clears the bank, then check your current balance against what it should be ("Matches" or "Off by $X").
- **Reports** — Search what you've paid by bill name, type (bill or subscription) and category, for this or last month, this or last year, or any dates — totals by bill and by month.
- **Calendar** — Bill due dates appear on the calendar.
- **Export** — Settings → Data → Export Finance Data downloads everything, decrypted in your browser, as one ZIP: a spreadsheet each for budget categories, bills, bill payments, spending, savings funds and entries, goals, paydays and payday lines; one sheet of every transaction; and a complete JSON backup. The download is not encrypted, so keep it somewhere safe.

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

Star an image to feature it as a full-width banner above the entry (recipes use it as their photo, and goal cards show it as a small round picture); tap any thumbnail for a full-screen lightbox with keyboard and swipe navigation. Deleting an image or an entry (including bulk delete) also removes the objects from your bucket. Sharing is automatically disabled for entries that contain images — except recipes, which share only their formatted text while the photo stays in your bucket.

### Settings

Each section is a collapsible card (all start collapsed; Settings remembers which you open):

- **Account** - Username, display name (edit in place), email (changing it asks for your password), and delete account (asks for your password, plus a 2FA code when 2FA is on)
- **Preferences** - Timezone (weather cities are set from the dashboard's Customize view)
- **Theme** - Light/dark mode and 30 accent color presets
- **Features** - Turn on or off meals, medication, goals, milestones, exercise, allergies, cycle tracking, entertainment and inspiration; Finance and paycheck reconcile are off until you turn them on
- **Calendar Sync** - Connect Google Calendar, choose the target calendar, toggle imports, manage the Apple ICS feed, and clean up old events
- **Entry Images** - Toggle the feature, enter your Cloudflare R2 credentials (autosaved and master-key encrypted), test the connection, and follow the built-in setup guide
- **In-App AI** - Choose Claude, Amazon Bedrock, or OpenAI, add your credentials and model, and leave notes for the chat assistant
- **Security** - Remember me, change password, active sessions, recovery key, and two-factor authentication (TOTP setup wizard with QR code and backup codes)
- **Data** - Default topics, seed test data (and sample Finance data when Finance is on), export to CSV, export all Finance data (a ZIP of spreadsheets plus a JSON backup), import entries (CSV) and a Daily Log (JSON) — each import has a downloadable example file
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

© 2025–2026 Claudette Raynor. All rights reserved.

You may download and use this application for personal use only. You may change your own copy and run your changes on your own devices for your own use. Commercial use and redistribution (changed or not) are strictly prohibited. See [LICENSE](LICENSE) for the full terms.

**No distribution — not even non-commercial.** "Personal, non-commercial use" means *using* it yourself. It does not mean you may share it. You may not copy, re-host, mirror, upload, bundle or hand out Chronicles (original or changed, source or built, whole or in part) to anyone, free or paid, public or private — friends and family included. Anyone who wants it gets it from this repository. Your own changes stay on your own machine; the only way to share a change is a pull request to this repository (LICENSE, Section 4).

**Contributions.** Pull requests and bug reports through GitHub issues are welcome. Contributions don't change the license: the app stays personal-use only, and anything you contribute can be used in Chronicles (see LICENSE, Section 4). Please keep personal or health information out of issues, and report security problems privately to support@mydailychronicles.com. You can also report a bug in the app (Settings → Report a Bug).
