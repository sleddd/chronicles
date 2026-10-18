# Text to Journal — Implementation Plan

**Status:** Proposed (not started)
**Scope:** Send a text message (SMS, and later MMS / email / the share sheet) and have it show up as a journal entry, without breaking the zero-knowledge promise for anything that sits on the server.

## The core problem

Every other way into Chronicles encrypts in the browser with the master key. A text message arrives through a carrier and an SMS provider (Twilio or similar) and reaches the **server** in plaintext, while the master key is only in an unlocked browser. The server can never hold the master key, so it can't write a normal entry.

The way through is a **sealed inbox**: the server gets a *public* key that only encrypts. Each incoming text is sealed with it as soon as it arrives, the plaintext is dropped, and only the user's unlocked browser (which holds the matching private key, wrapped by the master key) can open it and turn it into a real entry.

What this does and doesn't protect, said plainly to the user in Settings:

- **Protected:** everything at rest. A database leak, a backup, or a later server compromise shows only sealed blobs. The server can't read old texts.
- **Not protected:** the carrier and the SMS provider see the message, and the Chronicles server holds the plaintext in memory for the moment it takes to seal it. SMS is not end-to-end encrypted, and nothing on our side can change that.

So it's **opt-in, off by default** (like Finance), with that disclosure next to the switch.

## Phase 0 — zero-knowledge alternative (do this first, it's cheap)

**Share to Chronicles** (Web Share Target API in the PWA manifest + iOS Shortcut "Open URL"): share or type text from any app, Chronicles opens, and the text is dropped into a new journal entry in the browser, encrypted like any other entry. Nothing extra goes through the server. It covers a lot of the "quick capture from my phone" need with no new trust trade-off, and it shares the routing parser below.

- `manifest.webmanifest`: `share_target` → `GET /journal/new?text=…&title=…`
- `JournalView` reads the query once, presets the new entry (`useNewEntryInJournal`-style state), and strips the query from the URL with `replace`
- If the app is locked, the text waits in memory (never `localStorage`) until unlock

## Phase 1 — sealed inbox keys (shared + client)

**Key pair:** ECDH P-256 (Web Crypto supports it everywhere, including Node's `webcrypto`). Created when the user turns the feature on.

- `shared/src/crypto/primitives.ts`: `generateInboxKeyPair()`, `sealForInbox(publicKey, bytes)` (ECIES: ephemeral ECDH key → HKDF-SHA256 → AES-256-GCM, AAD `chronicles:inbox:v1:<itemId>`), `openInbox(privateKey, sealed)`
- The private key is wrapped with the master key (new `WrapPurpose` `'inbox-wrap'`) and stored as the `inboxKey` setting; on unlock it's unwrapped into a **non-extractable** key, the same way as the master key (`rederive…` from `EncryptionContext`, cleared on lock)
- The raw public key (65 bytes) goes to the server: `PUT /api/inbox/key`
- Rotating = turning the feature off and on: a new pair, and the old public key is deleted

## Phase 2 — linking a phone number (server)

- Settings → Text to journal → enter a number → `POST /api/inbox/phone` sends a 6-digit code by SMS → `POST /api/inbox/phone/verify`
- The account stores **`phoneHash` = HMAC-SHA256(`SECRETS_ENCRYPTION_KEY`, E.164 number)**, never the number itself, so a leaked DB doesn't list users' phone numbers. The inbound webhook looks up by the same HMAC
- One number per account, one account per number (unique index on `phoneHash`)
- Settings shows only the last two digits (kept in the encrypted settings blob, client side)
- Verify-code attempts use `strictLimiter`; codes live in memory with a 10-minute TTL, like 2FA pending tokens

**Prisma (`accounts`):** `inboxPublicKey Bytes?`, `inboxPhoneHash String? @unique`, `inboxEnabled Boolean @default(false)`

## Phase 3 — the inbound webhook (server)

`POST /api/inbox/sms` (`server/src/routes/inbox.ts`), outside `authMiddleware` and the CSRF check, like the ICS feed:

1. **Verify the provider signature** (`X-Twilio-Signature`, HMAC-SHA1 over the URL + params with `TWILIO_AUTH_TOKEN`). Bad signature → 403, and nothing is logged
2. HMAC the `From` number → find the account. Unknown number or feature off → same empty `200 <Response/>` (no enumeration)
3. Limit: 2,000 characters, 60 texts/hour per account (`inboxLimiter`)
4. `sealForInbox(account.inboxPublicKey, JSON { text, receivedAt })` → insert into the tenant's `inbox_items` → drop the plaintext. **Never log the body** (add the route to the logger's redact list)
5. Reply with a fixed "Saved to your Chronicles inbox." — never an echo of the text

**Tenant table** (`generateTenantSchemaStatements` + JIT `ensureInboxTable`, like finance):

```sql
inbox_items (id uuid PK, sealed bytea, ephemeral_pub bytea, iv bytea, received_at timestamptz)
```

Rows are deleted as soon as the browser imports them; unimported ones are purged after 30 days (`purgeOldInbox`, run with `purgeDeadShares`).

**Spoofing:** caller ID can be faked on some routes. Optional **PIN prefix** setting (e.g. texts must start with `4821 `), checked server side against a bcrypt hash and removed before sealing. Worst case without it: someone who knows your number and spoofs it adds a junk entry; they can never *read* anything.

## Phase 4 — importing in the browser (client)

`client/src/hooks/useInboxImport.ts`, run once after `useInitializeData` finishes and again on `visibilitychange` (like dose sync):

1. `GET /api/inbox` → sealed items
2. `openInbox` each one → `{ text, receivedAt }`
3. Route it (below) → `prepareEntryForSave` → `createEntry` (normal master-key encryption, bound content/metadata AAD), with `metadata._importKey = 'inbox:<itemId>'` and the entry dated `receivedAt`
4. `DELETE /api/inbox/:id` only after the entry saved. A crash between steps 3 and 4 is safe: the next run sees the `_importKey` and just deletes the item (same idempotency as `DailyLogImport`)
5. A toast: "2 texts added to your journal"

**Routing** — reuse `parseSaveCommand` from `utils/chatSave.ts` without the `/save` part, via a small `parseTextRoute(text, topics)`:

- `Meals oatmeal and coffee` → Meals entry (and `autoNutritionOnSave` when AI is on, as `/save Meals` does)
- `Shopping eggs, milk` → adds items to the newest open shopping list
- `Priority call the vet` → adds to today's priorities
- anything else → Journal (`getOrCreateJournalTopic`)

Topic matching stays case-insensitive, longest name first, so it behaves exactly like the chat. All of this runs client side — the server never learns which topic a text went to.

## Phase 5 — Settings UI

A `CollapsibleCard` "Text to journal" under Settings, built from `FormField` / `outlinedInputs`:

- A switch (adds `textToJournalEnabled` to `OPT_IN_FEATURE_FLAGS`) plus the privacy note above, in full
- Phone number field → "Send code" → code field → "Verify"; then "Linked: •••• 42" with **Unlink**
- Optional PIN, a "Messages waiting: N" line, and the number to text with a "Copy" button
- Examples of routing words, generated from the user's own topic names

## Later phases

- **MMS photos:** seal each image with the inbox key into `inbox_items` (bytea, capped at ~5 MB); the browser opens it and moves it into R2 through the existing image pipeline (`processImage` → `encryptBytes` → R2 PUT). Only when Entry Images is set up; otherwise the text is saved and the photo dropped, with a note
- **Email to journal:** a per-user random address (`j-<random>@in.chronicles…`) through an inbound-mail webhook (Postmark/SES), into the same sealed inbox. Same trade-off as SMS
- **Voice memos:** text-to-speech is out; speech-to-text through the user's own AI provider would happen client side after import

## Costs and setup

- One SMS number (Twilio ~$1–2/month plus ~$0.008 per message each way). In the US, application-to-person texting needs **A2P 10DLC** or **toll-free verification** registration before carriers will deliver — budget a couple of weeks for approval
- Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`; `SECRETS_ENCRYPTION_KEY` becomes required when the feature is on
- STOP / HELP keywords are handled by the provider; a STOP also sets `inboxEnabled = false`

## Tests

- shared: seal → open round-trip; wrong key / tampered AAD / swapped item id all fail
- server: bad signature → 403; unknown number → empty 200 with no row; body never in logs; rate limit; purge
- client: `parseTextRoute` table tests (multi-word topics, "Mealsy" not matching "Meals", empty text); import idempotency (entry exists → only delete); locked app → nothing imported until unlock

## Order to build

Phase 0 (share target) ships on its own. Then 1 → 2 → 3 → 4 → 5 as one opt-in feature behind `textToJournalEnabled`, with MMS and email after it has been used for a while.
