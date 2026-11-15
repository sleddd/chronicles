# Sign-in, unlock and trusted devices: redesign plan

Status: built 2026-11-15 (all five phases, in the working tree, not committed or deployed). Written after the audit of Remember me, Lock and sign in/out. The decisions in section 10 were confirmed as written. Section 11 lists where the build differs from this plan and what is still to check by hand.

## 1. What changes, in one page

| Today | After |
|---|---|
| **Lock** empties one tab's memory. The session stays alive and the server doesn't know. | **No lock.** A tab either holds the key and is signed in, or it shows sign-in. Idle time ends the session. |
| **Remember me** keeps the wrapped master key in localStorage and its secret on the server. It skips the password. | **Remember this browser** skips only the 2FA code for 30 days. It stores no key and never skips the password. |
| Unlock is a typed password, on every reload unless remembered. | **Passkey**: one touch signs in and opens the key. The password stays as the fallback. |
| `/me` returns the wrapped master key to any live session. | The wrap is returned only after a password or passkey was verified. |
| Switching tabs locks at once and drops drafts outside the journal editor. | No tab-switch lock. Drafts are sealed and offered back after the next sign-in. |

### Rules that must hold when this is done

1. The master key exists only as a non-extractable `CryptoKey` in memory. Nothing in the browser's storage, and nothing on the server, can produce it without the password, the recovery key or a passkey touch.
2. The wrapped master key leaves the server only in the answer to a verified password or a verified passkey.
3. Remember this browser changes one thing: whether a 2FA code is asked for at sign-in.
4. Losing a device never locks anyone out. Password and recovery key always work.

### Not in this plan

- Rotating the master key (re-encrypting everything). Worth doing later, since one exposure of the key is permanent today.
- Passkeys on authenticators without the PRF extension (see 3.2).
- Removing the password altogether.

## 2. Audit findings and where each is fixed

| # | Finding | Fixed by |
|---|---|---|
| 1 | A stolen or locked session gets the wrapped key from `/me`, then guesses the password offline | Phase 2 (4.3) |
| 2 | With Remember me, stolen cookies plus the localStorage blob give the master key with no password | Phase 2 (4.2) |
| 3 | A locked tab's session can still call every data route | Phase 2 (4.1, 4.4). Reduced, not removed: see 4.4 |
| 4 | Lock drops anything typed outside the journal editor | Phase 2 (4.6) |
| 5 | Tab switch locks at once, pushing people to Remember me | Phase 2 (4.5) |
| 6 | The 15-minute idle timer pauses while a laptop sleeps | Phase 2 (4.5) |
| 7 | A phone's file picker can hide the page and lock mid-upload | Phase 2 (4.5) |
| 8 | Session expiry wipes unsaved journal writing | Phase 2 (4.6) |
| 9 | A password change silently ends Remember me | Phase 2 (old feature removed), Phase 3 (6.4, stated behaviour) |
| 10 | "Until you close your browser" isn't true on many browsers | Phase 2 (old feature removed) |
| 11 | Reads of the device secret aren't logged | Phase 2 (removed). Phase 3 logs every trust use |
| 12 | A locked tab keeps its session alive in the background | Phase 2 (4.4) |
| 13 | A failed offline sign-out can sign the last person back in when storage is blocked | Phase 5 (8.2) |

## 3. Phase 1: passkeys (sign in and open the key with one touch)

Built first, beside everything that exists today, so nobody loses Remember me before its replacement is there.

### 3.1 How it works

A passkey with the PRF extension returns a 32-byte secret, the same each time for that passkey, and only after the fingerprint, face or device PIN check. That secret wraps the master key, as the password and the recovery key do. The server stores one more wrap per passkey and a public key. It can open neither.

Sign-in is one ceremony:

1. The page asks the server for a challenge (`POST /api/auth/passkey/options`, public, `authLimiter`). No email is sent. The request lists no credentials, so the answer says nothing about who has an account.
2. The browser shows its passkey sheet. The request carries the PRF input (a fixed app constant, `chronicles:passkey-prf:v1`; each passkey's own secret makes the output unique).
3. The page posts the signed answer (`POST /api/auth/passkey/verify`). The server checks the signature, the challenge (single use, 5 minutes, in `sharedState`), the origin, and that the user was verified. It finds the account from the passkey's user handle, creates the session, and returns that passkey's wrap.
4. The page derives a wrapping key from the PRF output (HKDF-SHA256, info `chronicles:passkey-wrap:v1`), unwraps the master key as non-extractable, and zeroes the PRF bytes.

A passkey sign-in counts as both factors. No 2FA code is asked.

### 3.2 Adding a passkey (Settings → Security → Passkeys)

1. Ask for the current password. It is needed anyway: making a new wrap needs an extractable copy of the key for a moment, which only the password or recovery key can produce (the same path the recovery key uses today). With 2FA on, also the code (`secondFactorGate`).
2. Create the passkey. Many authenticators only say "PRF supported" at creation and return the secret on first use, so the page follows with one sign-in ceremony to get it. That is two touches, once.
3. Wrap the master key, post the public key and the wrap.

**If the authenticator has no PRF support, the passkey is not saved**, with a plain note that this device can't open the journal. A passkey that could sign in but not unlock would land people on a password prompt anyway.

The list shows each passkey's name (editable), when it was added, when it was last used and whether it syncs. Remove asks for the password.

**Wording on every password-confirmed screen** (add or remove a passkey, change password or email, new recovery key, 2FA on or off, delete account): the field is labelled **"Enter your account password"**, never just "Confirm". Someone who signed in with a touch would otherwise wait for a passkey sheet that isn't coming. Until Phase 4, a line under it says "Your passkey can't confirm this yet." 

### 3.3 Server

- **Table** `passkeys` (Prisma, public schema): `id`, `account_id` (FK, cascade), `credential_id` (unique), `public_key`, `sign_count`, `transports`, `backed_up`, `name`, `wrapped_mk`, `wrap_iv`, `created_at`, `last_used_at`. At most 10 per account.
- **Account column** `webauthn_user_id`: 32 random bytes, made on first use. Never the account id or email.
- **Library**: `@simplewebauthn/server`, pinned, for verifying registrations and assertions. The browser side uses the platform API directly.
- **Config**: `WEBAUTHN_RP_ID` (the site's domain) and the allowed origin from `APP_URL`. A passkey is tied to that domain for good, so it must be the production domain from day one.
- **Routes**: `passkey/options`, `passkey/verify` (public, rate limited, counted like sign-in), and under `authMiddleware` + `confirmGate`: `passkeys` list, `passkeys/register/options`, `passkeys/register/verify`, rename, delete.
- **After verify**, the same re-check sign-in does today (`sessionStillEarned`): a passkey removed during the request must not leave a session behind.
- **Permissions-Policy** gains `publickey-credentials-get=(self), publickey-credentials-create=(self)`.
- **Security log**: passkey added, removed, used, failed.

### 3.4 Shared crypto

- `WrapPurpose` gains `passkey-wrap`. The AAD also carries the credential id, so one passkey's wrap can't be filed under another.
- `derivePasskeyKek(prfOutput)`, `wrapForPasskey`, `unwrapFromPasskey` (non-extractable result, no fallback form).
- The wrapped blob is checked like the others: strict base64, 12-byte IV.

### 3.5 Client

- **Sign-in page**: a "Sign in with a passkey" button above the password form, shown only where the browser reports PRF support. The password form is unchanged.
- **Unlock dialog** (while it still exists in Phase 1): the same button, so a passkey also replaces the typed password there.
- **Settings → Security**: the Passkeys group, built from `SettingsGroup` rows.
- `EncryptionContext` gains `unlockWithPasskey`. It installs the key the same way `unlock` does.

### 3.6 What stays the same

- A password change or recovery leaves passkeys working. The master key doesn't change, so their wraps stay valid.
- Recovery and Settings both offer "Remove all passkeys", for the case where a device was lost.
- Account deletion removes them (cascade).
- Sensitive actions (change password or email, new recovery key, 2FA on or off, delete account) still need the typed password, asked for in those words (3.2). Confirming them with a passkey is Phase 4.

### 3.7 Safari key handoff: tested now, used in Phase 2

Phase 2 lets a new tab take the key from an open one (4.4). Whether Safari allows it decides what its users get, so it is tested here, while `EncryptionContext` is being changed, not after the lock is gone.

- A small test page and a real-browser check: one tab holds a non-extractable `CryptoKey`, a second asks over `BroadcastChannel`, receives it and decrypts with it. Also that the Web Lock query sees the holder.
- Run in Safari on macOS, Safari on iOS, the installed app on iOS, Chrome and Firefox.
- The result is written into 4.4 before Phase 2 starts: handoff everywhere, or handoff with a touch-or-password fallback named per browser.
- Nothing in Phase 1 depends on it. No handoff code ships until Phase 2.

**Result (2026-11-15, `loadtest/key-handoff-check/`, real browsers on macOS):**

| Browser | Key passed between tabs | Still non-extractable | Web Locks |
|---|---|---|---|
| Safari 26.5 | Yes | Yes | **Not available** |
| Chrome 157 | Yes | Yes | Yes |
| Firefox 160 | Yes | Yes | Yes |

Safari handed the key over but had no Web Locks, so 4.4's "is there a holder" check can't rely on them. Where they are missing, a new tab asks "who is here?" over the channel and takes 800 ms of silence as nobody (Safari answered in about 260 ms from a background tab). Safari on iOS and the installed iOS app were not checked: that needs the deployed https site on a device.

### 3.8 Checks before it ships

- Real-browser runs with a virtual authenticator in Chromium and WebKit: add, sign in, reload, remove, PRF missing.
- By hand: Touch ID (Safari and Chrome on macOS), Face ID (iOS, including the installed app), Android, Windows Hello, a hardware key, 1Password.
- Browser support for PRF should be re-checked at build time. Coverage has been changing.
- Privacy policy: add that a passkey's public key and one more wrapped copy of the key are stored. Bump its version.

## 4. Phase 2: remove Lock and the stored-key Remember me

### 4.1 One state

A tab holds the key and is signed in, or it shows the sign-in page. There is no unlock dialog and no "signed in but locked".

- The Lock items (nav ⋯ menu, phone menu, the AI chat's adults-only screen) become **Sign out**.
- `UnlockDialog` and its use in 25 views, `needsUnlock`, `isRestoring` and the lock branches in every view go.

### 4.2 Delete the stored key

Removed entirely: `rememberDevice.ts`, the `RememberMe` checkbox on the password form, `/api/auth/remember/*`, `rememberGrants.ts`, the `remember_grants` table, the unlock cookie, `unwrapMasterKeyForDevice`, `unwrapFromDevice` and the `device-wrap` purpose. The new client deletes any `chronicles.remember.v1` it finds.

### 4.3 The wrap only after proof

- `/me` returns the user only. No salt, no wrapped key, no recovery wrap.
- The wrap comes back from `/login`, `/login/2fa`, `/recover` and `passkey/verify`, as now.
- Settings needs the password wrap to change the password or make a recovery key in a tab that signed in by passkey. New `POST /api/auth/key-wrap`, which takes `currentAuthSecret`, counts against the confirm lockout, and returns it.

**Rollout**: the app updates on a prompt, so old tabs can run for days. The server keeps answering `/me` in the old shape for one release, then drops it. An old tab then gets the standard "Update Chronicles" answer.

### 4.4 Opening the app, new tabs and reloads

A page that loads without the key:

1. **Asks the other tabs.** A non-extractable `CryptoKey` can be passed between same-origin tabs. Tabs that hold the key keep a Web Lock (`chronicles-key`), so a new tab knows at once whether one exists, with no timing guess. If one does, it asks over the existing `chronicles-auth` channel and gets the key. A new tab then opens with no prompt, as it does today under Remember me.
2. **If no tab holds it**, the old session is of no use to anyone. The page ends it (`/auth/logout`, keeping the cache, see 4.7) and shows sign-in. One passkey touch, or the password.

Safari, Chrome and Firefox all pass a `CryptoKey` between tabs (3.7). Safari had no Web Locks, so there the new tab asks "who is here?" over the channel instead. Where a holder exists but can't hand the key over, a new tab asks for a touch or the password and shares the browser's session.

This closes most of finding 3. What remains: between closing the last tab and the next visit, the session cookie on disk is still good until the server's idle expiry. It can fetch ciphertext and delete things, but it can no longer fetch the wrap. To narrow it:

- Session idle expiry drops from 24 hours to 2 hours.
- Only requests sent because of something the person did count as activity. Background polling no longer keeps a session alive (finding 12).

### 4.5 Idle sign-out

Replaces the idle lock and the tab-switch lock.

- **15 minutes** with no activity in any Chronicles tab. The last-activity time is shared across tabs, so reading in one tab doesn't sign out another.
- Measured by the clock, not a timer. Checked every 30 seconds and on wake, focus and the page becoming visible, so a laptop reopened after hours signs out before anything shows.
- Switching tabs does nothing by itself. The file picker and camera on phones no longer end anything.
- At the limit: save what can be saved (4.6), end the session, show sign-in with "You were signed out after 15 minutes away."

### 4.6 Drafts survive

Every way a session can end (idle, expiry on the server, a reload, a crash) may catch unsaved writing.

- **Existing entries** already autosave after 3 seconds. Idle sign-out waits for the save queue to finish first.
- **New, unsaved writing** in the journal editor and the Quick entry is sealed with the master key as it's typed (a few seconds after the last keystroke) into IndexedDB, bound to the account. After the next sign-in by the same account, the form offers "Restore your unsaved entry", with Discard.
- A draft is deleted when its entry is saved, when it's discarded, on an explicit Sign out, and after 7 days.
- Only ciphertext is stored. Without the key it opens nothing.

Other forms (bill editor, topic editor, Settings) are short and are not covered in this phase.

### 4.7 Keep the encrypted cache for the same person

Today every sign-in wipes the browser first, so each one re-downloads the journal. With sign-in on every cold start, that has to change without weakening the switch between people.

- The browser remembers whose cache it holds as the opaque `scope` the server already gives. Never the email.
- **Idle, reload or cold start**: memory and session storage are cleared. The ciphertext cache, the service worker and per-browser preferences stay.
- **After sign-in**: if the account's scope differs from the stored one, everything is wiped as today, before any data loads.
- **Pressing Sign out**: the full wipe, as today.
- `useFreshSignIn` becomes "clear memory now, wipe the rest if a different person signs in".

## 5. Phase 2 in the interface

- **Sign-in page**: passkey button, then email and password. No Remember me box here.
- **2FA code screen**: gains the "Don't ask for a code on this browser for 30 days" box (Phase 3).
- **Settings → Security**: Passkeys, Two-factor authentication, Password, Recovery key, Active sessions, Trusted browsers (Phase 3). "This browser · Forget" goes.
- **Welcome tour and Getting started**: mention adding a passkey beside keeping the recovery key safe.

## 6. Phase 3: Remember this browser (skip the 2FA code)

Only for accounts with 2FA on, and only on the password path. Passkey sign-ins never ask for a code.

### 6.1 What it does

After a correct password, the server looks for a valid trust token for that account. If there is one, it issues the session without asking for a code. Otherwise the code screen shows as today.

### 6.2 Issue

- Only after a correct password and a correct authenticator code in the same sign-in, with the box ticked. Not after a backup code.
- 30 days from issue. Use does not extend it.
- Cookie `__Host-chronicle_trust`: HttpOnly, Secure, SameSite=Strict. The value is 32 random bytes.

### 6.3 Check

- Looked at only after the password has verified, so a wrong password learns nothing about the token.
- Must match the account that is signing in, by hash, unexpired.
- Each use is logged and updates "last used".

### 6.4 End

- Forget, per browser, in Settings → Security → Trusted browsers (browser and system, added, last used).
- Sign out everywhere.
- A password change or recovery.
- Turning 2FA on or off.
- Pressing Sign out in that browser.
- Not ended by idle sign-out, a reload or closing the browser.

### 6.5 Server

- **Table** `trusted_devices` (Prisma, public schema): `id`, `account_id` (FK, cascade), `token_hash` (SHA-256), `label`, `created_at`, `expires_at`, `last_used_at`. At most 10 per account, oldest dropped. Expired rows purged with the 6-hourly jobs.
- `/login` and `/login/2fa` change as above. `/login/2fa` takes `trustBrowser: true`.
- The existing known-device cookie is unchanged. It only decides which lockout bucket wrong guesses count in.

### 6.6 Never

- Never skips the password or the key derivation.
- Never skips the confirmation on sensitive actions.
- Never stores the key, a wrap or the password.

Privacy policy: one line on the trusted-browser record. Bump its version.

## 7. Phase 4: confirm sensitive actions with a passkey

A fast follow, straight after Phase 3. Kept out of Phase 1 so the first build stays small.

### 7.1 What it does

On every screen that asks "Enter your account password", an account with a passkey also gets **Use a passkey**. One touch then stands in for the password and the 2FA code together.

It can, because the touch does both jobs the password does there:

- **Proof to the server.** The server issues a challenge tied to that one action and that session, single use, 5 minutes. A challenge made for "delete account" can't confirm "change password".
- **The key.** The touch opens that passkey's wrap, which gives the extractable copy that a new password wrap, a new recovery key or another passkey's wrap needs.

### 7.2 Which actions

| Action | Passkey can confirm | Note |
|---|---|---|
| Change password | Yes | The old password is no longer needed, only the new one |
| New recovery key | Yes | |
| Add or remove a passkey | Yes | Removing the one just used asks twice |
| Turn 2FA on or off | Yes | |
| Delete account | Yes | |
| Change email | No | The sign-in secret is derived from the password and the email together, so the password has to be typed |

### 7.3 Server

- `confirmGate` and `secondFactorGate` accept either `currentAuthSecret` (plus a code when 2FA is on) or a passkey assertion for an action-bound challenge.
- `POST /api/auth/confirm/options` issues that challenge. It takes the action's name and is tied to the session.
- Failed assertions count in the same per-session confirm lockout as wrong passwords.
- User verification is required, as at sign-in.

### 7.4 Client

- The confirm forms gain the **Use a passkey** button above the password field. The field keeps its "Enter your account password" label, and the Phase 1 line "Your passkey can't confirm this yet." goes.
- `EncryptionContext` gains the passkey versions of the re-wrap helpers (`rewrapMasterKey`, `generateRecoveryKey`).
- Change email shows only the password field, with "Changing your email needs your password."

### 7.5 What this means for security

A passkey alone can then change the password. That adds no new power: a passkey already signs in and opens the key. It does mean a lost, unlocked device with a passkey is a full takeover until the passkey is removed, which is why Recovery and Settings both offer "Remove all passkeys" from Phase 1.

## 8. Phase 5: clean-up and hardening

1. **Sessions list**: show how each session signed in (password, passkey, trusted browser).
2. **Pending sign-out**: when the flag can't be saved (storage blocked), the page still ends the session on its next load, since a keyless page with no other tab now does that anyway (4.4). Add a test for it.
3. **Drop** the `remember_grants` table and the `/me` compatibility shape after one release.
4. **`migrate:phase2-status`**: add counts of accounts with passkeys and trusted browsers. Nothing to migrate.
5. **CLAUDE.md**: rewrite the Remember me, Key Storage Security, Two-Layer Security Model and Switching people sections.
6. **Tests**: remove the remember and unlock-dialog suites. Add passkey routes, passkey confirmation, trust routes, idle sign-out by the clock, draft seal and restore, cache kept for the same scope and wiped for another, key handoff between tabs.
7. **`loadtest/multi-instance-check.mjs`**: passkey challenges and trust tokens across two instances.

## 9. Order and size

| Phase | Ships alone | Rough size |
|---|---|---|
| 1. Passkeys, plus the Safari handoff test | Yes. Adds a faster way in, changes nothing else | Largest: new table, routes, crypto, Settings, sign-in |
| 2. Remove Lock and Remember me | Yes, once 1 is out | Large, mostly deletion, plus drafts, idle sign-out and the cache rule |
| 3. Remember this browser | Yes | Small |
| 4. Confirm with a passkey | Yes, straight after 3 | Medium |
| 5. Clean-up | After 2 has been out for a release | Small |

Phase 2 without Phase 1 means a typed password on every cold start for everyone. That is why passkeys go first.

## 10. Decisions (confirmed 2026-11-15)

| Decision | Choice |
|---|---|
| Idle sign-out time | 15 minutes, shared across tabs |
| Server session idle expiry | 2 hours, down from 24 |
| Passkeys without PRF | Not accepted |
| Passing the key to a new tab | Yes, where the Phase 1 Safari test passes (3.7). Fallback elsewhere |
| Trust after a backup code | No |
| Trust length | 30 days, fixed |
| Sealed drafts | Journal editor and Quick entry only |
| Passkey confirming sensitive actions | Phase 4, straight after Phase 3. Password and code until then |

## 11. As built: differences from this plan, and what is left

### Differences

| Plan | Built | Why |
|---|---|---|
| `passkeys` and `trusted_devices` as Prisma models, plus an `accounts.webauthn_user_id` column | Plain tables made at startup (`db/passkeyQueries.ts`, `db/trustedDeviceQueries.ts`). No account column: the user handle is an HMAC of the account id | The repo has no Prisma migrations. Every other added table is made this way, and nothing has to be run by hand on deploy |
| `POST /api/auth/key-wrap` | `POST /api/auth/password-wrap` | A test guards that the old `/key-wrap` upgrade route stays gone |
| `/me` keeps the old shape for one release | `/me` never returns the wrap unless `LEGACY_ME_KEY_WRAP=true` is set | Off by default closes finding 1 at once. Set the flag for the first deploy if tabs running the old app may be open, then remove it |
| Unlock dialog gains a passkey button during Phase 1 | Not built | All phases were built together, so the dialog was removed outright |
| "Your passkey can't confirm this yet" line until Phase 4 | Not shown | Phase 4 shipped with the rest |
| Session expiry keeps the cache, a revoked session wipes the browser | Both keep what the browser stores | It is ciphertext only and no wrap of the key is stored in the browser, so it opens nothing. Wiping it would also lose the sealed draft of whatever was being written |
| "Only requests the person caused count as activity" | Not built | A tab ends its own session after 15 minutes away, so an idle tab can't keep one alive. The server's 2-hour limit covers sessions nobody is using. The app pings while someone is at the page so reading for an afternoon doesn't end it |
| Web Locks tell a new tab whether a holder exists | Web Locks where present, a "who is here?" message where not | Safari had none (3.7) |
| Passkey confirmation for 2FA on/off, delete account | Built. Turning 2FA off with a passkey needs no code | The touch stands in for both |
| Sessions list shows how each signed in | Built, stored in the session's `deviceInfo` | |

### Changed after an independent review of the build

A second reviewer read the finished code. It found no way to sign in, confirm an action, add a passkey or get a wrap without a verified password or passkey. It did find these, all fixed:

| Found | Fix |
|---|---|
| A tab idle past the limit (a laptop just woken) still handed its key to a new tab, and the new tab then reset the idle clock for both | A tab asked for the key refuses once the browser is idle. Taking the key from another tab no longer counts as activity. The idle check also runs when a page is hidden, and every 10 seconds |
| `/password-wrap` gave the wrap for a password alone on a 2FA account (as 4.3 was written) | It now needs the code too, for one named action, and answers with a single-use token for that action. Only the password wrap is returned, never the recovery wrap |
| A tab kept the password wrap it signed in with, which went stale when the password was changed in another tab | No tab keeps a wrap. It is fetched each time it is needed |
| A draft stayed stored when its entry was saved and the page was left within two seconds, so a saved entry was offered back as unsaved | A form that goes away settles its draft at once. The Quick entry also clears it on save |
| New writing wasn't sealed while an older draft was still on offer | The new writing is sealed with the older draft kept beside it, and both are offered in turn |
| A draft was deleted if the key left the tab while it was being read | It is deleted only when the cipher itself refuses it |
| Dictating for 15 minutes counted as being away | Dictated words count as activity |
| Email change and a new recovery key left trusted browsers in place | Both now end every trust |
| Removing a passkey left sessions its device had already made | Removing a passkey signs out every other session |
| Leaving the 2FA code screen kept this tab marked as signing in | It lets go |

### Added after the plan

- **A passkey step at sign-up.** After the recovery key, where the browser can use a passkey, a new account is offered "Add a passkey" or "Not now". The password just chosen confirms it, so nothing is typed again.
- **The passkey button sits under Sign in** on the sign-in page, after an "or".

### Still to do by hand

1. **Set `APP_URL`** (or `WEBAUTHN_RP_ID`) to the production address before anyone adds a passkey. A passkey is tied to that domain for good.
2. **Passkeys on real devices.** Server-side verification is tested end to end with a software authenticator, and the browser code against mocked browser APIs. No real authenticator was used. Check Touch ID (Safari and Chrome), Face ID on iOS including the installed app, Android, Windows Hello, a hardware key and 1Password.
3. **Key handoff on iOS.** Open the deployed app in a second tab on an iPhone and see that it opens with no prompt.
4. **`loadtest/multi-instance-check.mjs`** has new sections for trusted browsers and passkeys. They were written but not run (they need two instances and a database). Set `LOADTEST_ORIGIN` to the origin the instances expect.
5. **The privacy policy's version** was bumped to 2026-11-15, so everyone is asked to review it at their next sign-in. `LEGAL_DETAILS.effectiveDate` was left alone.
6. **Master key rotation** is still not built (section 1).

