# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chronicles is a **zero-knowledge encrypted journal application** rebuilt as a **React + Express monorepo** (no Next.js) for React Native readiness. The server never sees plaintext user data.

Key privacy guarantees:
- All entry content encrypted client-side with AES-256-GCM before transmission
- Non-extractable CryptoKeys — master key cannot be exported from the browser's crypto subsystem
- Split-token sessions — database leaks cannot reconstruct valid tokens
- Recovery key provided at registration for password recovery

## UI Design Rules

The canonical visual spec is the **`design-system/`** folder — specifically the runnable
mini-app at `design-system/Chronicles Desktop App/` (`app.jsx` + `index.html`), the binding
rules in `design-system/CLAUDE.md`, and the token source `design-system/tokens/*.css`. All UI
implementation must match this. (The old `design_handoff/chronicles-design-system.html`
paper/serif spec is retired.)

### Design Philosophy
- **Borderless tonal panels** — Pure-white canvas (light) / deep-charcoal `#1b1d26` (dark).
  Cards and inputs separate from the canvas by **fill tone**, not outline. Visible borders are
  hairline dividers only. **Inputs are filled** (`--bg-sunken`), not outlined.
- **Dashboard widgets are borderless flat sections** (per the `app.jsx` mini-app, which is
  canonical): a 1px `--border-subtle` *top rule* + a tracked-uppercase label row, with content
  sitting directly on the canvas — NOT bordered/filled tiles. The grid is `2fr / 1fr` with a
  24px gap and **no vertical divider** between columns.
- **Sharp, squared corners** — Cards/tiles ~2px (`--r-lg`), inputs/buttons ~1px (`--r-md`).
  Only avatars, switches, dots, and the active-nav nothing-else go round (`--r-full`).
- **Flat elevation** — Depth is tonal layering, **never shadow** on resting panels. Shadows
  (`--shadow-lg/xl`) are reserved for floating overlays: dropdown menus, dialogs, toasts.
- **One confident accent** — A single user-selectable accent marks exactly one active/selected
  thing (a solid accent block, or a 2px accent left-bar + faint accent tint). Never decorative.
  A 3px accent stripe pins the very top of the app chrome.
- **Type** — **Work Sans** for display/headings, set **thin (Light/200–300)** for an airy feel;
  **Open Sans** for UI, body, and metadata (uppercase + `~0.14em` tracking). Sentence case in UI.

### Two Themes: Light (white) and Dark (charcoal)
Switched via `data-theme="dark"` on `<html>` (driven by `uiStore.themeMode`). The token layer
is injected in `client/src/App.tsx`. DS semantic tokens (use these for new work):
- `--bg-app`, `--bg-surface`, `--bg-sunken`, `--bg-hover`, `--bg-active` — surface layers
- `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-disabled` — text tones
- `--border-subtle`, `--border-default`, `--border-strong` — hairline borders
- `--color-accent`, `--color-accent-hover`, `--color-accent-subtle`, `--on-accent`,
  `--accent-100..800` — accent scale derived programmatically from the user's hex
- `--font-display` (Work Sans), `--font-sans` / `--font-label` (Open Sans)

**Legacy aliases** (`--paper*`, `--ink*`, `--rule*`, `--btn-primary*`, `--accent-fill*`, `--mono`)
still resolve, remapped to DS values in `App.tsx`, so existing components recolor automatically.
Prefer the DS-named tokens in new/edited code.

### Accent customization
Settings → Appearance offers **7 named DS presets** (Ink, Sage, Clay, Amber, Teal, Rose, Slate)
as quick chips, plus the full 45-color hex grid as "custom". Any hex feeds `--color-accent` and
`deriveAccentScale()` builds the `--accent-100..800` ramp (brightened one notch in dark).

### Shape & Icon Rules
- **Icons are plain** — Topic icons are plain FontAwesome/Lucide-weight stroke icons. No circle
  backgrounds, no colored dot indicators.
- **Icon colors — body text** — Topic icons in entry cards, topic sidebar, and topic selector
  dropdowns use `--text-primary` (body font color), not the accent or a muted color.
- **Active nav = solid accent block** with `--on-accent` (white) text/icon.
- **Wellness icon unselected color** — Tap-to-fill icons use `--border-strong`/`--text-tertiary`
  when not selected; the accent when filled.

### Component-specific Rules
- **No `window.confirm`** — Safari on iPad blocks pop-ups by default, silently returning `false`. Use inline state-based confirmation or delete directly. Never use `window.confirm` / `window.alert` / `window.prompt`.
- **TipTap node views with overlays** — Always portal overlays (`position: fixed`) from TipTap `NodeViewWrapper` to `document.body` via `createPortal`. The node view DOM can create stacking contexts that trap pointer events.

## Commands

```bash
# From root (monorepo)
npm run dev              # Start both client (port 5173) and server (port 3001)
npm run build            # Build all packages (shared → server → client)
npm run test             # Run all tests (shared + server + client)
npm run test:coverage    # Run tests with coverage

# Client only
cd client
npm run dev              # Vite dev server
npm run build            # Vite production build
npm run test             # Vitest (jsdom environment)

# Server only
cd server
npm run dev              # tsx watch (hot reload)
npm run build            # tsc compile
npm run test             # Vitest (node environment)
npx prisma generate      # Regenerate Prisma client after schema changes
npx prisma db push       # Push schema to database
npx prisma migrate dev   # Create and apply migration
npm run migrate:tenants  # Run tenant schema migrations

# Shared only
cd shared
npm run build            # tsc compile
npm run test             # Vitest
```

## Architecture

### Monorepo Structure

```
chronicles-rebuild/
├── design_handoff/      # Canonical design spec (HTML + screenshots); source of truth for all UI
│   ├── chronicles-design-system.html  # Full component library with CSS variables
│   └── screenshots/     # Reference screenshots (desktop/mobile, Paper/Midnight)
│
├── shared/              # Shared code (web + future React Native)
│   └── src/
│       ├── crypto/      # Stateless encryption service (AES-256-GCM, PBKDF2)
│       ├── types/       # TypeScript interfaces (Post, Taxonomy, User, Session, Settings)
│       ├── validation/  # Zod schemas for API request/response validation
│       └── theme/       # Design tokens, accent colors, background images
│
├── server/              # Express 5 API
│   ├── prisma/
│   │   └── schema.prisma  # Auth schema (Account, Session, SchemaCounter)
│   └── src/
│       ├── db/
│       │   ├── prisma.ts              # Prisma client singleton
│       │   ├── schemaManager.ts       # Tenant schema creation/deletion
│       │   └── tenantQueries.ts       # Typed CRUD queries for tenant tables
│       ├── middleware/
│       │   ├── auth.ts                # Split-token session validation + CSRF
│       │   └── security.ts            # CSP, HSTS, X-Frame-Options headers
│       └── routes/
│           ├── auth.ts                # Register, login, logout, salt, change-password, recover, TOTP 2FA
│           ├── entries.ts             # CRUD for journal entries (encrypted)
│           ├── topics.ts              # CRUD for topics/taxonomies
│           ├── settings.ts            # Key-value settings
│           ├── sessions.ts            # List, revoke, revoke-all sessions
│           └── doses.ts               # Medication dose log CRUD
│
├── client/              # React 19 SPA (Vite)
│   └── src/
│       ├── components/
│       │   ├── atoms/       # Indivisible UI primitives (TextInput, Button, HeaderBar, SectionDivider, Watermark, etc.)
│       │   ├── molecules/   # Atom combinations (InlineWeather, FormField, EntryMeta, etc.)
│       │   ├── organisms/   # Complex sections with store access (Header, Sidebar, Editor, EntryList, LoginForm, etc.)
│       │   └── templates/   # Layout skeletons (AuthTemplate, AppTemplate)
│       ├── views/           # Route-level components (LoginView, RegisterView, JournalView, SettingsView)
│       ├── contexts/        # React contexts (AuthContext, EncryptionContext)
│       ├── stores/          # Zustand stores (uiStore, entriesStore)
│       ├── services/        # API client with CSRF headers (api.ts)
│       └── styles/          # GlobalStyle, styled-components theme augmentation
│
└── docs/
    └── BLUEPRINT.md     # Full architectural plan with all design decisions
```

### Multi-Tenant Schema-per-User Database

Each user gets an isolated PostgreSQL schema. This is **not** row-level security.

```
PostgreSQL Database
├── public schema (shared)
│   ├── accounts - authentication + encryption params
│   ├── sessions - split-token sessions (selector + verifierHash)
│   └── schema_counter - atomic counter for unique schema names
│
├── usr_1_a1b2c3 (user 1's isolated schema)
│   ├── _migrations - schema version tracking for JIT migrations
│   ├── settings - key-value store (JSONB)
│   ├── taxonomies - topics with icon and color
│   ├── posts - encrypted content + metadata (BYTEA)
│   └── post_taxonomies - many-to-many relationships
│
└── usr_2_d4e5f6 (user 2's isolated schema)
    └── ... same tables
```

**Schema naming**: `usr_{counter}_{random_hex}` — NOT derived from user info for security.

### Two-Layer Security Model

1. **Authentication Layer (Server)**: bcrypt password hash (12 rounds), split-token database sessions with immediate revocation, optional TOTP 2FA
2. **Encryption Layer (Client)**: AES-256-GCM with auto-generated master key wrapped by password-derived KEK (PBKDF2-SHA256, 600k iterations)

Password changes only re-wrap the master key (instant). Data is never re-encrypted on password change.

### TOTP Two-Factor Authentication

Implemented via `otplib` — no external services required.

**Login flow when 2FA is enabled:**
- `POST /api/auth/login` returns `{ pendingToken, requires2FA: true }` instead of a session
- Client shows OTP screen; user enters code from authenticator app or a backup code
- `POST /api/auth/login/2fa` verifies the code and issues the real split-token session
- Pending tokens are stored in-memory with 5-minute TTL (single-instance safe for Render)

**Setup flow (Settings → Security):**
1. `POST /api/auth/2fa/setup` — generates TOTP secret + QR code (not saved yet)
2. User scans QR code and enters confirmation code
3. `POST /api/auth/2fa/enable` — verifies code, saves secret to `accounts` table, issues 8 one-time backup codes
4. `DELETE /api/auth/2fa` — disables 2FA after password confirmation

**Schema**: `totpSecret` and `totpEnabled` added to `accounts` table.

### Split-Token Session Strategy

Instead of storing a single token, sessions use a **Selector + Verifier** pattern:
- **Selector** (12 hex chars): DB lookup key (indexed)
- **Verifier** (32 hex chars): Only SHA-256 hash stored in DB; raw verifier sent to client
- **Cookie path**: Enforces `X-Requested-With` header for CSRF protection
- **Bearer path**: For React Native (no CSRF risk from secure storage)
- **Activity debounce**: `lastActiveAt` only updated if 15+ minutes stale (fire-and-forget)

### Recovery Key System

The master key is wrapped with two different keys:
1. **Password-derived key** (PBKDF2) — for normal login
2. **Recovery key** — for password recovery

At registration:
- Client generates a random master key and recovery key (32 bytes each)
- Master key wrapped with password-derived key (stored as `encryptedMasterKey`)
- Master key also wrapped with recovery key (stored as `recoveryWrappedMK`)
- Recovery key shown once to user — must be saved

### Encryption Specification

```
Algorithm: AES-256-GCM
IV: Random 12 bytes per encryption operation
Key Derivation: PBKDF2-SHA256, 600,000 iterations (OWASP 2024)
Salt: 16 bytes random per user
Master Key: Non-extractable CryptoKey (cannot be exported from Web Crypto)
Content: Encrypted client-side, stored as BYTEA in PostgreSQL
Search: Client-side on decrypted data (no server-side search tokens)
```

### Atomic Design Component Architecture

```
Atoms     → Props ONLY (pure components, no hooks, no stores)
Molecules → Props ONLY (compose atoms, still pure)
Organisms → CAN use Zustand hooks + contexts (smart layer)
Templates → Layout only (slots for children)
Views     → Route logic + top-level data orchestration
```

**React Native swap**: Replace atoms + templates. Organisms, stores, contexts, and services stay the same.

### Routes

| Path | View |
|------|------|
| `/` | DashboardView (home) |
| `/journal` | JournalView |
| `/topics` | TopicsView |
| `/calendar` | CalendarView |
| `/settings` | SettingsView |
| `/goals`, `/goals/milestones`, `/goals/tasks`, `/goals/todos` | Goals/planning views |
| `/goals/filter` | PlannerFilterView — cross-hierarchy search/filter |
| `/health/*` | Health tracking views — tabs: Dashboard, Meds (`/health/schedule`), Meals (`/health/food`), Exercise, Symptoms, Med List (`/health/meds`), Allergies, Reports |
| `/kitchen`, `/menu`, `/menu/recipes`, `/shopping` | From the Kitchen — tabs: Dashboard, Menu, Recipes, Shopping Lists (`MealsTabBar`, title `KITCHEN_TITLE`); `/menu/meals` redirects to `/health/food` |
| `/entertainment/*`, `/inspiration/*` | Media/inspiration views |

### Key Files

**Database & Auth:**
- `server/prisma/schema.prisma` — Account (with encryption fields), Session (split-token), SchemaCounter
- `server/src/db/schemaManager.ts` — Creates per-user schemas with `_migrations` tracking
- `server/src/db/tenantQueries.ts` — Typed CRUD for posts, taxonomies, settings, relationships
- `server/src/middleware/auth.ts` — Split-token validation, CSRF branching, session helpers

**Encryption (Shared):**
- `shared/src/crypto/primitives.ts` — Web Crypto wrappers (non-extractable keys)
- `shared/src/crypto/encryptionService.ts` — Stateless orchestration (encrypt/decrypt posts, setup, unwrap, rewrap)
- `shared/src/crypto/constants.ts` — AES_KEY_LENGTH, PBKDF2_ITERATIONS, etc.

**Client State:**
- `client/src/contexts/AuthContext.tsx` — Session state, login/logout/register, `pending2FA` state for TOTP flow
- `client/src/contexts/EncryptionContext.tsx` — Master key lifecycle, encrypt/decrypt delegation
- `client/src/stores/uiStore.ts` — Search, sidebar, view mode, theme colors, `pencilOnly` toggle, `displayName`, `weatherEnabled`, `weatherCity`, `topicCustomFields` (user-defined field defs per topic)
- `client/src/types/userFields.ts` — `UserFieldDef` (id, label, type) and `TopicCustomFields = Record<number, UserFieldDef[]>`
- `client/src/utils/stripHtml.ts` — also exports `summarizeUserFields(defs, values)` for auto-content generation
- `client/src/stores/entriesStore.ts` — Encrypted entries cache, topics, feature flags, CRUD operations

**Client Services:**
- `client/src/services/api.ts` — Single API client with `X-Requested-With` CSRF header; fetches up to 5,000 entries on init; includes 2FA endpoints (`login2fa`, `setup2fa`, `enable2fa`, `disable2fa`)

**Journal View:**
- `client/src/views/JournalView.tsx` — Two-panel layout (entry list + editor); preserves `_widgetType` through saves so wellness check-in entries remain linked; date filter bar shown when `viewMode === 'date'` with active date label and Clear button; topic filter bar shown when a topic is active

**Dashboard:**
- `client/src/views/DashboardView.tsx` — Home view with drag-and-drop widgets; saves widget order to localStorage
  - Widget IDs: `quick-entry`, `priorities`, `events`, `tasks`, `shopping`, `meds`, `weather`, `menu-plan`, `affirmations`, `wellness`, `mini-calendar`
  - Default left column: `quick-entry`, `priorities`, `events`, `menu-plan`
  - Default right column: `mini-calendar`, `affirmations`, `wellness`
  - Priorities widget auto-creates a "Priorities" topic on first save
  - Events widget shows Event + Meeting topic entries with `startDate`, up to 10, 90-day lookahead
  - Meds widget only renders when active medication entries exist
  - Wellness widget: tap-to-fill water glasses (8), mood faces (5), sleep hours (10 cloud-moon icons), period toggle, and flow intensity (4 levels); debounced save with optimistic store updates; reactive to journal edits via Zustand; auto-creates "Wellness" topic so entries appear in journal
  - Mini Calendar widget: monthly grid with entry-presence dots; clicking a day sets `viewMode: 'date'` and navigates to journal filtered to that day

**New Design System Atoms/Molecules:**
- `client/src/components/atoms/HeaderBar.tsx` — Sticky 3-zone header (left/center/right slots); accepts accent background color and dark-mode flag
- `client/src/components/atoms/SectionDivider.tsx` — Hairline rule or labeled divider (italic label flanked by `--rule` lines); supports dashed variant
- `client/src/components/atoms/Watermark.tsx` — Fixed full-screen decorative SVG layer at 4–6% opacity behind content (`z-index: 0`, `pointer-events: none`); flips opacity by theme
- `client/src/components/molecules/InlineWeather.tsx` — Temperature + icon via Open-Meteo; geocodes city; accepts `$light` prop for header use; displayed inline next to date in page header

**Apple Pencil / Drawing:**
- `client/src/components/atoms/DrawingCanvas.tsx` — Full-screen freehand canvas using `perfect-freehand`; pointer events with pressure sensitivity; palm rejection (`pencilOnly` mode); serializes strokes to SVG on save
- `client/src/components/tiptap/DrawingNode.tsx` — TipTap block node extension (`type: drawing`, `atom: true`); renders saved SVG inline with hover-to-edit; portals canvas to `document.body` to avoid stacking context issues

### Querying User Data

User-specific tables require raw SQL via `tenantQueries.ts`:
```typescript
import { getAllPosts, createPost } from './db/tenantQueries.js';

// Schema name comes from authenticated session (never from client)
const posts = await getAllPosts(req.auth.tenantSchemaName);
```

## Features

### Implemented

**Foundation**
- User authentication with bcrypt + split-token sessions
- Client-side AES-256-GCM encryption with non-extractable keys
- Journal entries with TipTap rich text editor
- Topic organization with icons and drag-and-drop reordering
- Client-side search (keyword + date range)
- Settings (header color, background image, feature toggles per topic type)
- Session management (view/revoke active sessions)
- Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy)
- Apple Pencil: Scribble handwriting-to-text (CSS) + freehand drawing canvas with pressure sensitivity, palm rejection, undo, inline SVG storage (encrypted)
- Voice Dictation: mic button in editor toolbar; `useDictation` hook (`client/src/hooks/useDictation.ts`) wraps Web Speech API with `continuous: true`; auto-restarts on silence and iOS 60s cap via `onend + isListeningRef`; final results inserted at cursor; interim text shown below editor; handles `not-allowed` (mic denied) and `network` (offline on Chrome) errors inline; hidden on unsupported browsers

**Dashboard (Home)**
- Two-column layout (2/3 left + 1/3 right) with independent per-column drag-and-drop and cross-column dragging
- Layout stored as `{ left, right, hidden }` arrays in localStorage (`dashboard-layout-v2`); migrates from old flat `order` array automatically
- Default left: `quick-entry`, `priorities`, `events`, `menu-plan`; default right: `mini-calendar`, `affirmations`, `wellness`
- Edit/Add Widgets tray at bottom of right column; cross-column dragging supported
- Quick Entry with topic selector, rotating daily reflection prompt, per-topic built-in fields and user-defined custom fields; editor auto-expands with content; entries saved with only field values (no typed text) auto-summarize those fields as entry content
- Daily Priorities widget — saved as "Priorities" topic entries with `PrioritiesFields` custom fields editor; respects 12:01am local grace period
- Events & Meetings widget — upcoming entries by `startDate`, 90-day window, up to 10
- Tasks widget — today's tasks with inline completion toggle
- Shopping List widget — first active shopping list with item check-off
- Medication Schedule widget — today's dose tracking; only shown when active meds exist; syncs on tab focus via `visibilitychange`
- Weather widget — current conditions via Open-Meteo; city geocoded with US state disambiguation; shown inline beside date in page header too
- Menu Plan widget — shows actual meals for today (or next upcoming day)
- Affirmations widget — daily rotating affirmation
- Daily Wellness Check-in widget — tap-to-fill water glasses (8), mood faces (5), sleep hours (10 cloud-moon icons); debounced 600ms save with optimistic store updates; reactive to journal edits via Zustand (no BroadcastChannel); auto-creates Wellness topic on first save
- Mini Calendar widget — monthly grid with entry-presence dots; click any day sets `viewMode: 'date'` and navigates to journal
- Dashboard greeting uses `displayName` setting ("Good morning, Alex")
- Daily quote in Playfair Display, constrained to right column

**Topic Custom Fields**
- Any topic can have user-defined custom fields: text, number, date, boolean (yes/no), URL
- Fields defined by editing a topic in the Topics view (`TopicEditForm`); stored as `topicCustomFields` setting (JSONB, `Record<number, UserFieldDef[]>`)
- Field definitions loaded into `uiStore.topicCustomFields` on init via `useInitializeData`
- Field values stored in entries at `metadata._customFields._userFields` (same shape used in `EntryForm` and `QuickEntryCard`)
- When saving with no text content but non-empty field values, a plain-text summary (`Label: value · …`) is auto-generated as entry content — see `summarizeUserFields` in `client/src/utils/stripHtml.ts`
- `UserFieldDef` and `TopicCustomFields` types are in `client/src/types/userFields.ts`

**Productivity**
- Goals & milestones with progress tracking; progress bar shown when milestones/tasks are linked; goal "In Progress" status supported; milestone status cycle: `not_started → in_progress → completed` (tap-to-advance on card)
- Custom Planner Filters (`/goals/filter`) — cross-hierarchy search across goals, milestones, tasks, and todos; filter by keyword, item types (toggle chips), status, priority, parent goal, parent milestone; save named filters persisted to `plannerFilters` setting; collapsible panel with inline filter summary; results shown in sectioned list with counts; filter config types in `client/src/types/planner.ts`
- Tasks with priority levels and milestone linking; completed tasks show line-through in all views
- Menu planner and shopping lists with recipe linking
- Drag-and-drop reordering

**Health Tracking**
- Medications with dosage, frequency, scheduled times
- Dose logging with timestamps (`medication_dose_logs` table, JIT migration); real-time sync via `visibilitychange`
- Meals tracking with meal types, ingredients, calories and micronutrients (iron, vitamin D, B12, vitamin C) — see **Meals log** below
- Symptom tracking with severity scale
- Exercise tracking with type, duration, intensity, distance
- Allergy tracking
- Wellness check-ins — water glasses, mood (1–5), sleep hours, period toggle, flow intensity; stored as `_widgetType: 'wellness-checkin'` entries with Wellness topic; editable via `WellnessFields` custom fields in journal
- Reporting view with wellness trends + cross-correlations (sleep→mood, water→symptoms, exercise→sleep, mood→symptoms); cycle calendar showing period/flow days by month

**Calendar**
- Shows scheduled items only — never ordinary journal entries: events/meetings on `startDate`, tasks/todos on `deadline` (else their creation day), goals/milestones on `targetDate` (`calendarDayFor` in `client/src/utils/calendarItems.ts`)
- Monthly grid with item previews per day
- Events and meetings placed on their `startDate`, sorted first, shown in user header colour
- Day detail panel with full editable entry list

**From the Kitchen**
- Shopping lists have a **Title** field in the New list form; a list saved without one is named "Shopping list created on Oct 7, 2026" (`defaultShoppingListTitle` in `client/src/utils/kitchen.ts`, also applied by journal Save)
- `KitchenDashboardView` (`/kitchen`, the sidebar's fork-and-spoon icon): **Meals** — today's planned meals from the weekly Menu Plan entries (or the next planned day within two weeks; a meal linked to a recipe opens it); **Shopping list** — the newest list with unchecked items as a checklist (tick off, add an item, open the list), unchecked items first. Pure helpers in `client/src/utils/kitchen.ts`

**Journal**
- **Breadcrumbs remember where you came from**: opening an entry from any view passes router state `{ from: path+query }` (`useOpenInJournal`, calendar views, Goals via `journalOriginState`); the editor trail becomes Journal / that view (e.g. Journal / Health / Symptoms), built by `getEntryTrail` / `viewTrailFor` in `client/src/utils/topicBreadcrumb.ts` (only known in-app paths; anything else falls back to the topic's home). The state survives reloads and the calendar's new-entry handoff
- Entry list date badge is the day number over the **month** abbreviation (e.g. 7 / OCT) in `EntryListCard` and `EntryCard`
- The tool row under the journal search (`ViewTabs`) ends with a **+ New entry** button

**Media & Inspiration**
- Entertainment tracking (music, books, TV/movies)
- Inspiration (research, ideas, quotes)

**Settings**
- Account: display name (shown in dashboard greeting), read-only username
- Security: change password (re-wraps master key, no data re-encryption); TOTP 2FA inline setup wizard
- Sessions: view and revoke active sessions from any device
- Features: enable/disable health tracking, planning, entertainment, and more per topic type
- Theme: header color (40+), background image (28), light/dark mode
- Data: seed test data

**Entry Images**
- Up to 7 encrypted images per entry, stored zero-knowledge in the user's own Cloudflare R2 bucket (see `docs/IMAGES_FEATURE_PLAN.md`)
- **Fully client-side — the server has NO image code.** The user's R2 credentials (account ID, bucket, access key, secret) are entered in Settings, encrypted with the **master key**, and stored as the `imageStorageConfig` setting (ciphertext the server cannot read). No server env vars, routes, or DB tables are involved.
- Requests are signed in the browser: `client/src/services/r2Signer.ts` is a dependency-free AWS SigV4 query presigner (Web Crypto HMAC, `UNSIGNED-PAYLOAD`, host-only signed headers), unit-tested against the official AWS documentation signature vector
- Client pipeline: downscale to JPEG (`client/src/utils/processImage.ts`) → `encryptBytes` with the master key → signed PUT of ciphertext direct to R2 (`client/src/services/imageStorage.ts`)
- Credential lifecycle mirrors the master key: decrypted config lives in module memory, cleared on `lock()` (`clearImageCache`), re-derived on `unlock()` (`rederiveImageStorageConfig` called from `EncryptionContext`)
- "Save & test connection" runs a PUT+DELETE probe **from the browser**, which also validates the bucket CORS policy at setup time
- Metadata lives in the entry's encrypted blob: `metadata._images: EntryImage[]` + `metadata._featuredKey`; thumbnails are separate encrypted objects (`img/<uuid>` / `img/<uuid>-t`, client-generated random UUIDs)
- UI: thumbnail strip + lightbox + featured hero banner (`EntryImageGallery.tsx`); decrypted object URLs cached per session and revoked on lock
- Share is hidden/blocked for any entry with images (hard product rule); entry deletion (editor, card, bulk) best-effort deletes the R2 objects via signed DELETEs
- User setup requires a bucket CORS policy allowing `GET, PUT, DELETE` (documented in Settings → Entry Images → Setup guide); CSP `connect-src` allows `https://*.r2.cloudflarestorage.com`

**AI Assistant (calorie estimates)**
- Bring-your-own AI: Settings → AI Assistant lets the user pick **Claude (Anthropic API)**, **Amazon Bedrock** (AWS region + IAM access key ID and secret access key, optional session token — selecting Bedrock shows these fields directly; saved configs are normalized to `bedrockAuth: 'iam'` on load), or **OpenAI**, enter credentials, and choose a model (presets + any model ID)
- **Bedrock supports every text model, not just Claude** (`client/src/services/bedrock.ts`): inference uses the model-agnostic **Converse API** on `bedrock-runtime`; the model picker loads the account's text models live (`ListFoundationModels` + system `ListInferenceProfiles` for cross-region-only models like `us.meta.llama…`), grouped by provider, with a region-aware fallback list if listing fails. IAM requests are SigV4-signed in the browser with `@smithy/signature-v4` (`applyChecksum: false`, verified byte-identical to botocore); Bedrock API keys go as `Authorization: Bearer`
- **Fully client-side, like Entry Images** — the whole config (provider, model, keys, optional body weight) is encrypted with the master key and stored as the `aiConfig` setting; decrypted into module memory on unlock (`rederiveAiConfig`) and cleared on lock (`clearAiConfig`). Requests go browser → provider; the server never sees keys, prompts, or answers. Logged food/exercise descriptions DO go to the chosen provider (disclosed in Settings)
- `client/src/services/aiAssistant.ts` — config lifecycle, provider calls (`@anthropic-ai/sdk` with `dangerouslyAllowBrowser`, Bedrock via `bedrock.ts`, OpenAI chat completions via fetch), `estimateMealCalories` / `estimateExerciseCalories`, `autoCaloriesOnSave`; `useAiReady()` hook; the Anthropic SDK is a lazy-loaded chunk
- Food: calories auto-estimated on save when blank (Health dashboard quick log, New entry form, journal Save) + an "Estimate" button beside Calories. Exercise: calories burned calculated on save from type/duration/distance/intensity (+ body weight) and **re-calculated when those inputs change**
- `caloriesSource: 'ai' | 'manual'` + `calorieBasis` in the entry's custom fields — typed calories are never overwritten; an AI estimate is refreshed only when its inputs changed. A failed estimate never blocks a save. Journal autosave does not call the AI (explicit Save does)
- CSP `connect-src` allows `https://api.anthropic.com`, `https://api.openai.com`, `https://*.amazonaws.com` (Bedrock runtime + control plane)

**AI chat (unsaved)**
- `client/src/components/organisms/AiChat.tsx` — floating chat bubble bottom-right (`forum` icon; lifted to 88px on `/journal` so it clears the editor's Save bar) that opens a small pop-up panel. Mounted once in `App.tsx` via `ChatGate` — only when signed in **and** unlocked, never on `/login`, `/register`, `/recover`, `/share`
- **Chats are never saved**: messages live only in component state, so closing the page or locking the journal (which unmounts it) clears them; "Clear" empties it. Replies come from the user's configured provider via `chatReply(system, turns)` in `aiAssistant.ts` (multi-turn: Claude Messages / Bedrock Converse with a message list / OpenAI chat)
- Look: rounded panel (18px) and pill input — a deliberate exception to the squared DS corners; alternating bubbles (user right in the accent tint, assistant left on `--bg-sunken`, notes centred). Assistant replies render a safe Markdown subset (paragraphs, headings, bullet/numbered lists, bold, italic, code) via `parseChatMarkdown` in `client/src/utils/chatMarkdown.ts` — a data tree rendered as React elements, never HTML
- Persona (`CHAT_PERSONA` in `chatSave.ts`): warm and human, humor and kindness where fitting; never mocking, patronizing or misogynistic; inclusive; always says it is an AI when asked; gently steers real distress or imminent-harm signs toward journaling or talking to a person and offers help finding someone
- `/save Meals <food>` creates a proper Meals log row for today (meal type by time of day) and, when AI is on, fills its nutrients with `autoNutritionOnSave` before saving
- `/save <topic> <text>` saves `text` as an encrypted journal entry under that topic — handled locally (never sent to the AI), created with the existing encrypted entries API (**no server endpoint**). Topic matching is case-insensitive, longest name first (so "Shopping List" works unquoted) — `parseSaveCommand` in `client/src/utils/chatSave.ts`. "Journal" is always accepted and created via `getOrCreateJournalTopic` if missing. Works even when AI is off
- The system prompt (`chatSystemPrompt`) lists the user's topic names so the model can suggest a fitting `` `/save Topic text` ``; suggestions render as one-tap chips that fill the input
- Settings → AI Assistant shows a readiness line ("Ready — using …" / "Not ready yet — add …" from `missingCredentials`); Test connection is always clickable and says what's missing; a blank model is auto-filled with the first available model, and model IDs from the old Claude-only Bedrock endpoint are cleared on load

**Meals log (nutrition)**
- `/health/food` and `/menu/meals` render `MealsLogView` (`client/src/views/MealsLogView.tsx`, sections in `client/src/components/organisms/FoodLog.tsx`) — built from the app's standard pieces (`FormField` label-left rows, `PillButton` outlined pill actions, flat top-rule sections): a **day** header with prev/date/next and a `DayAtAGlance` stat strip (totals vs goals with progress rules; no rule beneath it on either page); a read-only **Logged** table (`FoodDayList`; select a row to edit it in the journal, hover actions Estimate/Delete, day-total row; grey italic = AI estimate; "Fill N missing with AI" in its head) so each day can be reviewed and corrected; **Meals At-a-Glance** (daily totals for 7/30/90 days/year; green = goal met; "Took" = supplement rows, "Noticed" = Symptom entries that day; click a day to open it — no rule between it and the Logged list); and **daily goals** in field rows. There is no add form on this page — food is logged from the Health dashboard, the home Quick Entry, or the journal
- The Health dashboard (`HealthDashboardView`) is just two sections: **Food** (`DayAtAGlance` for today + the `FoodAddForm` Log food form with every nutrient field) and **Exercise** (field rows + "Log exercise" pill; shows only a status line after logging). No saved foods, today lists, medication schedule or allergies there. The home Quick Entry's Meals fields include the micronutrients (with `UnitLabel` so units keep their casing inside capitalized field labels) and fill blanks via `autoNutritionOnSave` when AI is on
- Nutrients are defined once in `client/src/types/nutrition.ts` (`NUTRIENTS`: calories, iron mg, vitamin D mcg, B12 mcg, vitamin C mg; `DEFAULT_NUTRIENT_GOALS` vit D 15, B12 2.4, vit C 75) — add a nutrient there and forms, totals and AI pick it up. Values are strings in the Meals entry's `_customFields` (`calories`, `iron`, `vitaminD`, `vitaminB12`, `vitaminC`); `mealType` gains `supplement`
- **Import Daily Log** (Settings → Data, `client/src/components/organisms/DailyLogImport.tsx` + pure mapper `client/src/utils/dailyLogImport.ts`): one-time import of a JSON export of the old "Daily log" artifact (`{ goals, days: { 'YYYY-MM-DD': { entries: { id: { item, type, kcal, iron, vitD, b12, vitC, notes, created } } } } }`). Food/Supplement/Medication → Meals (`mealType` '' / `supplement` / `medication`, nutrients kept as manual values, `consumedDate` = the log day), Symptom → Symptom (`occurredDate`), Note → Journal; goals → `nutritionGoals`. Entries are encrypted in the browser like any other; each carries `metadata._importKey` (`dailylog:<day>:<id>`) so a re-run skips what's already imported. `mealType: 'medication'` rows count in "Took" and are never AI-estimated
- **Meds feed Meals**: Medication entries have **Nutrients per dose** (iron, vitamin D, B12, vitamin C — same keys as food) in `MedicationFields`. Marking a dose taken in the schedule (`MedicationSchedule` → `useDoseToMeals`) adds a Meals row for that day (`mealType: 'medication'`, `metadata._doseLink = "<medId>|<date>|<HH:MM>"`); un-taking deletes it. Per-dose values come from typed fields, else `parseMedNutrients(name, dosage)` (single-nutrient supplements like "Vitamin D3 1,000 IU" → 25 mcg; multis/complexes skipped), else one AI estimate cached on the medication (`doseNutrientSource: 'ai'` + `doseNutrientBasis`). Meds with no nutrients add nothing — `client/src/utils/medNutrients.ts`
- Pure helpers (rows by eaten day = `consumedDate` else creation day, totals, goal checks) in `client/src/utils/foodLog.ts`
- Goals (`nutritionGoals`) are a **master-key-encrypted setting** via `useEncryptedSetting` (`client/src/hooks/useEncryptedSetting.ts`); the saved-foods (`foodLibrary`) UI was removed
- AI: `estimateFoodNutrition` asks for only the missing nutrients in one request; `nutrientSource` (`'ai' | 'manual'` per nutrient) + `nutritionBasis` mean typed values are never overwritten and AI values refresh when the description/meal type changes. New rows are AI-filled in the background after adding; the Logged table has "Fill N missing with AI" and a per-row "Estimate". Every food save path (Health dashboard quick log, New entry, journal Save) fills blank nutrients via `autoNutritionOnSave`; `FoodFields` shows the nutrient inputs

### Planned
- Recurring calendar events
- Calorie correlation reporting

## Important Implementation Notes

### Entry Pagination
`entriesApi.getAll()` requests `?limit=5000`. Server allows up to 10,000. Do not reduce this — personal journals can easily exceed 100 entries and topic filtering relies on all entries being in the client store.

### Navigation breakpoint
Phones **and tablets** use the mobile top bar + slide-out nav; the side rail shows only on wider, non-touch screens. The query is `NAV_COMPACT` in `client/src/styles/breakpoints.ts` (≤1024px, or touch-first `(hover: none) and (pointer: coarse)` up to 1366px) and is used by `Sidebar`, `MobileChrome` and the templates' layout/slide rules. Page layouts keep their own 768px breakpoints.

### Typing performance (journal editor)
The journal re-renders on every keystroke (editor content lives in `JournalView` state), so everything beside the editor must stay cheap: `EntryList`, `Sidebar` and `QuickEntry` are `memo`'d (they read their data from the stores), `EntryForm`'s option lists are `useMemo`'d on entries/topics, list titles come from the cached `entryTitleText` (`client/src/utils/entryTitle.ts`) instead of re-sanitizing every entry, and `Editor` skips re-serializing HTML it just emitted. Don't pass fresh inline callbacks/objects to these memoized components.

### Feature Flags
Feature flags in `entriesStore.featureFlags` default to `{}` on load. Both `useInitializeData` and `JournalView` build them with `featureFlagsFrom` (`client/src/utils/featureFlags.ts`), which sets all known flags to `true` when not present in settings. The `filterTopics` function uses `featureFlags[flag] !== false` (not `featureFlags[flag]`) so undefined flags are treated as enabled.

### Dashboard Widget Data
Dashboard widgets save entries with `_taxonomyId` in encrypted metadata (same as all entries). The Priorities widget auto-creates a "Priorities" topic on first save. The Meds widget reads from `decryptedEntries` filtered by the Medication topic — it only renders when `hasMeds` is true.

The Wellness widget uses `_widgetType: 'wellness-checkin'` (no `_taxonomyId` initially) to identify today's entry. On first save it auto-creates a "Wellness" topic and adds `_taxonomyId` so the entry becomes visible in the journal. The widget is fully reactive — display values are derived via `useMemo` from `decryptedEntries`, so journal edits flow back to the dashboard automatically. `doSaveRef` pattern prevents stale closures in the 600ms debounce. On save, the store is scanned directly for today's existing entry before creating a new one, preventing duplicates if the `entryIdRef` is stale.

## Security Hardening

### Content Security Policy (CSP)
Applied via Express middleware (`server/src/middleware/security.ts`):
- `default-src 'self'` — only same-origin
- `script-src 'self'` — no inline scripts
- `style-src 'self' 'unsafe-inline'` — required for styled-components
- `img-src 'self' data: blob:` — images from same origin and data URIs
- `connect-src 'self'` plus Open-Meteo, Google Calendar, the user's R2 bucket, and the AI providers (`api.anthropic.com`, `api.openai.com`, `*.amazonaws.com`)
- `frame-ancestors 'none'` — prevent clickjacking

### Rate limiting
- `apiLimiter` (`server/src/middleware/rateLimiter.ts`): 1500 requests / 15 min **per account** on data routes (auth routes have their own stricter limiters). It must stay well above normal SPA use plus bulk actions (imports, bulk edits, dose → Meals sync) — 300 locked real users out
- Client: identical in-flight GETs share one request (`request` in `services/api.ts`; followers get a `structuredClone`). A 429's `Retry-After` is carried on `ApiError.retryAfterSec`; initial loads (`useInitializeData`, `JournalView`) retry with `retryDelayMs` — Retry-After on 429 (5s–15min), else 10s→60s backoff — and never fall back to an empty journal

### CSRF Protection
- Web requests require `X-Requested-With: XMLHttpRequest` header
- Mobile requests use `Authorization: Bearer` (no CSRF risk)
- Explicit branching in auth middleware — never mixed

### Password Strength
- Minimum 12 characters
- Uppercase, lowercase, number required
- Validated via Zod schemas (`shared/src/validation/schemas.ts`)

## State Management

**Zustand** for client state (not Redux):
- `uiStore` — Search filters, sidebar state, theme colors, selected entry
- `entriesStore` — Decrypted entries cache, topics, loading state

**React Context** for auth and encryption:
- `AuthContext` — Login/logout/register, session state
- `EncryptionContext` — Master key lifecycle, encrypt/decrypt methods

### Key Storage Security
- Master key is a **non-extractable CryptoKey** — cannot be exported to JWK or raw bytes
- Key lives in React ref (memory only) — lost on page refresh
- On refresh: user re-enters password to re-derive key — unless they opted into **Remember me**
- Key is cleared on: logout, inactivity timeout, tab hidden (not when remembered), tab close

### Remember me (stay unlocked until the browser closes)
Opt-in checkbox on sign-in and on the lock screen (`RememberMe` molecule). Off by default; shows a shared-computer warning.
- **Browser keeps only ciphertext**: `localStorage['chronicles.remember.v1']` = the master key wrapped (AES-GCM, purpose AAD `'device-wrap'`) under a 32-byte **device secret**. Produced by `encryptionService.unwrapMasterKeyForDevice` (KEK derived once; the transient extractable copy is only ever passed to `wrapKey`, raw key bytes never reach JS) and reopened by `unwrapFromDevice` straight into a **non-extractable** key (`unwrapDeviceKey`, no legacy no-AAD fallback)
- **Server keeps the device secret in memory only** (`server/src/services/rememberGrants.ts`; never DB/logs), keyed by SHA-256 of a random grant id carried in an **HttpOnly, SameSite=Strict, Secure session cookie** (`__Host-chronicle_unlock`, no Expires → gone when the browser closes). `POST /api/auth/remember` (create, one per session), `POST /api/auth/remember/key` (returns the secret only for the same account **and** signed-in session that created it), `DELETE /api/auth/remember`; all behind `authMiddleware` (CSRF header enforced), `Cache-Control: no-store`, browser-only (Bearer refused). 12-hour absolute cap so browsers that restore session cookies can't keep it alive; server restart, logout and session revocation (`revokeSession` / `revokeAllSessions`) drop grants
- **Client lifecycle** (`client/src/services/rememberDevice.ts`, `EncryptionContext`): restores on page load (`isRestoring` suppresses the unlock prompt), skips the hidden-tab auto-lock, and replaces the 15-minute per-tab idle lock with **60 minutes idle across all Chronicles tabs** (shared `chronicles.lastActive`). `lock()` forgets everywhere (blob + grant); other tabs lock via the `storage` event. 401/403/404 from the key endpoint deletes the blob; network errors keep it. Settings → Security shows status and **Forget this browser**
- Trade-off (documented to users): while remembered, script running in the page (e.g. XSS) could fetch the secret and reopen the key, so the CSP (`script-src 'self'`) matters even more; it's opt-in for personal devices only

## UI Theme

### Styling: styled-components + CSS Variables
- All styles co-located with components using styled-components
- Components reference CSS variables first (`var(--ink, ${theme.colors.text})`) so root-level theme switches take effect without re-render
- Theme tokens in `shared/src/theme/tokens.ts` — shared with future React Native; TypeScript shape declared in `client/src/styles/styled.d.ts`
- `ThemeProvider` at app root supplies tokens; `App.tsx` injects CSS variables on mount and on theme/accent change

### CSS Variable Injection (App.tsx)
Three sets of variables are written to `:root`:
- **Static** (`STATIC_CSS_VARS`): radii (`--r-sm/md/lg/xl`), spacing (`--s-1` … `--s-10`), font families (`--serif/--sans/--mono/--brand/--ui`)
- **Theme** (`LIGHT_CSS_VARS` / `DARK_CSS_VARS`): color tokens that flip between Paper and Midnight — `--paper`, `--ink` × 4, `--rule`, `--btn-primary`, `--accent-fill`, semantic colors, shadow values
- **Dynamic accent**: on every header-color change, derives `--accent`, `--accent-hover`, `--accent-tint`, `--accent-stroke`, `--h-active`, `--h-active-ink`, and legacy `--focus`

### Customizable Colors
- **40+ header accent colors** (Dark, Navy, Gold, Coral, Teal, Steel Blue, etc.) + transparent
- **28 background images** from Unsplash artists
- Colors derived programmatically: hover (15% darker), tint (10% opacity), stroke (desaturated muted variant for borders)

### Default Colors
- Default header: `#2d2c2a` (dark)
- Default accent: `#00b4d8` (cyan)
- Paper background: `#f0ebdf` (light) / `#1a1917` (Midnight)

### Typography
- **Serif** (Playfair Display) — display headings, daily quote
- **Sans** (Lato) — body text
- **UI** (Montserrat) — labels, navigation
- **Brand** (Josefin Sans) — wordmark / logo
- **Mono** (JetBrains Mono) — code, timestamps

## React Native Readiness

The architecture enables React Native conversion with minimal changes:

| Layer | Change for RN |
|-------|--------------|
| shared/crypto | Import swap (`react-native-quick-crypto`) |
| shared/types, validation, theme | None |
| server/ | None (same API) |
| atoms/ | Swap styled primitives (div→View, input→TextInput) |
| molecules, organisms | None |
| templates/ | Swap layout primitives |
| views/ | Swap routing (react-router → React Navigation) |
| stores/, contexts/, hooks/ | None |
| services/api | Minor: Bearer header from secure storage |
