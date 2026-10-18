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

The design system lives **in the app code** (the separate `design-system/` folder was folded in):
- **Tokens** — `client/src/App.tsx` (`STATIC_CSS_VARS`, `LIGHT_CSS_VARS`, `DARK_CSS_VARS`, accent
  derivation): the semantic CSS variables below are the source of truth for colour, type and radii.
- **Core primitives** — `client/src/components/atoms/core/` (`Icon`, `Input`, `Textarea`, `Select`,
  `Checkbox`, `Button`, `Badge`; `.jsx` + `.d.ts`) styled by the `ch-*` classes in
  `client/src/styles/core.css`. App code uses the atom wrappers (`TextInput`, `Select`, …) and
  `Icon` from `atoms/core/Icon.jsx`.
- **Shared patterns** — field rows `FormField` + `styles/filledInputs.ts`, `PillButton`,
  `CollapsibleCard` (lifted panel: `--bg-surface` fill + `--border-subtle` hairline; an `outlined`
  variant — no fill, a brighter `--border-default` outline — exists but is unused),
  **column borders on spreadsheet tables** (not the entry lists — journal/topic/health lists have
  none) — `columnRules(padY)` for grid rows (finance `Row`/`TotalRow`) and `tableColumnRules` for
  `<table>`s (Meals, print report)
  (`styles/columnRules.ts`); new table-like layouts use them too. Rules must run unbroken
  top to bottom, so: finance tables pass their columns to `Table` (`$cols`, `$phoneCols`,
  `$phoneAt`) and rows/headers/totals share them by subgrid (totals live *inside* the
  `Table`, spaced with cell padding, never a margin); a cell that wraps onto its own line on
  phones repaints the rules with `continueRules(columnsToTheRight - rowPaddingRight)`,
  `EntryListCard`/`EntryTable`, and for reports `StatTile`/`StatTileRow` (a `--bg-panel` card: name top-left, muted
  caption top-right, 56px thin Work Sans figure + unit, 4px rule in the metric's colour; the chosen
  one gets a `--control-border` outline) and `charts/TrendChart` (faint grid over a firmer baseline,
  0 / half / max ticks, main line + dots in its `--chart-*` colour, dashed grey ghost lines; its
  legend is `ChartLegend`, placed in the card's title row). Reuse these rather than restyling locally.
All UI must follow the rules below.

### Design Philosophy
- **Borderless tonal panels** — Soft grey canvas `#f4f5f7` with near-white `#fbfbfc` cards (light) / slate `#1f2229` with bright, high-contrast
  greys (dark) — keep dark-theme greys bright; users find mid-greys washed out.
  Cards and inputs separate from the canvas by **fill tone**, not outline. Visible borders are
  hairline dividers only. **Inputs are filled** (`--bg-sunken`), not outlined.
- **Dashboard widgets are borderless flat sections** (per the `app.jsx` mini-app, which is
  canonical): a 1px `--border-subtle` *top rule* + a tracked-uppercase label row, with content
  sitting directly on the canvas — NOT bordered/filled tiles. The grid is `2fr / 1fr` with a
  24px gap and **no vertical divider** between columns.
- **Softly squared corners** — Cards/tiles and styled-form boxes 6px (`--r-lg`), filled inputs ~1px (`--r-md`). Action
  buttons are the round `PillButton` (`--r-full`); small utility controls (search fields, Clear,
  bulk-edit buttons) use a slight 4px radius. Avatars, switches and dots are round.
- **Flat elevation** — Depth is tonal layering, **never shadow** on resting panels. Shadows
  (`--shadow-lg/xl`) are reserved for floating overlays: dropdown menus, dialogs, toasts.
- **One confident accent** — A single user-selectable accent marks exactly one active/selected
  thing (a solid accent block, or a 2px accent left-bar + faint accent tint). Never decorative.
  A **chosen filter pill** is a **solid accent fill with `--on-accent` text** (Cycle chips, Planning's Goal / Milestone / Status filter pills and action pills like Re-estimate are outline pills instead: accent outline (`--color-accent-line`) + accent text (`--color-accent-soft`), no fill) —
  never a see-through accent tint with accent text. `--on-accent` is white unless the fill shown
  is too light for it (< 2:1 — yellows, pastels), then
  near-black (`onAccentFor` in `App.tsx`); all 30 presets keep white.
  A 3px accent stripe pins the very top of the app chrome.
- **Type** — **Work Sans** for display/headings, set **thin (Light/200–300)** for an airy feel;
  **Open Sans** for UI, body, and metadata (uppercase + `~0.14em` tracking). Sentence case in UI.
  Both are **bundled with the app** (`client/src/styles/fonts.css` + `src/assets/fonts/`) — never
  load them from Google Fonts, which Safari/iOS can block, leaving a system face. **One static file
  per weight and style**, never a single variable-weight file (iOS doesn't render those reliably):
  Work Sans 100–700, Open Sans 300–700, normal + italic, latin + latin-ext. A new weight needs its
  own files and `@font-face` rules (Fontsource packages have them).

### Two Themes: Light (white) and Dark (charcoal)
Switched via `data-theme="dark"` on `<html>` (driven by `uiStore.themeMode`, the theme in effect — set by the Light / Dark / Auto choice). The token layer
is injected in `client/src/App.tsx`. DS semantic tokens (use these for new work):
- `--bg-app`, `--bg-surface`, `--bg-sunken`, `--bg-hover`, `--bg-active` — surface layers
- `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-disabled` — text tones
- `--border-subtle`, `--border-default`, `--border-strong` — hairline borders
- `--border-card` (card outlines and their inner rules/boxes), `--text-muted` (card subtitles, chevrons, + icons), `--text-placeholder`, `--control-border` (unticked round checks), `--bg-row-hover` (a row lifting inside a card, #2f313a), `--text-soft` (toolbar text buttons, #a5a8b0), `--text-faint` (quiet + marks, #464a54), `--bg-tile` (filled tiles, #2c2e37), `--bg-today-col` (today's column band, #262831), `--color-accent-link` / `--color-accent-soft` (lighter accent text in dark: links / today's label), `--border-pop` (floating menus, #373a44), `--border-dashed` (#3b3f49), `--text-hint` (placeholders in big borderless fields, #60636c) — sampled from the card mockup (dark #31343d / #7c7f88 / #6c6f78 / #5b5f69)
- `--color-accent`, `--color-accent-hover`, `--color-accent-subtle`, `--on-accent`,
  `--accent-100..800` — accent scale derived programmatically from the user's hex
- `--font-display` (Work Sans), `--font-sans` / `--font-label` (Open Sans)

**Legacy aliases** (`--paper*`, `--ink*`, `--rule*`, `--btn-primary*`, `--accent-fill*`, `--mono`)
still resolve, remapped to DS values in `App.tsx`, so existing components recolor automatically.
Prefer the DS-named tokens in new/edited code.

### Light theme — weight and contrast
Light needs much darker text than dark needs light text, so it's tuned separately (`LIGHT_CSS_VARS` + `html[data-theme='light'] &` rules):
- **Soft light, not white**: page `--bg-app` #f4f5f7, cards `--bg-panel` / `--bg-surface` #fbfbfc, controls (pills, the topic picker, ± buttons — light-only `--bg-control`) #fefefe, the wellness four-square card `--bg-tracker` #fbfbfc, journal list + rail `--bg-sunken` / `--bg-rail` #dcdfe4 (logo cell #d3d7dd, active item #f4f5f7), chosen toggles `--bg-active` #d3d7dd, chosen pills / the chosen mood face on `--bg-selected` (the accent mixed 82% to white, Teal → ~#daefee; light only)
- Near-black text (`--text-primary`/`--text-secondary` #1f2128, 13:1), card labels / toolbar text `--text-soft` #4a505b (6.7:1), secondary text, units and placeholders (`--text-muted`/`--text-meta`/`--text-placeholder` #575d68, 5.5:1), card/input outlines #cdd1d8 (`--border-card`, `--border-field`), dividers `--border-default` #bfc4cc, row hairlines `--border-subtle` #d3d7dd
- Pills and round controls (neutral `PillButton`, field chips, wellness ± buttons and icon rings, Cycle chips, the quick-entry topic pill, dashboard shopping pills) and unticked checks (`--control-border`) outline in #80868f (3:1) — the light-only `--border-pill` token, unset in dark (`''` in `DARK_CSS_VARS`) so each control keeps its own dark outline; `--progress-track` (#d3d7dd), `--bg-control` and `--bg-tracker` work the same way
- One clear structure: the journal list (`--bg-sunken`) and the rail (`--bg-rail`) share #dcdfe4, a step darker than the #f4f5f7 page
- A deeper accent for text and outlines on white: `--color-accent-line` (outlined accent pills, chosen chips/segments, Save), `--color-accent-link` / `-soft` / `-text` and the active nav item (`--color-accent-nav`) are the accent × 0.68 in light (Teal → ~#23706e, 5.2–5.9:1); progress-rule fills use `--color-accent-fill` (× 0.84 in light, Teal → ~#2c8b88); `--color-accent` itself stays the exact accent (other fills, logo). In dark `--color-accent-line` / `-fill` / `-nav` = the accent
- **Save entry** is a filled `--color-accent-line` pill with white text in light — the page's one solid focal point (outlined in dark)
- No small tracked capitals in light: `PillButton`, `FormField` labels, the journal list's topic label, `NutritionPanel` labels and the save-status notes switch to sentence case at normal spacing (13–14px, 500) — dark keeps the tracked caps
- Big titles stay thin; body text and values are 400–500 in near-black

### Accent customization
Settings → Theme offers **30 named accent presets** (`ACCENT_PRESETS` in `SettingsView`, ordered by hue: reds, oranges/yellows, greens, blues, purples, neutrals — all toned to the same muted chroma). Any hex feeds `--color-accent` and
`deriveAccentScale()` builds the `--accent-100..800` ramp. `--color-accent` is the user's **exact** colour in both themes — no dark-mode lift (only hover/pressed step lighter in dark). The nav rail's active item is the exact accent in dark and the deeper × 0.68 text accent in light.

### Shape & Icon Rules
- **Icons are plain** — Topic icons are plain FontAwesome/Lucide-weight stroke icons. No circle
  backgrounds, no colored dot indicators.
- **Icon colors — body text** — Topic icons in entry cards, topic sidebar, and topic selector
  dropdowns use `--text-primary` (body font color), not the accent or a muted color.
- **Nav rail** (`Sidebar`): its own toned panel (`--bg-rail`, no outline, no dividers between
  items); the Chronicles logo mark sits in a darker top cell (`--bg-rail-logo`); the **active item is
  lifted** onto `--bg-rail-active` in `--color-accent-nav` (the exact accent in dark, × 0.68 in light) with a 4px tab in the same colour on the rail's outer edge;
  Settings is pinned to the bottom with **Sign out** (Material `logout`) under it — both use `useSignOut` (`hooks/useSignOut.ts`), as does Settings → Sign Out. The mobile top bar is on the page colour (`--bg-app`) with a `--border-subtle` hairline under it: the logo, the current page's name (18px) and a ☰ button.
- **Logo** — Material Symbols' **book_5** (Outlined 400: a book standing at an angle, its cover tilted open), drawn from its SVG path (`BOOK_5`) so it takes a gradient, always via `BrandMark` (`atoms/BrandMark.tsx`;
  pass a page-unique `gradientId`). Its gradient ends on the user's accent (`--logo-top/mid/low/end`,
  set in `App.tsx`): a light accent tint at the very top → the accent → a slightly deeper shade in dark, deep
  accent → accent in light. Nav cell: a 28px mark in the 92px rail (reads the same size as the 24px nav icons); 26px on the mobile bar. Used on the nav rail, mobile bar and sign-in/register/recover.
  Static copies (favicon `public/chronicles-logo.svg`, `favicon.ico`, `public/icons/*.png`) are
  the default Teal on the dark canvas, since they load before the user's accent is known.
- **Section tabs** (Health, Kitchen, Roadmap, Finance) all use `SectionTabBar`/`SectionTab` from
  `styles/sectionTabs.ts` — sentence case (15px Open Sans, `--text-muted`) on a hairline; active =
  `--color-accent-soft` text + 3px accent underline (labels: "Med list", "Shopping lists",
  "Budget & bills"). Never restyle tabs locally.
- **Wellness check-in — one look** (`molecules/WellnessPanel.tsx`, used by the Health dashboard
  `WellnessCheckIn` and the journal `WellnessFields`): Water | Sleep tiles (round Material icon in a thin `--border-card` circle outline, no fill, a 56px **Work Sans Light** figure + unit, round −/+
  buttons, a 4px progress rule toward 8 glasses / 8 hours), then Mood as five Material
  `sentiment_*` faces (the chosen one just turns accent — no disc or ring — its name on the
  right), then Cycle as pill chips (None/Spotting/Light/Medium/Heavy; chosen = accent). Hairlines
  between sections. **One colour: everything coloured (icons, progress rules, the chosen face and its name) uses the accent** — no blues, violets or per-mood hues. New Material glyphs must be added to the `icon_names` list in `index.html`
  (alphabetical) or they render as text.

### Component-specific Rules
- **List rows — one style everywhere** (`styles/entryRow.ts`, used by `EntryCard`, `EntryListCard` and the Topics list): journal (`entryRow`): rows have no background of their own; hover/focus shows only a 3px accent left bar (the background never changes on hover); the open entry on `--bg-app` with the bar, a hairline (`--border-subtle`) down the right edge of the list beside the editor (desktop), and the topic + date are never accent — on every list they recede in `--text-meta` grey (hover and the open row included); every other list (`entryRowPlain`) is the reverse — rows on `--bg-app`, the active row on `--bg-sunken`, no bar; in the **journal only**, the first row starts active as a hint — only while no entry is open (or the open one is filtered out of view) — until the pointer is over a row (`rowHoverHandlers` set a flag on `<html>`); other lists don't highlight their first row (it just gets a top rule — except straight under a tab bar, whose hairline would double it: Recipes, Planning list view with no filter row). Never style list rows locally
- **Lists outside the journal — one layout** (Health lists, Recipes, Shopping lists, topic pages, topic entries): entries grouped by month with `MonthGroups` (`molecules/MonthGroups.tsx` — a thin 20px Work Sans "October 2026" heading over a `--border-default` rule), then `EntryListCard` rows **flush** with the list's edge (no side padding, no chevron, no first-row highlight): the title in `--text-secondary`, an optional muted line under it, "Oct 6" muted on the right, hairlines between rows. Goals / Planner lists use the same flush rows (ungrouped)
- **Sub-sub tabs** (the filters under a section's tabs — All / Today / This week / This month, Current / Completed…) are `FilterTabs`: one outlined group (`--border-card`, 10px corners), the chosen option lifted onto `--bg-active` in `--color-accent-soft`; the same look as Reports' period switch and the Meals history range; 24px of space above them under the section tab bar
- **Field forms — one style everywhere** (`FormField`, every form in the app: journal editor, Quick
  Entry, Log a Meal, Settings, finance…): label **above** in 12px tracked capitals (400, 0.10rem),
  the value full width in a filled `--bg-sunken` box with a faint 1px `--border-field` outline
  (#30333f dark — #2a2d38 vanished, #343844 too strong), the cards' 6px `--r-lg` radius, 48px tall.
  Units go inside the box (`SuffixInput`). Never pair fields side by side (each fields form's `Row`
  is `display: contents`), except the journal Meals Type | "Eaten at" pair. Rarely used fields
  (Medication notes) hide behind a "+ Add …" link until used or filled.
  **Every meal form** (journal `FoodFields`, Health → Log a Meal `FoodAddForm`) shows
  its nutrients in the shared `NutritionPanel` (`molecules/NutritionPanel.tsx`): a **NUTRITION**
  heading (+ optional Estimate pill), calories as a large thin Work Sans figure (300, not bold) + kcal over a column-ruled
  micronutrient strip (its values thin Work Sans too), italic = AI, 18px below before the next label. The journal adds the single
  date | time "Eaten at" box. **No title above a custom-fields block** (no topic name, no
  "MEAL" heading, no check-in date) — the fields start straight away
- **Checkmarks — one look everywhere** (the user's favourite; never restyle): ticked = an accent **check-circle** (a ring with the tick breaking out of it — stroke only, never a filled disc), unticked = a plain grey ring (`--control-border`). Form checkboxes use the core `Checkbox` (`ch-check`); every round tick button (shopping lists, priorities, doses, recipe ingredients, dashboards) draws `TickMark` (`atoms/TickMark.tsx`) inside a bare button
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
├── shared/              # Shared code (web + future React Native)
│   └── src/
│       ├── crypto/      # Stateless encryption service (AES-256-GCM, PBKDF2)
│       ├── types/       # TypeScript interfaces (Post, Taxonomy, User, Session, Settings)
│       ├── validation/  # Zod schemas for API request/response validation
│       └── theme/       # Design tokens, accent colors
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
│           ├── auth.ts                # Register, login, logout, change-password/email, recover, TOTP 2FA
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
│       │   ├── molecules/   # Atom combinations (FormField, EntryMeta, etc.)
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

1. **Authentication Layer (Server)**: bcrypt hash (12 rounds) of a **derived sign-in secret**, split-token database sessions with immediate revocation, optional TOTP 2FA
2. **Encryption Layer (Client)**: AES-256-GCM with auto-generated master key wrapped by password-derived KEK (PBKDF2-SHA256, 600k iterations)

Password changes only re-wrap the master key (instant). Data is never re-encrypted on password change.

**The server never receives the password or the recovery key** (`shared/src/crypto/authSecret.ts`). Either one would let it unwrap the master key it stores. Instead:
- `authSecret = PBKDF2(password, "chronicles:auth:v1:" + normalizedEmail, 600k)` (`deriveAuthSecret`) is what `/register`, `/login` and every password-confirmed action (change password/email, recovery key, 2FA enable/disable, delete account) send — `authSecret`, `currentAuthSecret`, `newAuthSecret`. It uses a different salt from the KEK, so it doesn't give the KEK. Its salt is the email, so `/change-email` sends a new secret too. Password rules (`passwordSchema`) are checked **on the client**; the server only checks the 64-hex shape
- Stored as `auth1$` + bcrypt(authSecret). A bare bcrypt hash (`$2…`) is a pre-upgrade hash of the password itself: `/login` answers `{ legacyAuth: true }` (an unknown email answers the same), the client retries once with `legacyPassword`, and the hash is replaced — after the 2FA code when 2FA is on. Confirm endpoints never accept legacy hashes; `upgradeStoredCredentials()` signs out legacy accounts' sessions at startup
- Recovery sends `recoveryProof = PBKDF2(recoveryKey, recoveryKeySalt, 600k)` (`deriveRecoveryProof`; the salt comes from `/recovery-params`, with a stable decoy for unknown emails). The server stores `v2$` + SHA-256(proof), so a leaked row can't be replayed; older rows are sealed at startup

### TOTP Two-Factor Authentication

Implemented via `otplib` — no external services required.

**Login flow when 2FA is enabled:**
- `POST /api/auth/login` returns `{ pendingToken, requires2FA: true }` instead of a session
- Client shows OTP screen; user enters code from authenticator app or a backup code
- `POST /api/auth/login/2fa` verifies the code and issues the real split-token session
- Pending tokens are stored in-memory with 5-minute TTL (single-instance safe for Render)
- A TOTP code is accepted once (otplib `afterTimeStep`); 5 wrong codes lock that account's 2FA for 15 minutes. Both are in memory, like pending tokens
- The pending token survives a wrong code (retry on the same screen) and is spent only when a code is accepted. The code screen has **Back to sign in** (`cancel2FA` in `AuthContext`); a session that has expired sends the user back to the sign-in form with a note instead of leaving the screen stuck
- `POST /api/auth/recover` on a 2FA account also needs an authenticator/backup `code` (answered with `requires2FA: true` once the recovery proof checks out)

**Setup flow (Settings → Security):**
1. `POST /api/auth/2fa/setup` — generates TOTP secret + QR code (not saved yet)
2. User scans QR code and enters confirmation code
3. `POST /api/auth/2fa/enable` — needs the **current password** (as `currentAuthSecret`) and refuses if 2FA is already on (replace = disable first); verifies code, saves the secret (AES-GCM-sealed with `SECRETS_ENCRYPTION_KEY` when set), issues 8 one-time backup codes (stored salted + scrypt-hashed; old SHA-256 hashes still verify; a used code is removed with one conditional `array_remove` UPDATE so concurrent requests can't spend it twice)
4. `DELETE /api/auth/2fa` — disables 2FA; needs the password **and** a current authenticator or backup code

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
- The server stores only a check of a PBKDF2 proof of the recovery key (see Two-Layer Security Model); the key itself never leaves the browser

### Encryption Specification

```
Algorithm: AES-256-GCM
IV: Random 12 bytes per encryption operation
Key Derivation: PBKDF2-SHA256, 600,000 iterations (OWASP 2024)
Salt: 16 bytes random per user
Master Key: Non-extractable CryptoKey (cannot be exported from Web Crypto)
Content: Encrypted client-side, stored as BYTEA in PostgreSQL. Content and metadata
         are a bound pair: each half's AAD is `chronicles:post:v2:<part>:<other half's IV>`
         (pre-AAD entries still decrypt, but only as a fully-legacy pair), so they are
         always saved together. Server and client both refuse plaintext posts
Topics: an entry's topic lives only in its encrypted metadata (`_taxonomyId`). The client's
         entries API strips `taxonomyIds` and the server ignores it, so no plaintext
         entry→topic link is written; old `post_taxonomies` rows can be removed with
         `npm run clear:topic-links -- --apply` (server; dry run without the flag)
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
| `/` | Redirects to `/dashboard` — the dashboard is home: opening the app, signing in and the logo (nav rail and mobile bar) land there. The Journal icon opens the journal on Today with a blank new entry; router state `newEntry` still does the same. Arriving from another view to edit an entry (`from`, `newEntryTopicId`, `newEntryDate`) is unchanged |
| `/journal` | JournalView |
| `/dashboard` | DashboardView — the customizable home dashboard and the default page; first item in the nav under the logo, named **Today**, Material `dashboard` icon |
| `/topics` | TopicsView |
| `/calendar` | CalendarView |
| `/settings` | SettingsView |
| `/goals`, `/goals/milestones`, `/goals/tasks`, `/goals/todos` | Goals/planning views |
| `/goals/filter` | PlannerFilterView — cross-hierarchy search/filter |
| `/health/*` | Health tracking views — tabs: Dashboard, Meals (`/health/food`), Exercise, Symptoms, Med list (`/health/meds`), Allergies, Reports; the daily med schedule lives on the Dashboard and `/health/schedule` redirects to `/health` |
| `/kitchen`, `/menu`, `/menu/recipes`, `/shopping` | From the Kitchen — tabs: Dashboard, Menu, Recipes, Shopping lists (`MealsTabBar`, title `KITCHEN_TITLE`); `/menu/meals` redirects to `/health/food` |
| `/entertainment/*`, `/inspiration/*` | Media/inspiration views |
| `/finance`, `/finance/goals`, `/finance/savings`, `/finance/reports`, `/finance/reconcile` | Finance (opt-in) — tabs: Budget & Bills, Goals, Savings, Reconcile (own opt-in switch), Reports (`FinanceTabBar`, framed by `FinanceShell`) |

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
- `client/src/stores/uiStore.ts` — Search, sidebar, view mode, theme colors, `pencilOnly` toggle, `displayName`, `topicCustomFields` (user-defined field defs per topic)
- `client/src/types/userFields.ts` — `UserFieldDef` (id, label, type) and `TopicCustomFields = Record<number, UserFieldDef[]>`
- `client/src/utils/stripHtml.ts` — also exports `summarizeUserFields(defs, values)` for auto-content generation
- `client/src/stores/entriesStore.ts` — Encrypted entries cache, topics, feature flags, CRUD operations

**Client Services:**
- `client/src/services/api.ts` — Single API client with `X-Requested-With` CSRF header; fetches up to 5,000 entries on init; includes 2FA endpoints (`login2fa`, `setup2fa`, `enable2fa`, `disable2fa`)

**Journal View:**
- `client/src/views/JournalView.tsx` — Two-panel layout (entry list + editor); preserves `_widgetType` through saves so wellness check-in entries remain linked; date filter bar shown when `viewMode === 'date'` with active date label and Clear button; topic filter bar shown when a topic is active

**New Design System Atoms/Molecules:**
- `client/src/components/atoms/HeaderBar.tsx` — Sticky 3-zone header (left/center/right slots); accepts accent background color and dark-mode flag
- `client/src/components/atoms/SectionDivider.tsx` — Hairline rule or labeled divider (italic label flanked by `--rule` lines); supports dashed variant
- `client/src/components/atoms/Watermark.tsx` — Fixed full-screen decorative SVG layer at 4–6% opacity behind content (`z-index: 0`, `pointer-events: none`); flips opacity by theme

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
- Topic organization with icons and drag-and-drop reordering (the topic picker, `TopicSelector`, and the Topics list always show topics A–Z; the picker has no "No topic" — an entry without a topic is saved under Journal, so it shows and lists as Journal)
- Client-side search (keyword + date range)
- Settings (header color, feature toggles per topic type)
- Session management (view/revoke active sessions)
- Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy)
- Apple Pencil: Scribble handwriting-to-text (CSS) + freehand drawing canvas with pressure sensitivity, palm rejection, undo, inline SVG storage (encrypted)
- Voice Dictation: mic button in editor toolbar; `useDictation` hook (`client/src/hooks/useDictation.ts`) wraps Web Speech API with `continuous: true`; auto-restarts on silence and iOS 60s cap via `onend + isListeningRef`; final results inserted at cursor; interim text shown below editor; handles `not-allowed` (mic denied) and `network` (offline on Chrome) errors inline; hidden on unsupported browsers

**Topic Custom Fields**
- Any topic can have user-defined custom fields: text, number, date, boolean (yes/no), URL
- **Topics list** (`TopicsView`, topics A–Z): the title with a **New topic** pill across from it (opens `TopicEditForm` under the title); a firmer `--border-default` rule, then flush rows split by hairlines — the topic icon in the accent (thin), the name (22px Work Sans Light), "11 entries" muted on the right; no chevron, no first-row highlight; swipe reveals Delete
- **Topic page** (`TopicDetailView`, `/topics/:id`): back caret, the topic icon in the accent and the thin title, with **Edit topic** (grey pill) and **New entry** (accent pill) across from it — on phones (≤768px) both fold into a ⋯ menu (`RowMenu`: New …, Edit topic); the content lines up with the topic icon on desktop and with the back caret on phones; a rounded **Search …** box; entries grouped under thin month headings ("October 2026") over a hairline — rows show the first custom field as the title and the rest as a muted line (else the entry text). **Edit topic** swaps in `TopicEditForm`: an outlined icon tile (tap to pick) beside the name as a big thin title, **Custom fields** ("Shown on every entry in this topic") as one outlined box of rows — name typed in place, a "Text ⌄" type pill, × — ending in an always-visible "+ Add field" (it keeps a field being typed and opens another blank row; Enter does the same; fields save as they're added, no Save needed), a **Hide main text field** card with a switch (always honoured in the editor — even when the entry has text, e.g. its saved field summary; the text stays, hidden, and Format reveals it), then a neutral **Delete topic** pill on the left (red on hover; asks once in its own grey-shaded `--bg-panel` box above the buttons — "Delete “X”? Entries keep their data but lose this topic." Delete / Keep it — then returns to Topics) and Close / Save topic pills on the right
- Fields defined by editing a topic in the Topics view (`TopicEditForm`); stored as `topicCustomFields` setting (JSONB, `Record<number, UserFieldDef[]>`)
- Field definitions loaded into `uiStore.topicCustomFields` on init via `useInitializeData`
- Field values stored in entries at `metadata._customFields._userFields` (`EntryForm`)
- **Private settings** (`client/src/services/privateSettings.ts`): `displayName`, `timezone`, `plannerFilters`, `topicCustomFields` and `planningViews` are stored master-key encrypted (`{ ciphertext, iv }`, same shape as `useEncryptedSetting`). Write them only with `savePrivateSetting` from `usePrivateSettings()`; the init paths (`useInitializeData`, `JournalView`) decrypt them with `openPrivateSettings` and re-save any legacy plaintext value sealed (`migratePrivateSettings`)
- When saving with no text content but non-empty field values, a plain-text summary (`Label: value · …`) is auto-generated as entry content — see `summarizeUserFields` in `client/src/utils/stripHtml.ts`
- `UserFieldDef` and `TopicCustomFields` types are in `client/src/types/userFields.ts`

**Productivity**
- **Planning boards** (`GoalsView` → `organisms/KanbanBoard.tsx`): **Tasks** shows only tasks linked to a goal or milestone; unlinked ones are **Todos**. Every Planning tab (Goals, Milestones, Tasks, Todos) has, in the header, a **Search** box and a **Sort** menu for the tab you're in (board and list alike; `searchAndSort` in `utils/planningView.ts`: every query word must match the title/parent/priority; Newest, Oldest, Title A–Z, Due date, and Priority on Tasks/Todos; drag-reordering within a column is off while searching or sorting — filters don't stop it) and a **List | Board** switch. Under the tabs, **Tasks** has **Goal**, **Milestone** and **Status** filter pills (a task counts under a goal directly or through its milestone; the milestone list narrows to the chosen goal; a status filter shows just that column) and **Todos** has **Status**; while a goal/milestone filter is set the board's + links the new task to it. On phones/tablets (≤768px, `useMediaQuery`) search, sort, the filter pills and saved views fold into one **Filters** button in the header (with a count of what's set) that opens them in a panel under the tabs; List | Board and New stay in the header. **Saved views**: once a search, sort or filter is set, **Save view** names it in place (same name replaces); a **Saved views** pill reopens one — switching to its tab and restoring its search, sort, filters and List/Board — and **Delete view** (second click confirms) removes the one showing. Stored master-key encrypted as the private setting `planningViews` (`SavedPlanView` in `utils/planningView.ts`). Filters is no longer a tab or button — the `/goals/filter` page only opens from old links (remembered per tab, `planning-view-v1`; board by default). Board = one toned column per status (lanes on `--bg-lane`, cards on `--bg-lane-card`, `--bg-lane-over` while dragging over — light: #eaecef lanes with #fefefe cards; dark: unchanged) (Goals: New, Planned, In Progress, Paused, Achieved — `GOAL_COLUMNS`; Milestones: New, Planned, In Progress, Completed — `ROADMAP_COLUMNS`; Tasks/Todos: To Do, In Progress, Done — `TASK_COLUMNS`, from `isInProgress`/`isCompleted` via `taskStatusOf`/`taskFieldsForStatus`), each with its name, "N cards" and a full-width **+** that opens a new entry in the journal with that status preset (`useNewEntryInJournal(topicId, fields)` → `newEntryFields`). Cards: milestones show their parent goal as a small tracked-caps line in the accent (no pill); tasks a priority pill; goals neither, the title, the entry's picture as a small round avatar on the right (featured image, else the first — its thumbnail), one grey detail line (task's milestone or goal), a flag date chip and a done/total progress chip — no people, tags, comments or files. Columns never stack: on phones/tablets (≤768px) they stay side by side at `min(80vw, 300px)` and the row scrolls sideways with snap; touch drags start with a short press-and-hold (`TouchSensor` 220ms) so a swipe still scrolls, mouse drags after 5px. The click a drop fires never opens the card (`KanbanBoard` ignores clicks while dragging and for 300ms after). The sort and the Tasks/Todos filters are kept in `sessionStorage` (`planning-filters-v1`), so opening a card in the journal and coming back keeps them. **Dragging a card up or down in its column** sets its place on every tab (Goals, Milestones, Tasks, Todos) and it stays there: the order is saved as the master-key-encrypted setting `planningOrder` (`{ goals, milestones, tasks, todos }` id lists, top first — `inPlanOrder` in `GoalsView`); it's the "Newest" order (list view too), with cards never placed yet (new ones) on top, newest first. Dragging a card to another column changes its status (milestone/task changes roll up to the parent milestone/goal); clicking opens it in the journal. List = the standard entry rows
- Goals & milestones with progress tracking; goal "In Progress" status supported
- Custom Planner Filters (`/goals/filter`) — cross-hierarchy search across goals, milestones, tasks, and todos; filter by keyword, item types (toggle chips), status, priority, parent goal, parent milestone; save named filters persisted to `plannerFilters` setting; the applied filter is kept in the URL (`?f=…`, `encodePlannerFilter`/`decodePlannerFilter` in `types/planner.ts`) so it survives editing a result in the journal and coming back; collapsible panel with inline filter summary; results shown in sectioned list with counts; filter config types in `client/src/types/planner.ts`
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
- Wellness check-ins — water glasses, mood (1–5), sleep hours, period toggle, flow intensity; stored as `_widgetType: 'wellness-checkin'` entries with Wellness topic; editable via `WellnessFields` custom fields in journal (the four-square `WellnessPanel quad`, like the dashboards)
- **Reports** (`HealthReportingView` + `organisms/HealthReport`): the "Health" title with a **Today / Week / Month / Year / Custom** outlined segmented switch across from it (chosen = `--bg-active`, `--color-accent-soft` text; phones ≤600px show Day / Wk / Mo / Yr and a calendar icon for Custom so it stays on the title's line). Sections are big thin Work Sans headings on the canvas with `--bg-panel` cards (12px corners, no outline): **Wellness** — Water / Mood / Sleep `StatTile`s (the chosen one drives the chart), "<Metric> over time" `TrendChart` (Daily + dashed 7-day average), and **Insights** (outlined boxes: "Water intake → symptoms" + a green "Pattern found · N days" pill, then muted label / bright value rows; food/medication/exercise correlations in the same boxes, or a quiet "No food or medication correlations yet" note); **Symptoms** — "Frequency and severity" bars per day (per month over a year; count above, coloured Mild `--mood-4` / Moderate `--chart-amber` / Severe `--mood-1` by average severity) beside "Most common" (hairline rows, "3×"), plus "Often together" co-occurrences; **Meals** — most eaten ingredients; **Exercise** — This month (sessions, minutes, "All logged as …"), By week (accent bars) and Impact on symptoms (before → after, rise in `--mood-1`, drop in `--chart-green`). `--bg-panel` is #24262d dark / #fbfbfc light

**Calendar**
- Shows scheduled items only — never ordinary journal entries: events/meetings on `startDate`, tasks/todos on `deadline` (else their creation day), goals/milestones on `targetDate` (`calendarDayFor` in `client/src/utils/calendarItems.ts`)
- Look: "October" in soft white with the year muted, both at the view titles' 200 (44px); Day / Week / Month as one outlined group (chosen on `--bg-active`, its text the standard `--text-primary` — no accent), an outlined **Today** box and an outlined ‹ › pair. **Day**: "Thursday, October 15" (26px thin) with an **Add entry** pill, a firmer rule, rows of time (muted) | kind (soft accent) over the title; bills due show first. **Week**: one row per day — big thin number + short weekday | items as dots (amber = bill with "$155.00 due", accent = entry), "—" when empty. **Month**: left-aligned Sun…Sat over a firmer rule, faint cell lines, today a filled accent disc, the chosen day on `--bg-panel`, items as dot + text, "+N more"; the side panel shows the big day number + weekday with an **Add** pill, then rows of a dot (amber bill / accent entry) + the title over its kind, or "Nothing on this day.". **Phones** (≤768px): a compact month — S M T W T F S, centred numbers with up to three dots, today a filled accent disc, the chosen day on `--bg-panel` — with that day's panel underneath (kind on the right of each row); ≤900px the panel moves under the grid
- Monthly grid with item previews per day
- Events and meetings placed on their `startDate`, sorted first, shown in user header colour
- Day detail panel with full editable entry list

**From the Kitchen**
- Shopping lists have a **Title** field in the New list form; a list saved without one is named "Shopping list created on Oct 7, 2026" (`defaultShoppingListTitle` in `client/src/utils/kitchen.ts`, also applied by journal Save and autosave). In the journal editor a shopping list has **no text area** (its text is only a title). Its fields (`ShoppingListFields`): sentence-case **Items** / **Notes** / **Recipes** labels in `--text-soft`; items = round tick circle, the name edited in place (no box), an outlined category pill with a chevron, and ×, with "N of M left to get" on the right; an outlined **+ Add an item** box (Enter adds); Notes in an outlined box; linked recipes as accent-tinted chips (`--color-accent-soft` text, ×) plus a quiet **+ Link a recipe**. **Name-led topics** never show the text area — a field is the name: Meals → **Meal Description**, Medication → **Medication Name** (`medicationName`), Allergy → **Allergen**, Goal → **Goal Objective**, Milestone → **Milestone Objective**, Recipe → **Recipe name**, Event → **Event name**, Meeting → **Meeting name**, Task → **What needs doing?** (`taskDescription`) (`NAME_FIELD_BY_TYPE` in `EntryForm`). The hidden text mirrors the name (so lists show it); an old entry's text is copied into the name field once when opened; writing beyond the name is kept, never overwritten. Menu Plan entries render `MenuPlanFields` with no text area, and Priorities entries `PrioritiesFields` with none either (their text is only the "Priorities: mm/dd/yyyy" title). **One set of custom fields**: every entry is written with the journal editor (`EntryForm`), so each topic's field form exists once — the dashboard's Quick entry is the same `EntryForm` in its `variant="quick"` layout, never a separate form. Titles come from `generatedEntryText` in `client/src/utils/entryText.ts`. **Fields-only entries always save**: any filled field enables Save (`canSave`), and a journal save with no text writes the field summary as the text. **Books, Quotes and Exercise** never show a text area — just their fields. Neither does **Wellness** (its auto-save writes a "3/8 glasses · Mood 2/5 · 6h sleep" text, which must not bring the text area back). Their text is generated from the fields: "Title — Author", "“Quote” — Author", "Running · 30 min · 3 mi" (`exerciseSummary` in `client/src/utils/exerciseSummary.ts`, shared with the Health quick log). It replaces only an earlier generated line or the old "a · b" auto-summary; other writing already on an entry is kept (hidden, never deleted). A quote typed into the text area moves into the Quote field once. Tasks are name-led too: **What needs doing?** is the title (`taskDescription`), the text area is hidden, and an older task's text fills the title once
- **Recipe view** (`RecipeEntry`, the formatted page): no footer: **Edit** is an accent pencil icon (tooltip "Edit recipe") across from the title (Delete is the editor's own — no duplicate; no Add to shopping list / Add to menu); **Print** is a small printer icon in the top-right corner of the Serves cell. Print draws the recipe into a `#print-sheet` portal on `<body>`; `html.print-sheet-open` (GlobalStyle) hides `#root` on paper and prints the sheet alone in light ink, then removes it on `afterprint`
- **Field-form kit** (`molecules/fields/formKit.ts`): the shared mockup pieces — sentence-case section labels, big borderless title field (`TitleInput` in `fields/TitleInput.tsx`: a one-line title that wraps and grows to show all its text — an auto-sized textarea at 1.32 line height, Enter adds no line break; Recipe/Event names are the same at 38px), outline chips (chosen = accent outline + `--color-accent-soft` text, no fill), segmented control (same), outlined stats strip with large light numbers, unit pill, date | time box, outlined one-line and multi-line boxes. New field forms build from it
- **Goal fields** (`GoalFields`): the objective as a big borderless title, then one outlined box of rows with a muted label on the left — **Type** chips (Short-term / Long-term), **Status** chips (New, Planned, In progress, Paused, Achieved = `completed`), **Target date**; then **Notes** (`notes`) in an outlined box. Goals have a **Paused** status and the goals board a Paused column (`GOAL_COLUMNS`; milestones keep `ROADMAP_COLUMNS`)
- **Milestone fields** (`MilestoneFields`): the objective as a big borderless title, then the same outlined row box (`RowBox` / `LabelledRow` in formKit) — **Goal** as an outlined "No goal ⌄" pill picker, **Status** chips (Not started, In progress, Done; a board-only "planned" shows as Not started), **Target date**; then **Notes** (`notes`) in an outlined box
- **Task fields** (`TaskFields` — Todos are tasks): the task as a big borderless title, then the outlined row box — **Part of** (goal and milestone as outlined pill pickers side by side; picking a milestone sets its goal), **Priority** chips (plain, no coloured dots — the board's priority pills keep their colours: Low `--chart-blue`, Medium `--chart-amber`, High `--mood-1`, Urgent `--color-danger`), **Deadline**, **Status** chips (To do / In progress / Completed → `isInProgress` / `isCompleted`), **Auto-migrate** "Move to tomorrow if unfinished" switch; then **Notes** (`notes`) in an outlined box
- **Exercise fields** (`ExerciseFields` — journal and the Health dashboard's Log Exercise): **Activity** chips, **Intensity** segments (Easy / Medium / Hard), **Stats** strip (Duration min, Distance with a mi ⇄ km pill, Calories kcal with an **Estimate** action; italic = AI), **When** date | time, **Notes**. Log Exercise fills an unset date/time with now and calculates calories with AI when none are typed
- **Symptom fields** (`SymptomFields`): **Severity** as ten tiles filled up to the level (accent only: a light accent tint at 1 deepening to the full accent at 10 — dark numbers on the light tints, `--on-accent` on the deep ones; empty tiles `--bg-today-col`), the level as a big Work Sans figure + "/ 10 · Mild|Moderate|Severe" (`severityWord`: 1–3 / 4–6 / 7–10) on the right and Mild / Moderate / Severe under the scale; **When** = one outlined date | time | Lasted (min) box; **Notes** in an outlined box
- **Allergy fields** (`AllergyFields`): the allergen as a big borderless title, **Reaction** in an outlined box, the shared Severity scale (`SeveritySection`, exported from `SymptomFields`), **When** date | time, **Notes**
- **Menu plan fields** (`MenuPlanFields`): **Week starting** as an outlined date box, then each day's label over one outlined `RowBox` of meal rows (slot muted on the left, the meal typed in place, a "Link recipe ⌄" `BareSelect` pill)
- **Priorities fields** (`PrioritiesFields`): up to five rows — round tick circle, text in place, × — and an outlined "+ Add a priority" box (Enter adds), "N of M left"
- **User-defined fields** (`UserFieldsForm` — Books, Quotes, Music and any topic with fields set in Topics): the same outlined style — a leading Title/Name field is the big borderless title; long-text labels (quote, notes, review, description, thoughts, lyrics…) get an outlined multi-line box (quotes italic); others an outlined one-line box under a sentence-case label; URLs show "https://" inside the box; yes/no fields are an outlined row with a switch. Books/Quotes/Music hide the text area only once the topic has fields — with none defined the text area stays
- **Medication fields** (`MedicationFields`): the name (`medicationName`) as a big borderless title, then **Dosage** in an outlined `BoxInput` under its label (40px below the title, like Allergy's Reaction); **How often** chips (Once daily, Twice daily, As needed, Weekly — an older Three times daily / Custom still shows while set); **Reminders** = outlined time pills (time, clock, ×) plus a dashed accent **+ Add time** pill; **Nutrients per dose** as an outlined formKit strip (Iron, Vitamin D, B12, Vitamin C; placeholder = the value read from the name/dosage, else —; italic = AI); **Notes** behind a **+ Add notes** link; a **Currently taking** card with a switch (`isActive`)
- **Meal fields** (`FoodFields` — journal and the Health dashboard's Log a Meal, with `compact`): "What did you eat?" as a big borderless title, **Meal** chips, **When** date | time, the outlined **Nutrition** panel (no fill), **Ingredients** and **Notes** in outlined boxes
- **Event / meeting fields** (`EventFields`, `MeetingFields` = the same layout): the name as a big borderless title (an older entry's text fills it once); meetings add an **About** box (topic, attendees); **When** = Starts / Ends rows of date | time in one outlined box, with an **All day** switch (`allDay`, drops the times); **Where** = venue, address and phone rows with icons in one outlined box; **Notes** in an outlined box; a **Sync to calendar** card with a switch (when calendar sync is on)
- **Recipe fields** (`RecipeFields`): the name as a big borderless Work Sans title and a one-line description under it; an outlined strip of facts split by rules (Category, Cuisine, Servings, Prep time, Cook time, Calories — small muted label over the value, units on the right); **Difficulty** as outline chips (chosen = accent outline + text); **Ingredients** ("None yet" / count on the right) and **Method** as inline-edited rows plus an outlined add box (+ / the next step number; Enter adds — "2 cups rice" splits into amount + name, `splitIngredient`); **Shopping lists** as accent-tinted chips plus a dashed **+ Link a list ⌄** pill
- **Menu** (`MenuView`, `/menu`): header controls = an outlined ‹ Oct 12 – 18 › week pill, a divider, a grey-outlined **Make shopping list** `PillButton` (`$variant="neutral"`) and a standard outlined **Save menu** `PillButton` (no New recipe — that's on the Recipes tab). The week grid has meal slots down the side (muted labels) and days across ("Mon 12" over a 2px rule; today in `--color-accent-soft` over an accent rule, no cell rules). The week sits in the same centred 1150px column as the title and tabs (slot labels flush with the tabs' left edge, the grid ending with their rule). Every cell is the same box (210px tall, 16px column / 22px row gaps), so the week reads as one even grid: the day names sit flush with the tiles' left edge and their rule runs exactly the tile width, and the slot labels line up with the first line of the meal names. A planned meal is a `--bg-tile` tile filling its cell: its name (tap to edit), a × to clear the slot, and an accent **Recipe** link pinned to the bottom (opens it; or **Link recipe** to pick one); an empty slot is the same box with a faint dashed `--border-dashed` outline (firmer on hover) and a centred +; tapping it opens the meal box — `RecipeAutocomplete` in free-text mode: type a meal name (Enter keeps it) or pick from the floating **Recipes** list to link one. The recipe picker everywhere (Menu, shopping lists) is a sunken box with an accent outline while focused and a floating `--bg-tile` menu (`--border-pop` outline) headed "Recipes", each recipe with a link icon. Type-ahead: titles starting with what you typed come first, and the best one completes inline in faint text — Tab or → takes it. Phones get one card per day with the same tiles
- `KitchenDashboardView` (`/kitchen`, the sidebar's fork-and-spoon icon) — bordered collapsible `CollapsibleCard`s like the Health dashboard (two columns on desktop, stacked at `NAV_COMPACT`; "See all" sits in the card title row via the card's `action` prop): **Meals** — today's planned meals from the weekly Menu Plan entries (or the next planned day within two weeks; a meal linked to a recipe opens it): title "Today" (or the day), grey subtitle "Sat, Oct 17 · 2 meals planned", an accent **See all** link (sentence case, 500); rows = slot name in `--text-muted` beside the meal, no rules, lifting onto `--bg-row-hover` on hover; **Shopping list** — the newest list with unchecked items: card titled "Shopping list" with a grey subtitle (the list's name · N left to get) and an accent **Open list** link in the title row; a 4px accent progress rule (items got); round tick-off circles with the item names (unchecked first); an outlined **+ Add an item** box (Enter adds). `CollapsibleCard` takes a `subtitle` for this. Pure helpers in `client/src/utils/kitchen.ts`

**Journal**
- **Journal page**: a "Journal" title row (`JournalTemplate`, edge to edge, hairline under it) with an outlined accent **New entry** pill right beside the title (`JournalTemplate`'s `titleAside`) and, on the right, the open entry's breadcrumb (`EntryBreadcrumb`: sentence case, ancestors muted, the current crumb bright — left out when it would only say "Journal"). The pill ("+ New entry", a plus icon before the words) is 28px tall, 13px / 500, and the breadcrumb 14px, level with the middle of the title, on every screen. On phones (≤768px) the pill stays beside the title and the breadcrumb is hidden. The list's tool row (`ViewTabs`) is a sunken **Search** box (typing switches the list to search; its tune button opens the topic / From–To filters in `SearchPanel`, × or Escape leaves) then **Today / All / Bookmarks** as one outlined segmented group (current = `--bg-active` with the icon bright `--text-primary`, never the accent). The editor's top bar: the topic picker in regular-weight (400) sentence case, then Bookmark, Add images, **Add image from library** (Material `photo_library` icon; when Entry Images is set up), **Format** (always visible — the type icon; shows / hides the formatting bar), and a **⋯ More** menu: **Dictate** first, **Share** (disabled on entries with images, recipes excepted), **Draw** (opens the drawing canvas via the editor's `drawingControlRef`) — an unavailable one stays listed, greyed with a one-line reason — a thin divider, then Expand (or × in edit view). The editor has **no header** (no big date or title block): its top bar — topic picker left, entry actions right — is 60px with the same `--border-subtle` hairline as the list's quick tabs, outside the scroll, so the two read as one bar edge to edge (edit view's full screen adds a × close at its end); then the featured image (if any) and the writing area; there is no + New there (it's in the list's tabs). In the plain journal, clicking into an entry does **not** go full screen — the toolbar's **Expand** button (maximize ↔ minimize) does, and ×/Escape collapses; an entry opened from another view (edit view) still opens full screen
- **Breadcrumbs remember where you came from**: opening an entry from any view passes router state `{ from: path+query }` (`useOpenInJournal`, calendar views, Goals via `journalOriginState`); the editor trail becomes Journal / that view (e.g. Journal / Health / Symptoms), built by `getEntryTrail` / `viewTrailFor` in `client/src/utils/topicBreadcrumb.ts` (only known in-app paths; anything else falls back to the topic's home). The state survives reloads and the calendar's new-entry handoff
- **Edit view** (journal opened with a `from` origin, i.e. from any other view): the editor opens full width (expanded), the entry list is filtered to the edited entry's topic (the previous topic filter is restored when leaving), and Save — or "+ New" / "Discard changes" / **Delete** — closes the editor and navigates back to `from`. Plain `/journal` (no origin) keeps the full list; **Save closes the entry** there too (the editor returns to a blank new entry, phones go back to the list). An open entry with text or fields also autosaves 3s after the last edit (`autoSaveDoRef`), without closing
- Entry lists are **spreadsheet rows** like the Meals log table: a stacked **Topic over Date** column then an Entry column, hairline rules and 16px entry text — **no column header row** on any list. Columns, date format ("Oct 07", month + 2-digit day, no year — `formatListDate`, same on every list) and cells (`MetaCell` holds topic + date) live in `client/src/components/molecules/EntryTable.tsx`, shared by `EntryCard` (journal, 20px inset) and `EntryListCard` (topic/task/health lists). The topic label is left out when the list is one topic (journal filtered to a topic; Exercise, Shopping, a topic's page, etc. — `hasMixedTopics` in `client/src/utils/mixedTopics.ts`), so those rows show just the date. The desktop journal list panel is 380px wide to fit the columns. **Every list except the journal** (`EntryListCard`) instead puts the date on the right as "Oct 11" (`formatListDate`), with a 16px title and 22px row padding
- In the journal's **All** view, entries sit under "October 2026" month headings (thin 18px Work Sans on the canvas, inset to the rows' text, hairline under; `MonthHead` in `EntryList`)
- The journal list starts with the tool row (`ViewTabs`): the Search box, then **Today** first (the journal opens on today — unless you arrive to edit an entry from another view or a day was already picked), All, Bookmarks. Keyword and dates only filter while searching; the topic filter persists across views with a Clear bar
- **No inline new-entry forms on list pages**: every "New …" button (topic pages, Health, Goals, Planner, Shopping) calls `useNewEntryInJournal` (`client/src/hooks/useOpenInJournal.ts`) → the journal opens a blank entry with that topic preset (router state `newEntryTopicId`, held as `pendingNewTopicId` in `JournalView`) in edit view — full width, list filtered to the topic, Save returns to the page
- On phones/tablets (≤1024px) the journal shows one pane at a time; while the editor pane shows, a back caret sits before the "Journal" title (`JournalTemplate`'s `onBack`, wired to `handleMobileBack`) and returns to the list — like the other views' title carets; there is no separate back bar
- Editor footer (`EntryForm` `SaveRow`): Delete + save status on the left, **Discard changes** (standard neutral outlined `PillButton`) and **Save entry** on the right. On phones (≤768px, not tablets) the footer is not docked: it sits in the page flow after the entry (`useMediaQuery` in `EntryForm`), the "Saved" note is hidden (a save failure still shows) and the buttons stack full width: Save, Discard, Delete
- Journal list rows (`EntryCard`): tapping the uppercase topic label filters the list to that topic without opening the entry. No completion checkbox — completed tasks/goals/milestones just show their title struck through

**Finance (opt-in, off by default)**
- Turned on in Settings → Features (`financeEnabled`); Reconcile has its **own** switch, "Paycheck reconcile" (`reconcileEnabled`, shown under Finance). Both are in `OPT_IN_FEATURE_FLAGS` (`client/src/utils/featureFlags.ts`) so they default to **false**. The Sidebar item (`attach_money`, a $ sign) shows only when Finance is on; `FinanceShell` shows a "turn it on" note on `/finance/*` otherwise (and on `/finance/reconcile` while Reconcile is off). All manual entry — no bank connections
- Tabs (`FinanceTabBar`): **Budget & bills** `/finance` (old `/finance/budget` redirects), **Goals** `/finance/goals`, **Savings** `/finance/savings`, **Reconcile** `/finance/reconcile` only when its switch is on, and **Reports** `/finance/reports` last. Budget, Goals and Savings never need Reconcile
- **Own tables, not `posts`** (a large history never adds to the journal's 5,000-entry load): `finance_paydays`, `finance_bills`, `finance_budget_categories`, `finance_expenses`, `finance_goals`, `finance_savings` — each row is just `id` (client UUID) + `payload_encrypted` + `payload_iv` + timestamps. DDL is `financeTableStatements` in `tenantQueries.ts` (new tenants via `generateTenantSchemaStatements`, existing ones via the memoised JIT `ensureFinanceTables`)
- API `server/src/routes/finance.ts` (`/api/finance/:kind[/:id]`, GET / PUT upsert / DELETE): `:kind` ∈ `paydays|bills|budget|expenses|goals|savings`, mapped to table names by `FINANCE_TABLES` — never interpolated from input. The server never sees amounts, names or dates
- Encryption: `encryptionService.encryptRecord/decryptRecord` — JSON payload, AAD `chronicles:finance:v1:<kind>:<id>` (binds a ciphertext to its table and row; no legacy fallback). Exposed by `EncryptionContext`
- Client: `useFinance(kind, { enabled })` (`client/src/hooks/useFinance.ts`) loads a kind lazily on first use, saves optimistically (rolled back with an inline error), and serialises writes per record; decrypted records live in `stores/financeStore.ts`, wiped on lock (`clearFinanceCache` in `lockLocal`). Money is integer cents; all maths is pure in `client/src/utils/finance.ts` (unit-tested)
- **Budget & Bills** (`FinanceBudgetView`: `BudgetTable`, `SpendingLog`, `BillsTable`, sharing one month). Sheet look (`SheetHeading` / `SheetBox` / `Seg` / `RowBtn` / `DueBadge` in `FinanceParts`): an outlined ‹ October 2026 › `MonthPill` in the Finance title row (`FinanceShell` `headerAside`); a `StatBoxRow` of Planned (bills scheduled /mo) · Bills (due this month · paid) · Spending · Left (accent; "N% of plan remaining", red when over); **By category** — one outlined table (no fill, faint row rules): Category with a 3px accent bar of the budget used, Planned (typed in place, plain until focused), Bills (+ muted amber "$X unpaid"), Spent, Left (accent when money's left, muted at 0, red when over); an accent **Manage categories** link under the table opens (and folds away) **Categories** ("N active") — one outlined box of rows: ↑/↓ to reorder, the name (click to rename in place), archive / delete icons (delete asks "Delete?" once), and an "+ Add a category" row on `--bg-panel`. **Log spending**: one outlined row — date | what | $ amount | category ⌄ | Add pill — with a note, and the month's lines in an outlined box with a Total footer. **Bills & subscriptions**: an All / Subscriptions / Paused / Cancelled switch and **+ Add bill** pill; rows = name over "Bill · Category", amount /mo, the due date (an **Overdue · Oct 15** rose badge, **Due today / tomorrow** amber badge, else the plain date — year only when not this year), a quiet outlined **Mark paid** (or Undo paid) and a ⋯ menu (Edit first, then pay early / undo, Pause/Resume, cancel, Delete); a `--bg-panel` footer with Monthly / Yearly / Subscriptions totals. Budget: categories with a monthly planned amount vs **Bills** (active bills in the category due that month, straight from the bills list — counted as soon as a bill is entered) and **Spending** (the Spending log, plus Reconcile's spending and one-off lines when it's on); Left = planned − bills − spending; payments show as "paid", never counted twice. Bills: frequency, a due date the schedule repeats from (month ends clamp: Jan 31 → Feb 28), monthly-equivalent cost, totals and "Subscriptions $X/mo", status active / paused (out of the budget and Calendar for now) / cancelled (for good). **Mark paid** records a payment for the next unpaid due date on the bill only (`payments: { forDue, paidOn, amountCents }[]`, `markBillPaid` / `undoLastPayment` / `nextUnpaidDue`) — it never posts to Reconcile or anywhere else; unpaid past due dates show "Overdue". Each bill row shows one main action from `primaryBillAction` (Mark paid when due within `DUE_SOON_DAYS` = 7 or overdue or never paid, else Undo paid), Edit, and a `RowMenu` "⋯" (`FinanceParts`) with pay early / undo, Pause/Resume, Mark cancelled/Reactivate and Delete (second click confirms). The Budget stat "Bills scheduled $X/mo" is the forecast from schedules (`billTotals`), not an average of payments
- **Reconcile** (`FinanceReconcileView` + `PaydayEditor` / `PaydayHeader`, behind `reconcileEnabled`) — look: a `--bg-panel` header bar (Current payday date | Starting balance, typed in place; a quiet **Close payday** / Reopen `RowBtn` + ⋯ with New payday and Delete), a `StatBoxRow` (Starting balance · Paying · Leftover to spend in the accent · Still waiting), a status line when lines exist, **Bills I'm paying** ("+ Add from my bills" link opens the picker; lines in an outlined sheet with round ticks; one outlined add row description | Paying ⌄ | $ | category ⌄ | Add, a note with a "make this a combined line" toggle), **Spending from leftover** (date | what | $ | category | Add), **Check my balance** (Bank says | $ | Check, then Bank shows / Should show / Available now and the verdict), **Past paydays** (outlined sheet; current row marked "· current", status pills: All cleared / OK to spend in the accent, N waiting / Closed grey; "+ New payday" link). One *payday* at a time, replacing a notepad: starting balance (bank after everything posted) → bills being paid (pick from Bills, due-soon pre-ticked by `suggestBillsForPayday`, or type a line; **Combined** lines roll small charges into one, e.g. "Uber — 9") → **Leftover to spend**; optional spending lines; tick each line ✓ as it clears; **Check my balance** compares the bank's balance with *start − cleared* ("Matches" / "Off by $X") and shows **Available now** (bank − still waiting). All cleared + matching check = "OK to spend". Closing keeps it in history; a new payday can carry over waiting lines. Independent of Mark paid (no linking either way)
- **Reports** (`FinanceReportsView`) — a search pill plus All types / All categories / This year picker pills (custom dates add two date pills), a `StatBoxRow` (Total paid · range, Average a month, Biggest bill, On subscriptions · N subscriptions), then **By bill** (outlined sheet: bill + kind, category, payments, last paid, total), **By month** (month, accent bar, N payments, total; empty months muted; `--bg-panel` Total row) and **Every payment** (grouped under `--bg-panel` day headers). Search bill payments by name, type (bill/subscription) and category for this/last month, this/last year or custom dates: total, **average paid a month** (`averagePerMonth`: from the first month with a payment through the current month — never future months or months before tracking began; real empty months count), biggest bill, subscriptions total; cards By bill, By month (every month in the range) and Every payment. Payments come from Mark paid (dated `paidOn`) plus, when Reconcile is on, payday bill lines (dated the payday) — skipped for a bill already marked paid that month, so nothing counts twice (`billPaymentRecords` / `filterPayments` / `reportSummary` / `periodRange` in `utils/finance.ts`)
- **Goals** (target, date, progress from a linked savings fund or a typed amount): "N active goals · $X paid toward $Y" with a **New finance goal** pill, then one `--bg-panel` `PanelCard` per goal — 22px thin name (Paused / Achieved / Reached note), "By Feb 16, 2027 · 122 days left" muted, a quiet outlined **Mark achieved** `RowBtn` + ⋯ (Edit, Pause / Make active, Delete), a 5px accent progress track, "$121.00 of $1,940.00" and the % in the accent
- **Savings** (named **funds** — `SavingsPot` in code — with add / take-out entries): "Saved in all" over a 38px thin total with a **New fund** pill; funds as two-up `PanelCard`s — name + ⋯ (Rename or set target, Delete fund), a 34px balance ("of $target" + progress when set), one outlined date | $ amount | note `FieldRow`, then **Add to fund** (accent) and **Take out** (neutral) `OutlineBtn`s side by side, and the entries under a faint rule
- **Export** (Settings → Data → Export Finance Data → one "Export All" ZIP; shown even when Finance is off so data can always be taken out): `collectFinanceData` fetches and decrypts every kind fresh from the server; `financeExportFiles` builds a CSV per section (budget-categories, bills, bill-payments, spending, savings-funds, savings-entries, goals, paydays, payday-lines), `transactions.csv` (one signed row per money movement) and `finance.json` (full backup); `financeExportZip` bundles them with the dependency-free store-only writer in `client/src/utils/zip.ts`. Amount columns are written raw (the CSV formula guard would turn "-12.00" into text); free-text cells stay guarded. Settings → Data also has Seed Finance Data (`utils/seedFinanceData.ts`) when Finance is on
- Calendar: active bills' due dates show on the month grid, mobile list and day panel (`billOccurrences`), linking to `/finance`; paused/cancelled bills don't appear

**Dashboard (`/dashboard`, `views/DashboardView.tsx`)** — the default page (`/` redirects here; so does the logo)
- Header: a thin (200, like the view titles) 56px "Good morning / afternoon / evening, Alex" (the display name, else the username) over "Saturday, October 17 · 55° and clear in Portland" (15px muted italic); across from it a **Light | Dark | Auto** outlined group (10px corners, chosen = grey `--bg-active` fill + `--text-primary` text, no accent; saves `themeMode` like Settings → Theme) beside a neutral outlined **Customize view** `PillButton`. Customize opens a `--bg-panel` box: switches for each section and up to eight cities (the first is home — `MAX_PLACES`), found with Open-Meteo geocoding. Stored master-key encrypted as the `dashboardConfig` setting (`useEncryptedSetting`: `{ hidden: SectionKey[], places: Place[], clocksExpanded? }`); only coordinates go to Open-Meteo (`utils/weather.ts`: `findPlace`, `currentWeather`, `describeWeather`, `hoursFromLocal`)
- **Quick entry** (`organisms/QuickEntry.tsx`, a Customize section, on by default) straight under the header: `EntryForm variant="quick"` — the journal's own editor and topic fields in a `--bg-panel` card with a hairline outline (14px corners): no label — just an outlined "Journal ⌄" topic pill top-right, the writing area in thin Work Sans 22px (italic prompt), a hairline, Format / Draw / Dictate icons and **Save entry** (Ctrl/⌘ + Enter saves too) — no hint line under it, only an inline "Save failed" when a save fails. Saves like a journal save (`prepareEntryForSave` / `hasEntryData` in `utils/entrySave.ts`, also used by `JournalView`); no topic = Journal; the form clears after saving
- **Daily quote** when it's on (the `--bg-panel` grey card: a grey (`--text-muted`, 400) "Daily quote" label, then the quote (22px italic thin Work Sans, 19px on phones) with "— Author" muted under it, together, 36px under the label (44px on desktop) (top-aligned, not centred) and left-aligned, in `QuoteCard`: 36px top / 24px right padding (40px right on desktop, >900px), no balanced wrapping; `utils/dailyQuote.ts`) — else **Next up** (the same grey card, 14px corners) beside the **Wellness check-in** as four squares (`WellnessCheckIn quad bare` → `WellnessPanel quad`, no panel or heading: Water | Sleep over Mood | Cycle in one outlined 2×2 card, rules between cells, compact sizes with 38px faces — editing today's check-in entry): Next up = the next medication doses still to take today (`useTodayDoses` in `hooks/useTodayDoses.ts`; upcoming first, else the latest overdue): "Next up · in 25 min" / "Overdue · 2 h ago" in the accent, the time muted on the right, "Evening medications" (Morning / Afternoon / Evening / Night by time), the med names, **Mark all taken** (logs every dose + Meals sync) and **Snooze 30 min** (per-browser, `localStorage` `dashboard-snooze-v1`); "All caught up" when nothing's due.
- **World clocks**: a one-line strip in a grey `--bg-panel` card (14px corners, no rules) like the Next up / quote card — "World clocks", then the cities — home first, its name in the accent — ("New York **11:09 PM** 58°", as many as fit) and an accent **All N cities** link that opens the full grid of `--bg-tile` tiles (white in light; 10px corners, 16px gaps; four across, wrapping; city — home in the accent, the others grey (`--text-muted`), "Local" / "+3h", time, weather icon + °F + label in light (300) italics)
- Then two columns — **Today's priorities** (the newest Priorities-topic entry, not tied to the day — it carries over midnight: numbered rows, each text edited in place (Enter / leaving saves, emptying it removes the priority, Escape reverts) with a quiet × to remove it (shown on hover), an accent **New list** link beside "N of M done" that starts an empty list (a new entry — the old one stays in the journal); every Priorities entry is titled **"Priorities: mm/dd/yyyy"** (its own date; `prioritiesTitle` in `utils/entrySave.ts`, also applied by journal Save / autosave when the entry has no text), the standard `Checkbox` checkmarks, "Add a priority", up to 5; creates the topic/entry on first add) and **Coming up** (today's untaken dose groups still ahead, events/meetings by `startDate` and, with Finance on, bill due dates over 14 days: when | title + detail | the kind as a plain 13px / 500 label in its colour (no fill, no outline) — Meds (accent) / Event (blue) / Meeting (violet) / Bill (amber); "Calendar" link) | **Shopping list** (newest open list's items as outline pills, struck when got; "N left" and an accent **Open list** link (opens the list in the journal editor, where items can be removed); an outlined round **+ Add an item** pill under them — Enter adds to that list, or starts a new dated list when none is open), **On the menu** (today's Menu Plan slots; "Week" link) and **Medications** (today's doses as one flat list by time — the standard form checkmark (core `Checkbox`, `ch-check`: accent ring → accent check-circle), name + dosage, "Taken 1:35 PM" or the time muted on the right; "3 of 12 taken"; ticking logs / un-logs via `useTodayDoses().setTaken`); 80px between the two columns, 56px between sections; stacked (≤900px) the two columns keep that 56px gap between them

**Media & Inspiration**
- Entertainment tracking (music, books, TV/movies)
- Inspiration (research, ideas, quotes)

**Settings**
- Inputs inside Settings cards (`SettingsCard`) are **outlined like the custom fields**, not sunken: no fill, 1px `--border-card`, 10px corners, 48px, accent outline on focus (`outlinedInputs` in `styles/filledInputs.ts`); the Light / Dark buttons are outline chips (chosen = accent outline + `--color-accent-soft` text)
- Every section is a bordered `CollapsibleCard` like the dashboards (open/closed remembered under `settings-collapsed-v1`; all start collapsed). There is no in-app guide section. `SettingsTemplate` uses the same mobile layout as the other templates
- Account: display name, read-only username
- Security: change password (re-wraps master key, no data re-encryption); TOTP 2FA inline setup wizard
- Sessions: view and revoke active sessions from any device
- Features: enable/disable health tracking, planning, entertainment, and more per topic type; opt-in Finance
- Theme: header color (40+), **Light / Dark / Auto** — Auto follows the local clock (light 7 AM – 7 PM, dark otherwise; `utils/autoTheme.ts`). The saved `themeMode` setting holds the choice (`'light' | 'dark' | 'auto'`); `uiStore.themePreference` is that choice and `uiStore.themeMode` the theme in effect (everything that styles by theme reads `themeMode`). While Auto is on, `App.tsx` re-checks every minute and when the tab returns
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
- Bring-your-own AI: Settings → In-App AI lets the user pick **Claude (Anthropic API)**, **Amazon Bedrock** (AWS region + IAM access key ID and secret access key, optional session token — selecting Bedrock shows these fields directly; saved configs are normalized to `bedrockAuth: 'iam'` on load), or **OpenAI**, enter credentials, and choose a model (presets + any model ID)
- **Bedrock supports every text model, not just Claude** (`client/src/services/bedrock.ts`): inference uses the model-agnostic **Converse API** on `bedrock-runtime`; the model picker loads the account's text models live (`ListFoundationModels` + system `ListInferenceProfiles` for cross-region-only models like `us.meta.llama…`), grouped by provider, with a region-aware fallback list if listing fails. IAM requests are SigV4-signed in the browser with `@smithy/signature-v4` (`applyChecksum: false`, verified byte-identical to botocore); Bedrock API keys go as `Authorization: Bearer`
- **Fully client-side, like Entry Images** — the whole config (provider, model, keys, optional body weight) is encrypted with the master key and stored as the `aiConfig` setting; decrypted into module memory on unlock (`rederiveAiConfig`) and cleared on lock (`clearAiConfig`). Requests go browser → provider; the server never sees keys, prompts, or answers. Logged food/exercise descriptions DO go to the chosen provider (disclosed in Settings)
- `client/src/services/aiAssistant.ts` — config lifecycle, provider calls (`@anthropic-ai/sdk` with `dangerouslyAllowBrowser`, Bedrock via `bedrock.ts`, OpenAI chat completions via fetch), `estimateMealCalories` / `estimateExerciseCalories`, `autoCaloriesOnSave`; `useAiReady()` hook; the Anthropic SDK is a lazy-loaded chunk
- Food: calories auto-estimated on save when blank (Health dashboard quick log, journal Save) + an "Estimate" button beside Calories. Exercise: calories burned calculated on save from type/duration/distance/intensity (+ body weight) and **re-calculated when those inputs change**
- `caloriesSource: 'ai' | 'manual'` + `calorieBasis` in the entry's custom fields — typed calories are never overwritten; an AI estimate is refreshed only when its inputs changed. A failed estimate never blocks a save. Journal autosave does not call the AI (explicit Save does)
- CSP `connect-src` allows `https://api.anthropic.com`, `https://api.openai.com` and the per-region Bedrock hosts from `BEDROCK_REGIONS` (runtime + control plane)

**In-App AI chat (unsaved)** — the chat and its Settings section are named "In-App AI"
- `client/src/components/organisms/AiChat.tsx` — floating chat bubble bottom-right (`forum` icon), 112px up (96px on phones) so it clears the bottom Save bars (`POS` in `AiChat`); the panel opens above it and keeps its top ≥3rem below the screen edge that opens a small pop-up panel. Mounted once in `App.tsx` via `ChatGate` — only when signed in **and** unlocked, never on `/login`, `/register`, `/recover`, `/share`
- **AI disclosure** (`utils/chatDisclosure.ts`): the header reads "IN-APP AI · Not a person." and the empty state opens with "You’re chatting with an AI model, not a person." before "Ask anything." — said at the start of every session. The session start time lives in memory only (a ref in `AiChat`, reset by Clear); on each send, once three hours have passed since the start or the last reminder, a note "Reminder: you’re talking with an AI model, not a person." is added to the thread (never sent to the model)
- **AI safety protocol** (state AI companion laws — CA SB 243, OR SB 1546, WA HB 2225; the full text is the collapsible **Safety protocol** in Settings → In-App AI, `molecules/AiSafetyProtocol.tsx`, shown whether AI is on or off — change its `PROTOCOL_DATE` and change log with the text):
  - **Consent (18+)**: when AI is set up, the chat panel shows a "Before you chat" consent screen (not a person, 18+, provider terms, screening, what's recorded, not a therapist) with a required "I'm 18 or older" check before **Turn on chat**. Stored on the server in `public.ai_chat_consent` (`account_id`, `consent_at`, `consent_version`, `blocked`; `server/src/db/aiChatQueries.ts`, routes `GET /api/ai-chat`, `POST|DELETE /api/ai-chat/consent` — consent needs `ageConfirmed: true`, refused when blocked). `AI_CONSENT_VERSION` (`utils/chatDisclosure.ts`) — bump to ask everyone again. Client state in `stores/aiChatStore.ts`; Settings shows the status and **Withdraw consent**. `npm run ai:block -- <email> [--unblock]` (server) turns the chat off for an account believed to be under 18
  - **Screening** (`utils/chatSafety.ts`): every message gets the local `patternScreen` (direct first-person statements only) and, in parallel with the reply, `classifyRisk` through the user's own key (C-SSRS / SCOFF criteria → none / concern / elevated / urgent + suicide / self_harm / eating_disorder); the higher wins, and a failed classifier falls back to the pattern result. **Concern / elevated** → never pause: the reply (written under `SAFE_CONVERSATION_RULES`) shows, then a quiet `SupportNotice` box after it — "If you or someone you know is having a difficult time, support is available." with a **Find resources** link that opens one-tap chips (Call / Text / Chat with 988, Text HOME to 741741, Eating disorder helpline, Outside the US, Call 911); **urgent** → paused, the full `CrisisCard` with 911 first pinned at the top of the panel until **Keep talking** (which replaces the message box in the bottom bar while paused, so it never scrolls away), then one compact line for the rest of the session. A withheld reply is replaced by the notice (with a "withheld" line). A pattern hit writes the first reply in safe mode straight away. Every reply is screened too: `replyPatternScreen`, then `classifyReply` only for replies touching these topics (`replyNeedsReview`) — a failed review withholds the reply (fail closed); a harmful one is withheld behind the card. Once eating-disorder risk appears, `EATING_SAFE_RULES` are added (no calorie numbers, no body/weight comments) and `/save Meals` skips the AI nutrition fill. The persona (`CHAT_PERSONA`) is never a companion — no name or persona, never "your friend", no steering toward an ongoing relationship — and never turns someone away or says the chat isn't meant for this. The crisis card (`role="alert"`) has one-tap pills per line (Call / Text 988, Chat online, Text HOME, …); an unknown risk kind is recorded as null, never guessed Safe mode and the pinned card live in memory, survive Clear and end with the session
  - **Crisis resources** (`molecules/CrisisCard.tsx` — `SupportNotice` for concern / elevated, `CrisisCard` for urgent): 988, Crisis Text Line, the National Alliance for Eating Disorders helpline (first for eating-disorder risk), findahelpline.com and 911 (first when urgent)
  - **App analytics** (`public.app_analytics`, `server/src/db/analyticsQueries.ts`): one row per crisis card shown — `day` (server's date), `rating`, `risk_kind`, CHECK-allowlisted. **Never** an account id, IP, time of day or content; `POST /api/analytics/crisis-card` sits behind auth only to stop count stuffing and never reads `req.auth` or logs. No published report — `npm run report:ai-safety -- --from YYYY-MM-DD --to YYYY-MM-DD` (server) counts them if one is requested
- **Chats are never saved**: messages live only in component state, so closing the page or locking the journal (which unmounts it) clears them; "Clear" empties it. Replies come from the user's configured provider via `chatReply(system, turns)` in `aiAssistant.ts` (multi-turn: Claude Messages / Bedrock Converse with a message list / OpenAI chat)
- Look: rounded panel (18px) and pill input — a deliberate exception to the squared DS corners; alternating bubbles (user right in a lighter grey — `--bg-active` dark, `--bg-hover` light, never the accent; assistant left on `--bg-sunken`, notes centred). Assistant replies render a safe Markdown subset (paragraphs, headings, bullet/numbered lists, bold, italic, code) via `parseChatMarkdown` in `client/src/utils/chatMarkdown.ts` — a data tree rendered as React elements, never HTML
- Persona (`CHAT_PERSONA` in `chatSave.ts`): warm and human, humor and kindness where fitting; never mocking, patronizing or misogynistic; inclusive; always says it is an AI when asked; gently steers real distress or imminent-harm signs toward journaling or talking to a person and offers help finding someone
- **House style** (`client/src/utils/chatStyle.ts`): a banned word/phrase list (`BANNED_PHRASES` — "got it", "yeah", "I hear you", "you're right", "lovely", "wonderful", …), no stock assistant openers ("What's on your mind?") or slang ("What's up"), active listening, emojis capped at one (`MAX_EMOJIS`) with emotes in *asterisks* instead. All of it is in the system prompt; every reply is also checked (`findBanned`, whole words, any case/apostrophe, never inside `code` spans like `/save …`). A hit triggers one hidden rewrite request (`rewriteInstruction`); anything still left is removed (`scrubBanned`) and extra emojis dropped (`limitEmojis`) before display
- **Notes for the AI** (Settings → In-App AI): free text up to 2000 chars (`chatNotes` in the encrypted `aiConfig`) appended to the chat system prompt inside `<user_notes>`, after the house rules — safety, AI disclosure and banned words still win
- `/save Meals <food>` creates a proper Meals log row for today (meal type by time of day) and, when AI is on, fills its nutrients with `autoNutritionOnSave` before saving
- **`/save chat`** (or `/save chats`, any case) saves the whole conversation so far — user and AI turns, oldest first, no notes, errors or `/save` lines — as one encrypted entry in the **Saved Chats** topic (created on first use with the `comments` icon; `_widgetType: 'saved-chat'`), each turn under a bold "You" / "AI" line (`chatTranscriptHtml` in `chatSave.ts`). Handled locally like other saves; the empty-chat state and `/save` help mention it, and the system prompt tells the model it exists
- `/save <topic> <text>` saves `text` as an encrypted journal entry under that topic — handled locally (never sent to the AI), created with the existing encrypted entries API (**no server endpoint**). Topic matching is case-insensitive, longest name first (so "Shopping List" works unquoted) — `parseSaveCommand` in `client/src/utils/chatSave.ts`. "Journal" is always accepted and created via `getOrCreateJournalTopic` if missing. Works even when AI is off
- The system prompt (`chatSystemPrompt`) lists the user's topic names so the model can suggest a fitting `` `/save Topic text` ``; suggestions render as one-tap chips that fill the input
- Settings → In-App AI shows a readiness line ("Ready — using …" / "Not ready yet — add …" from `missingCredentials`); Test connection is always clickable and says what's missing; a blank model is auto-filled with the first available model, and model IDs from the old Claude-only Bedrock endpoint are cleared on load

**Meals log (nutrition)**
- `/health/food` renders `MealsLogView` (`client/src/views/MealsLogView.tsx`, pieces in `client/src/components/organisms/FoodLog.tsx`): the day as a big thin title ("Saturday, October 17") with an outlined ‹ Today › pill across from it (the label opens a date picker); **Daily totals** (thin Work Sans section heading, an accent **Edit goals** link that scrolls to the goals) over the `DayAtAGlance` strip; **Logged today** — the day's items in an outlined `--bg-panel` table (select a row to edit it in the journal; hover actions Estimate/Delete; Day total row; grey italic = AI) with "Fill N missing with AI" and an outlined **Log a meal** pill in the heading, or, when empty, a dashed box "Nothing logged yet today." + **Log a meal** (opens a new Meals entry in the journal dated that day); **History** — a 7 days / 30 days / 90 days / Year switch (outlined group, chosen on `--bg-active`) over one outlined table (sentence-case column names with the goals muted under them; met values in the accent; Took / Noticed clamp to two lines; select a day to open it) and a "● Goal met" legend; then **Daily nutrition goals**. Tables here have no column rules
- The Health dashboard (`HealthDashboardView`): a **Today** heading with the date across from it, then the nutrient strip (`DayAtAGlance`: one outlined `--bg-panel` strip, a cell per nutrient — name, thin figure + "/ goal unit", 4px rule; also on the Meals log), then `DashPanel`s (Wellness full width; Quick log | Medications side by side on desktop, stacked at `NAV_COMPACT`) (`molecules/DashPanel.tsx`: `--bg-panel`, 12px corners, thin Work Sans title + muted aside): **Wellness check-in** (`WellnessCheckIn title=… quad`, "Not logged yet" / "Logged today"; the four-square `WellnessPanel quad` — Water | Sleep over Mood | Cycle in one outlined 2×2 card with rules between cells, like the home dashboard; formerly the compact panel — Water | Sleep | Mood three across with Cycle under Water (two-up ≤900px, stacked ≤560px by container width), 38px badges (22px icons), 46px mood faces (40px glyphs), 32px figures, 30px −/+, 13px labels, 29px cycle chips, no rules; "Next period est. …" across from Cycle), **Quick log** (`QuickLog` in `HealthQuickLog.tsx`: a Meal | Exercise switch; Meal = "What did you eat?" title, meal chips, date | time | kcal box, AI note, Notes; Exercise = activity chips, date | time | duration box, Notes; **More details** opens the full form in the journal with what's typed via `useNewEntryInJournal`; an outlined accent **Log meal / Log exercise** `PillButton`; blank nutrients/calories are AI-filled), and **Medications** (`MedicationSchedule`: ‹ Today › switcher across from the title, "N of M doses taken" + % over a 4px rule, doses grouped by time — bold time, "2 / 3" and an accent **Take all**, hairline, then rows of round ticks (filled accent with a dark check when taken), the name, and "Taken 1:35 PM" muted on the right) — only when an active med has scheduled times and `medicationEnabled` isn't off
- CSV export guards formula cells (`=`, `+`, `-`, `@`, tab, CR get a leading `'`; `csvCell` in `client/src/utils/csv.ts`) and `parseCsvRow` removes that guard on import, so exports round-trip
- Settings → Data import rows each have a **Download example** link (`client/src/utils/importExamples.ts`: a sample CSV for Import Entries, parsed with `utils/csv.ts`; a sample JSON for Import Daily Log) — the examples are unit-tested against the real parsers
- **Import Daily Log** (Settings → Data, `client/src/components/organisms/DailyLogImport.tsx` + pure mapper `client/src/utils/dailyLogImport.ts`): one-time import of a JSON export of the old "Daily log" artifact (`{ goals, days: { 'YYYY-MM-DD': { entries: { id: { item, type, kcal, iron, vitD, b12, vitC, notes, created } } } } }`). Food/Supplement/Medication → Meals (`mealType` '' / `supplement` / `medication`, nutrients kept as manual values, `consumedDate` = the log day), Symptom → Symptom (`occurredDate`), Note → Journal; goals → `nutritionGoals`. Entries are encrypted in the browser like any other; each carries `metadata._importKey` (`dailylog:<day>:<id>`) so a re-run skips what's already imported. `mealType: 'medication'` rows count in "Took" and are never AI-estimated
- **Meds feed Meals**: Medication entries have **Nutrients per dose** (iron, vitamin D, B12, vitamin C — same keys as food) in `MedicationFields`. Marking a dose taken in the schedule (`MedicationSchedule` → `useDoseToMeals`) adds a Meals row for that day (`mealType: 'medication'`, `metadata._doseLink = "<medId>|<date>|<HH:MM>"`); un-taking deletes it. Per-dose values come from typed fields, else `parseMedNutrients(name, dosage)` (single-nutrient supplements like "Vitamin D3 1,000 IU" → 25 mcg; multis/complexes skipped), else one AI estimate cached on the medication (`doseNutrientSource: 'ai'` + `doseNutrientBasis`). Meds with no nutrients add nothing — `client/src/utils/medNutrients.ts`
- Pure helpers (rows by eaten day = `consumedDate` else creation day, totals, goal checks) in `client/src/utils/foodLog.ts`
- Goals (`nutritionGoals`) are a **master-key-encrypted setting** via `useEncryptedSetting` (`client/src/hooks/useEncryptedSetting.ts` — it loads only once the master key is unlocked, keeps `loaded` false until then and refuses `save` before the stored value was read, so a fresh launch that mounts before a remembered key is restored can't show — or save over — the empty default); the saved-foods (`foodLibrary`) UI was removed
- AI: `estimateFoodNutrition` asks for only the missing nutrients in one request; `nutrientSource` (`'ai' | 'manual'` per nutrient) + `nutritionBasis` mean typed values are never overwritten and AI values refresh when the description/meal type changes. New rows are AI-filled in the background after adding; the Logged table has "Fill N missing with AI" and a per-row "Estimate". Every food save path (Health dashboard quick log, New entry, journal Save) fills blank nutrients via `autoNutritionOnSave`; `FoodFields` shows the nutrient inputs

### Planned
- Recurring calendar events
- Calorie correlation reporting

## Important Implementation Notes

### Entry Pagination
`entriesApi.getAll()` requests `?limit=5000`. Server allows up to 10,000. Do not reduce this — personal journals can easily exceed 100 entries and topic filtering relies on all entries being in the client store.

### Navigation breakpoint
Phones **and tablets** use the mobile top bar + a **drop-down menu sheet** (`MobileChrome`: under the 56px bar, full width, `--bg-app` with 20px bottom corners and `--shadow-xl` over a dimmed page; while open the bar's hairline goes and ☰ becomes × in a faint accent-tinted 44px square. One 48px row per destination — Material icon in the accent + 16px name in `--text-primary`; the current page on the grey `--bg-active` (10px corners), its name 600 in the standard colour (no accent tint or accent text); a hairline, then Settings and Sign out in `--text-muted`; Escape, a row or a tap outside closes it). The rail and the menu share one list (`useNavItems`). Nothing slides sideways; the side rail shows only on wider, non-touch screens. The query is `NAV_COMPACT` in `client/src/styles/breakpoints.ts` (≤1024px, or touch-first `(hover: none) and (pointer: coarse)` up to 1366px) and is used by `Sidebar`, `MobileChrome` and the templates' layout rules. Page layouts keep their own 768px breakpoints. **Phone gutters:** content sits ~24px from the screen edge on phones (≤768px) — `ContentTemplate`'s `Main` adds 8px a side on top of each page's own 16px, and the journal header and calendar month/day panel use 24px directly.

### Typing performance (journal editor)
The journal re-renders on every keystroke (editor content lives in `JournalView` state), so everything beside the editor must stay cheap: `EntryList`, `Sidebar` is `memo`'d (they read their data from the stores), `EntryForm`'s option lists are `useMemo`'d on entries/topics, list titles come from the cached `entryTitleText` (`client/src/utils/entryTitle.ts`) instead of re-sanitizing every entry, and `Editor` skips re-serializing HTML it just emitted. Don't pass fresh inline callbacks/objects to these memoized components.

### Feature Flags
**Defaults for a new account:** dark theme (`uiStore.themeMode: 'dark'`), every feature on — including cycle tracking (`cycleTrackingEnabled: true`) — except the opt-in Finance and Reconcile. Feature flags in `entriesStore.featureFlags` default to `{}` on load. Both `useInitializeData` and `JournalView` build them with `featureFlagsFrom` (`client/src/utils/featureFlags.ts`), which sets all known flags to `true` when not present in settings. The `filterTopics` function uses `featureFlags[flag] !== false` (not `featureFlags[flag]`) so undefined flags are treated as enabled.

### Wellness check-in data
The Health dashboard's Wellness Check-in (`WellnessCheckIn`) uses `_widgetType: 'wellness-checkin'` (no `_taxonomyId` initially) to identify today's entry. On first save it auto-creates a "Wellness" topic and adds `_taxonomyId` so the entry becomes visible in the journal. The widget is fully reactive — display values are derived via `useMemo` from `decryptedEntries`, so journal edits flow back to the dashboard automatically. `doSaveRef` pattern prevents stale closures in the 600ms debounce. On save, the store is scanned directly for today's existing entry before creating a new one, preventing duplicates if the `entryIdRef` is stale.

## Security Hardening

### Content Security Policy (CSP)
Applied via Express middleware (`server/src/middleware/security.ts`):
- `default-src 'self'` — only same-origin
- `script-src 'self'` — no inline scripts
- `style-src 'self' 'unsafe-inline'` — required for styled-components
- `img-src 'self' data: blob:` — images from same origin and data URIs
- `connect-src 'self'` plus Open-Meteo (dashboard weather), Google Calendar, the user's R2 bucket (`*.r2.cloudflarestorage.com` — the account ID is encrypted, so it can't be pinned), and the AI providers (`api.anthropic.com`, `api.openai.com`, and `bedrock`/`bedrock-runtime` hosts for each region in `BEDROCK_REGIONS`, `shared/src/validation/awsRegions.ts` — never `*.amazonaws.com`; AI settings reject unlisted regions)
- `frame-ancestors 'none'` — prevent clickjacking; plus `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`
- Every `/api/*` response is `Cache-Control: no-store` (set in `securityHeaders`; the ICS feed overrides it) so wrapped keys, ciphertext and settings never land in the browser's disk cache
- `Permissions-Policy` keeps `microphone=(self)` (voice dictation); camera, geolocation etc. are off

### Account-change rules
- The wrapped master key + salt are returned only by `/login`, `/login/2fa` and `/me` — never by an unauthenticated lookup (that would allow offline password guessing). There is no `/auth/salt`
- Changing the email (`/change-email`), the recovery key (`/recovery-key`) or turning on 2FA (`/2fa/enable`) requires the **current password**, like change-password and 2FA disable — a signed-in session alone must not be able to lock the owner out
- Google OAuth: the signed `state` also carries the hash of a nonce kept in an HttpOnly `SameSite=Lax` cookie (`__Host-chronicle_oauth`), so the callback only succeeds in the browser that started the flow
- `trust proxy` is on in production (`TRUST_PROXY`, default 1 hop) so per-IP rate limits see the real client IP behind Render's proxy
- Sign-in has a per-email cap on top of the per-IP limit: 10 wrong passwords lock that email for 15 minutes (in memory, keyed by the normalized email whether or not an account exists, so a lockout reveals nothing). A browser that has signed in to that email carries a signed HttpOnly **known-device** cookie (`__Host-chronicle_device`, 90 days, HMAC of email + nonce) and counts its failures in its own bucket, so a stranger's guesses can't lock the owner out of their own browser — the password and 2FA are still checked
- Public share links hold plaintext: revoking one **deletes** the row, deleting an entry deletes its shares (`deleteSharesForEntry`), and revoked/expired rows are purged at startup and every 6 hours (`purgeDeadShares`)
- `DELETE /api/auth/account` deletes the account (tenant schema dropped, then the account row; sessions, shares and the calendar integration cascade). Needs the password, plus a 2FA code when 2FA is on. Settings → Account → Delete account (inline confirmation). Images in the user's R2 bucket and events already pushed to Google Calendar are not touched
- Recovery decoys use `SECRETS_ENCRYPTION_KEY`, else an HMAC of `DATABASE_URL`, so they stay stable across restarts
- Account enumeration: `/recovery-params` answers an unknown email with **stable** decoy params (HMAC of the email, same sizes as real ones) — never random-per-request. Sign-up must say an email is taken (no email verification), so `/register` has its own `registerLimiter` (10/hour per IP)

### Rate limiting
- `apiLimiter` (`server/src/middleware/rateLimiter.ts`): 1500 requests / 15 min **per account** on data routes (auth routes have their own stricter limiters; `strictLimiter` — 5 / 15 min — counts each route separately, so typos on one action don't block another). It must stay well above normal SPA use plus bulk actions (imports, bulk edits, dose → Meals sync) — 300 locked real users out
- Client: identical in-flight GETs share one request (`request` in `services/api.ts`; followers get a `structuredClone`). A 429's `Retry-After` is carried on `ApiError.retryAfterSec`; initial loads (`useInitializeData`, `JournalView`) retry with `retryDelayMs` — Retry-After on 429 (5s–15min), else 10s→60s backoff — and never fall back to an empty journal

### CSRF Protection
- Web requests require `X-Requested-With: XMLHttpRequest` header
- Mobile requests use `Authorization: Bearer` (no CSRF risk)
- Explicit branching in auth middleware — never mixed

### Password Strength
- Minimum 12 characters
- Uppercase, lowercase, number required
- Validated on the client with `passwordSchema` (`shared/src/validation/schemas.ts`) — the server never sees the password, so it can't

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
- Colors derived programmatically: hover (15% darker), tint (10% opacity), stroke (desaturated muted variant for borders)

### Default Colors
- Default header: `#2d2c2a` (dark)
- Default accent: **Teal** `#34a5a2` — always the default (`DEFAULT_ACCENT_COLOR` in `client/src/styles/accent.ts`); accounts with no saved accent get Teal, and every accent fallback uses it
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
