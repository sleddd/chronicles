# Health Data Compliance — internal records

Started Oct 18, 2026, from the Chronicles Health Data Compliance Pack. Part 1 (the policy) and the Terms are
published in the app at `/health-privacy` and `/terms`
(`client/src/views/HealthPrivacyView.tsx`, `TermsView.tsx`). Placeholders live in one place,
`shared/src/legal/index.ts` (`LEGAL_DETAILS`). Bump `LEGAL_VERSIONS` when either text changes in a way that
matters, and everyone is asked to agree again. This is a working draft, not legal advice: a privacy attorney
should read the policy, the Terms and part 4 before they go live.

## Status

| Item | Status | Where |
| --- | --- | --- |
| Health policy published (in app) | Done; placeholders to fill | `/health-privacy` |
| Terms with risk notice and image rules | Done; placeholders to fill | `/terms` |
| Sign-up consent card (18+, Terms, health consent, breach-notice choice) | Done | `ConsentCard`, `RegisterView` |
| Consent record per account | Done | `public.account_consent`, `/api/consent` |
| Existing accounts asked once; changed items re-asked | Done | `ConsentGate` in `ProtectedRoute` |
| Breach-notice choice editable | Done | Settings → Account → Security notices |
| Revoke Google token on account deletion | Done | `services/googleRevoke.ts`, `DELETE /api/auth/account` |
| Export covers everything (entries, topics, dose log, settings, finance) | Done | Settings → Data → Export All |
| Locked-out / under-18 deletion | Done | `npm run account:delete -- <email> [--yes]` (server) |
| In-app notice banner, switched from the server | Done | `npm run notice -- --set "…" [--link https://…]` / `--clear` |
| Icon font self-hosted (no Google request) | Done | `npm run fonts:icons` (client) |
| Seed buttons hidden in production | Done | `import.meta.env.DEV` in Settings |
| No images in shares (client strip + server reject) | Done | `utils/shareContent.ts`, `shareContentHasMedia` |
| Only JPG / PNG / WebP / AVIF uploads | Done | `ALLOWED_IMAGE_TYPES` in `utils/processImage.ts` |
| Business name (Chronicles, not a filed entity yet) and effective date (Oct 18, 2026) | Done | `shared/src/legal/index.ts` |
| No mailing address published (email is the contact for every request) | Decided | Consider a P.O. box or virtual mailbox if one is ever needed |
| Host (Render), abuse email (support@ — all email goes there) | Done | `shared/src/legal/index.ts` |
| Hosts: Render (server), Prisma Postgres (database) | Done | Policy → Who receives it |
| Retention: Prisma daily snapshots (days with changes) kept 7 days on Starter/Pro, 30 on Business — the policy says "within 30 days"; security logs only in Render's rolling log stream; AI-safety counts kept permanently (no account) | Done | Policy → When you delete / How long we keep it. Update `backupDays` if the plan or provider changes |
| Backup and log retention set at the host | **To do** | Part 2 |
| Encrypt dose logs and topic names (Phase 2) | **To do** | Part 3 — then remove the line in the policy's readable items |
| Settings audit, retire legacy unwrap, ICS description opt-in (Phase 2) | **To do** | Part 3 |
| Google verification | Done | Part 5 |
| Processor agreements | Render DPA in place (https://render.com/dpa); **Prisma DPA: download from the Compliance section of the Prisma Console and keep a copy** (https://www.prisma.io/legal/dpa) | Part 6 |
| Attorney review | **To do** | Policy, Terms, part 4 |
| Next review | Oct 18, 2027 | And before any feature that changes where data goes |

Notes:
- The contact email in the policy is `support@mydailychronicles.com` for now. The pack suggests a separate
  privacy address (e.g. privacy@…); change `LEGAL_DETAILS.contactEmail` if you set one up.
- There is no billing or email provider in the code, so the policy lists no payment processor or email provider.
  Add them to the recipient table before either ships.
- Sign-ups aren't limited to the US; the app is English-only with no translations. GDPR-style rules could still apply to people in the EU or UK who sign up — revisit before marketing outside the US.

## 2. Access, export, correction and deletion

### Deadlines to hold

Use the strictest rule across Washington, Nevada and Connecticut, so one process covers everyone.

| Step | Deadline |
| --- | --- |
| Answer any request | 45 days from receipt, extendable once by 45 if you tell the person why within the first 45 |
| Finish a deletion in live systems | 30 days from verifying the person |
| Purge deleted data from backups | 6 months from verifying the person |
| Pass the deletion to everyone you shared with | Same time as your own deletion |
| Answer an appeal in writing, with reasons | 45 days from receipt |
| Free requests | Always free (the policy says so) |

### Handling an email request

1. **Log it** the day it arrives in the request log below, with the due date 45 days out.
2. **Verify** by replying to the account's email address, or by asking the person to act while signed in. Ask
   for nothing more than that.
3. **Act on it:**
   - *Access:* point them to Settings → Data → Export All, and send the readable items the server holds: email,
     username, session list, consent record, Apple Calendar feed contents, and dose logs and topic names until
     Phase 2 ships. Include the recipient table from the policy.
   - *Deletion, signed in:* walk them to Settings → Account → Delete account.
   - *Deletion, locked out:* after verifying the email, run `npm run account:delete -- <email>` (dry run), then
     with `--yes`. It revokes the Google token first. Their encrypted data is unreadable without their password anyway.
   - *Withdraw consent:* disconnect calendar or turn off In-App AI for them, or walk them through it. Withdrawing
     health-data consent means deleting the account.
4. **Pass deletions on.** In practice that means the Google revoke, which the delete paths do. Open-Meteo holds
   nothing tied to an account, and AI chats live in the user's own provider account.
5. **Reply in writing** with what you did. If you need the extension, say so and why before day 45.
6. **Appeals:** answer within 45 days with your reasons, and include the attorney general links from the policy
   if you deny it.

### Still to do

- [x] Backups: Prisma Postgres snapshots daily on days with changes, kept 7 days (Starter/Pro) or 30 (Business); the policy says deleted data leaves them within 30 days. A restore could bring back data deleted since the snapshot — if you ever restore, re-run any deletions done after it.
- [ ] Check how long Render keeps the log stream (`logSecurityEvent` output records IP addresses) and put the number in the policy if you want to state one.
- [ ] Keep the policy's menu names (Settings → Data → Export All, Settings → Account → Delete account) in step with the app.

### Request log

Keep each record for at least 24 months.

| Received | Type | Account email | Verified | Due | Extended | Done | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |

## 3. Encryption at rest (Phase 2)

The cipher setup needs no change (AES-256-GCM with random IVs, PBKDF2-SHA256 at 600,000 iterations, a separate
sign-in secret, purpose-bound wrapping, non-extractable keys). The work is the places health details sit outside it.
The FTC rule only reaches health data that is not encrypted, so data inside the encryption can't trigger a breach notice.

| Where | What a database reader can see | Fix |
| --- | --- | --- |
| `medication_dose_logs` | Dose counts per medication, times, days, taken or skipped. The foreign key also marks which posts are medications. | Move `medication_post_id`, `scheduled_time`, `taken_at` and `status` into one encrypted payload per row, like finance records. Keep `date` readable for the day query. Replace the unique index with an HMAC of post, time and date computed in the browser. |
| `taxonomies` | Topic names and icons (a custom name or an icon like `medication` says a lot). | Encrypt `name` and `icon` together; `color` and `sort_order` can stay readable. |
| `settings` | Any setting saved as plain JSON. | Audit every key; anything health related moves into an encrypted value. |
| Apple Calendar feed | Titles, times, locations, descriptions — readable by design. | Keep and disclose (the policy does). Consider leaving descriptions out by default with an opt-in. |

Shared entries are readable on the server by design (disclosed). They never carry images or drawings now.
`Account.isMigrating` can drive the move: on each user's next unlock the browser reads the old rows, encrypts
them, writes the new ones, and the server then drops the old columns.

### Hardening

- [x] **Passwords:** 12 characters minimum with upper, lower and a number (`passwordSchema`). Argon2id via WASM is the stronger long-term option; `kekIterations` already allows raising the PBKDF2 cost.
- [ ] **Retire the legacy unwrap:** re-wrap with AAD at each sign-in, track who is done, remove the no-AAD fallback once everyone is.
- [ ] **`SECRETS_ENCRYPTION_KEY`:** only in the host's secret store; write down how to rotate it.
- [ ] **Backups:** confirm with the host that backups are encrypted at rest; note the retention window.
- [ ] **The code browsers run:** hardware key or strong 2FA on GitHub and the host, protected main branch, lean dependencies, `npm audit` before each deploy. The CSP (`script-src 'self'`) already blocks most exfiltration.

## 4. Breach response plan

Aim to notify everyone within 30 days of discovery. That meets the FTC's 60-day limit and the strictest state laws
in one pass. The FTC counts from when you knew or should reasonably have known, and treats waiting to day 60 when you
were ready sooner as unreasonable delay. Missing a notice can cost up to $53,088 per violation.

### Who does what

| Role | Person | Contact |
| --- | --- | --- |
| Incident lead | [YOUR NAME] | [PHONE], support@mydailychronicles.com |
| Backup if you're unreachable | [NAME] | [PHONE, EMAIL] |
| Privacy attorney | [NAME, FIRM] | [PHONE, EMAIL] |
| Server host support | Render | https://render.com/support |
| Database host support | Prisma | https://www.prisma.io/support (Prisma Console → Support) |

### What counts as a breach

Any time someone gets health data without the user's permission: a hack, a mistaken disclosure, or data sent
somewhere the user didn't authorize. If someone accessed the database, the FTC presumes they took the data unless you
can show otherwise. Encrypted data doesn't count, so the first question is always what was readable: account emails,
session details, consent records (including postal addresses), Apple Calendar feeds, shared entries, and the dose logs
and topic names until Phase 2 ships.

### Steps

1. **Day 0, discovery.** Write down when you learned of it. Open a row in the incident log.
2. **First hours, contain.** Revoke all sessions, rotate database credentials and `SECRETS_ENCRYPTION_KEY`, take the affected service offline if needed. Save logs; delete nothing that shows what happened.
3. **Days 1–7, assess.** What was reached, was it encrypted, how many people, which states. If only encrypted data and wrapped keys left, still prompt everyone to change passwords (weak ones can be guessed offline).
4. **By day 10, decide.** Call the attorney. Settle which notices are required: people, FTC, media, state attorneys general.
5. **By day 30, notify** everyone required. Turn on the in-app banner the same day: `npm run notice -- --set "…" --link https://…`. Mail letters to people who chose mail (their address is in `account_consent.postal_address`). A law-enforcement request to delay is allowed.
6. **If 10 or more people can't be reached,** post a homepage notice for 90 days and run a toll-free number for 90 days.
7. **After,** fix the cause, update the policy if anything changed, write a short review in the log, and `npm run notice -- --clear` when it's no longer needed.

### Who gets notified

| Who | When it applies | Deadline | How |
| --- | --- | --- | --- |
| Each affected person | Any breach of readable health data | 60 days (FTC); 30 days in Colorado, Florida, Maine, New York, Washington | Email plus the in-app banner, or a mailed letter if they chose mail |
| FTC | 500 or more people | Same time as the people, within 60 days | https://www.ftc.gov/business-guidance/health-breach-form |
| FTC | Fewer than 500 people | Within 60 days after the end of the calendar year | Same form |
| Media in a state | 500 or more residents of one state | Within 60 days | Prominent outlets in that state |
| State attorneys general | 500+ residents in CO, FL, WA; 250+ in TX; any number in NY | 30 days in CO, FL, TX, WA; with the people's notices in NY | Each state's form |

### What every notice must say

What happened (breach date if known, discovery date, who acquired it if known); the kinds of health information;
steps people can take; what you're doing to investigate, prevent a repeat and limit harm; at least two ways to reach
you. Some states add items such as credit bureau contacts.

```
Subject: Important security notice about your Chronicles account

On [DATE DISCOVERED], we learned that [WHAT HAPPENED] on [DATE OF BREACH, if known].
[NAME OF WHO ACQUIRED IT, if known] obtained some of your information.

What was involved: [KINDS OF INFORMATION, such as medication schedules or account email].
Your encrypted journal and health entries [were / were not] readable.

What you can do: change your Chronicles password now, and anywhere else you used it. [OTHER STEPS]

What we are doing: [INVESTIGATION, FIXES, AND SUPPORT OFFERED].

Questions: [CONTACT EMAIL], or [WEBSITE PAGE / IN-APP / POSTAL ADDRESS].
```

### Set up now

- [x] Breach notices by email with a mailed-letter option, chosen at sign-up (and in Settings).
- [x] In-app banner switchable from the server (`npm run notice`).
- [ ] Store the attorney's number and the FTC form link somewhere reachable if the server is down.
- [ ] Read this plan once a year and after any big change.

### Incident log

| Discovered | What happened | Readable data involved | People affected | States | Notices sent | Closed |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

## 5. Google verification

Chronicles requests `calendar.events` and `calendar.calendarlist.readonly` (sensitive scopes): brand verification,
then sensitive scope review (usually 3–5 business days). Until then users see an unverified-app warning and a user cap applies.

- [ ] Separate Cloud projects for testing and production; delete unready OAuth clients in production.
- [ ] Homepage: public, on your domain, describes Chronicles, links the privacy policy and terms.
- [ ] Privacy policy on the same domain, linked on the OAuth consent screen, with the Google user data section below.
- [ ] Verify the domain in Google Search Console (Owner or Editor on the Cloud project).
- [ ] Branding page: name, logo, support email, homepage and privacy links → Verify Branding, then publish within 7 days.
- [ ] Data Access page: declare both scopes.
- [ ] Scope justifications (below).
- [ ] Demo video in English, unlisted on YouTube: consent screen with the app name, the OAuth client ID in the address bar, each scope in use.
- [ ] Watch the developer contact email for the review team's questions.

| Scope | What Chronicles does with it | Why nothing narrower works |
| --- | --- | --- |
| `calendar.events` | Creates, updates and deletes events for the event and meeting entries a user chooses to sync, and reads changes made in Google so both stay in step. | Read-only can't write events; the full `calendar` scope would also manage calendars themselves. |
| `calendar.calendarlist.readonly` | Lists the user's calendars so they can pick which one to sync with. | Already read-only and limited to the calendar list. |

Google user data section (add to the privacy policy the consent screen links to):

> **Google user data.** If you connect Google Calendar, Chronicles asks for permission to see your list of calendars
> and to create, edit and delete events in the calendar you choose. We use this access only to sync your event and
> meeting entries between Chronicles and Google Calendar. We store an encrypted refresh token and the email of the
> Google account you connected. Events Chronicles receives from Google are saved in your journal, encrypted in your
> browser. We do not sell Google user data, use it for advertising, or use it to train AI models. We share it with no
> one except as needed to provide sync. You can disconnect at any time in Settings, which revokes our access.
> Chronicles' use and transfer of information received from Google APIs adheres to the Google API Services User Data
> Policy, including the Limited Use requirements.

## 6. Anything else

- [x] Health data consent at sign-up, its own box, with the 18+ confirmation and the breach-notice choice; the record stores the date and versions.
- [x] Self-hosted icon font.
- [x] Seed buttons hidden in production.
- [x] No image sharing (photos and drawings), enforced on the server too.
- [ ] Main privacy policy (if one is published elsewhere): "no third-party analytics or tracking", the Google user data section, and a link to the health policy.
- [ ] Processor contracts: the host's data processing agreement, signed copy kept, limited to your instructions.
- [ ] Terms: abuse address (`LEGAL_DETAILS.abuseEmail`). If you ever learn of apparent CSAM, report it to NCMEC's CyberTipline as soon as reasonably possible and preserve the report's contents for one year. Don't open, copy or forward it. Report it, then call your attorney.
- [ ] People outside the US: limit sign-ups to the US, or plan for GDPR-style rules before opening up.
- [ ] App stores (native app): fill the data disclosure forms from the policy.
- [ ] Attorney review of the policy, the Terms and part 4.
