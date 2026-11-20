# AI task planning and AI journal insights

## Context

Two opt-in features that send decrypted journal data to the user's own AI provider (the existing bring-your-own-key In-App AI). Both break the "only you can read it" rule for the data they send, so each has its own switch in Settings → In-App AI, off by default, with a stern consent notice. Each runs once, only when its button is pressed, and stores nothing of the AI's answer unless the user acts on it.

Decisions already made with the user:
- AI plan shows a **review panel first**. Nothing is saved until Apply.
- The AI may place tasks across the **next 14 days**.
- Insights send **Journal-topic entries only** (no wellness, health, finance or other topics).
- The insights button sits in the **Journal title row**, beside New entry.

- Task planning sends **goals, milestones and visions** (the overall vision and each area's vision) so the AI understands what the tasks are for.
- **Nothing is ever stored decrypted.** The AI sees plaintext in transit; the app keeps it in memory only.
- **Every press of an AI button asks first**: "Your unencrypted data is about to be shared with <provider>", the list of what is shared, **OK** / **Cancel**. Calorie estimates and the chat are excluded.

No server code changes. Everything goes browser → provider through `services/aiAssistant.ts`, like the calorie estimates.

## 0. Rules both features follow

**Nothing stored decrypted**
- The request text and the AI's answer live only in component state and local variables. They are never written to `localStorage`, `sessionStorage`, IndexedDB, a setting, the service worker cache or the console, and are dropped when the panel closes or the session ends.
- Accepted changes are saved only through the existing encrypted paths: `useSaveFields` and `useCreateEntry` (AES-GCM in the browser before anything reaches the server). An AI-made task is an ordinary encrypted entry.
- Nothing about a run goes to the Chronicles server: no prompt, no answer, no log line.
- The one thing outside the app's control is the provider, which handles what it receives under its own terms. The consent notice and the share prompt both say so.
- Tests assert no storage writes during a run (spies on `localStorage.setItem`, `sessionStorage.setItem` and `indexedDB.open`).

**The share prompt, every time** — a shared molecule `molecules/AiSharePrompt.tsx`, shown inside the feature's `Modal` before any request:
- Heading: "Your unencrypted data is about to be shared with *<provider name>*."
- The list of what is shared, by kind with counts ("23 tasks", "4 goals", "6 milestones", "Your vision and 3 area visions", "9 busy times, no event names" / "12 journal entries, Nov 5 – 19"). Each line opens to the actual titles, so the user can see exactly which items go.
- A rough size ("About 2,400 tokens") and "The provider's terms apply to what it receives."
- **OK** sends. **Cancel** closes with nothing sent. There is no "don't ask again".
- Used by AI task planning and AI insights only. Calorie / nutrient estimates and the chat keep their current behaviour.

## 1. Settings, consent and gating

**`client/src/services/aiAssistant.ts`**
- Add `planEnabled: boolean` and `insightsEnabled: boolean` to `AiConfig` and `DEFAULT_AI_CONFIG` (both `false`). Older saved configs read the default (they merge over defaults at load).
- Export `aiJson(system, prompt, opts?: { maxTokens?: number })`: `requireReady()` + the private `complete()`, so both features get JSON mode. Let `completeTurns` take an optional max-tokens override (plan answers can pass 2048).
- Export `isAiPlanEnabled()` / `isAiInsightsEnabled()`: `isAiReady() && cfg.<flag> === true && <feature chosen in this browser>`.

**`client/src/services/deviceConsent.ts`**
- Add records `aiPlan` and `aiInsights` to `RecordName`, with `recordAiFeatureChoice(feature, on)`, `aiFeatureChosenHere(feature)` and `reconcileAiFeature(feature, onThere)`, following `recordAiChoice` / `aiChosenHere` / `reconcileAi`. A sealed `true` replayed by the server is never enough. Call the reconcile from `loadAiConfig` / `ensureAiConfig` next to `reconcileAi`.

**`client/src/hooks/useAiReady.ts`**
- Add `useAiPlanEnabled()` and `useAiInsightsEnabled()` (same shape as `useAiChatEnabled`).

**`client/src/components/organisms/AiSettings.tsx`**
- Two `SettingsActionRow`s under "AI chat", shown while `cfg.enabled`: **AI task planning** and **AI insights**, each with a `Toggle`.
- Switching one **on** does not save yet. It opens a consent block inside the row (`SettingsActionRow` children), built from a new molecule `molecules/AiFeatureConsent.tsx`:
  - Task planning notice: your unscheduled tasks, goals, milestones, visions and the busy times of your next 14 days are decrypted in this browser and sent to *<provider>*. They are no longer protected by Chronicles' encryption once sent, and the provider's terms apply. Each run is a paid request (sent again once if the model can't write that long an answer), and cost grows with the number of tasks. It runs only when you press the button.
  - Insights notice: the text of your Journal entries for the chosen period is decrypted and sent. Same loss of encryption and cost warning. Written by an AI model, not a person, not a therapist, and can be wrong. For adults 18 and older.
  - Both notices then carry the same **consent statement** (draft wording, kept in one constant, `AI_SHARING_CONSENT` in `utils/chatDisclosure.ts`, so Settings, the Terms and the policy say the same thing):
    - "This feature removes the usual privacy barrier between your journal and your AI provider."
    - "When you press the button, the items listed are decrypted in this browser and sent to your provider as readable text."
    - "Chronicles is not responsible for what your AI provider does with the information you send it. Your provider's own terms and privacy policy apply."
    - "We send only what the feature needs, but there is no guarantee of privacy for anything sent this way."
    - "Your entries stay encrypted in Chronicles. Nothing is stored unencrypted."
    - "Your AI provider sees only what is sent for that run. Nothing is sent unless you are signed in and you press the button and choose OK."
  - Two required core `Checkbox`es, never pre-ticked: "I understand my entries are unencrypted when they are sent to my AI provider" and "I understand Chronicles cannot guarantee the privacy of what I send and is not responsible for how my provider handles it". Then **Turn on** / **Not now** `RowPill`s (Turn on stays off until both are ticked).
  - The consent is versioned (`AI_SHARING_CONSENT_VERSION`): the per-browser record stores the version agreed to, and a later change to the wording asks again before the feature runs.
- Turn on → `update({ planEnabled: true }, true)` + `recordAiFeatureChoice('aiPlan', true)`. Switching off saves at once and drops the record. A browser where the config says on but there is no record shows "On, but not used from this browser" + **Turn on here**, which reopens the consent block (the existing AI row's pattern).
- Extend the Provider group's `SettingsNotice` sentence to list tasks/goals/events and journal text when those switches are on.

## 2. AI task planning

**`client/src/utils/plannerEvents.ts`** (new, pure) — move `eventsByDay` out of `PlannerView.tsx` (L126–156) so it can cover any range of days. `PlannerView` imports it.

**`client/src/utils/aiPlan.ts`** (new, pure, tested)
- `buildPlanRequest({ tasks, goals, milestones, events, days, now })` → `{ system, prompt, counts, approxTokens }`.
  - Sends, per task: id, title, priority, deadline, length (`hoursOf`), goal/milestone titles, whether it is an idea. From `unscheduled(tasks, today)` (`overdue` + `open` + `ideas`), capped at 60 by urgency, with the count left out reported.
  - Sends every goal that isn't achieved (id, title, category, status, type, start and target dates, notes capped at 500 characters) and every unfinished milestone (id, title, its goal, status, dates, how many open tasks it has), so new tasks attach to the right one.
  - Sends the **visions** from the sealed `goalCategories` setting: the overall `vision` and each shown area's vision (`areaInfo` in `utils/goalCategories.ts`), read through `useEncryptedSetting('goalCategories')`.
  - Sends busy times for the 14 days as `day start–end` only. **Event titles are not sent**, nor notes, nor any other topic.
  - Asks for JSON: `{ schedule: [{ id, date, time, hours }], newTasks: [{ title, goalId, milestoneId?, date?, time?, hours?, why }] }`, at most 10 new tasks, 8 AM–10 PM, never over a busy time.
- `parsePlan(text, ctx)` → validated plan. Drops anything with an unknown id, a date outside the 14 days, a goal id that isn't the user's, or a title over 120 characters. Times snap to 15 minutes, hours go through `clampHours`. A time that overlaps an event keeps its day and loses its time (the planner's `layoutDay` then places it). The model's output is treated as data only.

**`client/src/components/organisms/AiPlanReview.tsx`** (new) — `atoms/Modal` (`size="lg"`), three steps:
1. **Share prompt** (`AiSharePrompt`, section 0): tasks, goals, milestones, visions and busy times listed. **OK** / Cancel. No request before OK.
2. **Working**: spinner, Cancel.
3. **Review**: two lists with the core `Checkbox` on each row, all ticked to start. "Schedule" rows read "Call the dentist → Tue, Nov 24 · 9:00 AM · 1 h". "New tasks" rows show the title, its goal and the AI's one-line reason. **Apply N changes** / Cancel.
- Apply: `useSaveFields` per existing task with `{ ...fields, scheduledDate, ...startPatch, ...lengthPatch }` and an idea moved to Planned (`taskFieldsForStatus`); `useCreateEntry({ name: 'Task', icon: 'circle-check' }, …)` per new task with `parentGoalId` / `parentMilestoneId`. Failures are counted and reported with `showFlash`. Closing discards the plan.

**`client/src/views/PlannerView.tsx`** — in `PlanningShell`'s `actions`, a neutral `PillButton` **AI plan my unscheduled tasks** (shorter "AI plan" on phones), rendered only while `useAiPlanEnabled()`. It opens `AiPlanReview` with `usePlanData()` and the 14 days' events.

## 3. AI insights

**`client/src/utils/aiInsights.ts`** (new, pure, tested)
- `buildInsightsRequest(journalEntries, period, now)` → `{ system, prompt, counts, approxTokens }`. Journal-topic entries only (`topicEntries` + the Journal topic id), newest first, `stripHtml`, 1,500 characters an entry, about 24,000 in all, older ones left out and counted.
- System prompt: reflective and specific to what was written, never a diagnosis, no companion framing, plus `SAFE_CONVERSATION_RULES` from `utils/chatSafety.ts`. Asks for JSON: `{ reflection, prompts: [≤3], chatSuggestions: [≤3] }`.
- `parseInsights(text)` → validated shape, lengths capped, strings only.

**`client/src/components/organisms/AiInsights.tsx`** (new) — a pill + `atoms/Modal` (`size="md"`):
1. **Share prompt** (`AiSharePrompt`, section 0): a Last 7 days / 30 days `FilterTabs` over the list of journal entries that will go. **OK** / Cancel.
2. **Result**: "Written by an AI model, not a person." Then the reflection, the prompts and the chat suggestions. Each prompt has **Copy** (`copyText`) and **Write about this** (opens a blank Journal entry with the prompt as its first line through `useNewEntryInJournal`; if that hook can't preset text, extend its router state with `newEntryContent`). Chat suggestions have Copy only in this first version.
- Closing discards everything. Nothing is saved or cached.
- **Safety** (same protocol as the chat): `patternScreen` on the digest before sending, and after the answer `replyPatternScreen`, then `classifyReply` when `replyNeedsReview` says so. A failed review or a harmful answer is withheld (fail closed). Any risk shows `SupportNotice` (or `CrisisCard` when urgent) in the modal and queues the usual `crisis_card_shown` analytics event.

**`client/src/views/JournalView.tsx`** — add `<AiInsights />` inside the `titleAside` `TopBarAction`, beside New entry, rendered only while `useAiInsightsEnabled()`.

## 4. Policy and docs
- **First step of the work**: save a copy of this plan as `docs/AI_PLANNING_INSIGHTS_PLAN.md` (beside `docs/AUTH_REDESIGN_PLAN.md`), and add as-built notes to it when the work is done.
- `shared/src/legal/index.ts` + `HealthPrivacyView`: add the two features to the In-App AI section (what is sent, when, that nothing is stored) and bump the privacy policy's `LEGAL_VERSIONS` entry. This asks everyone to accept again, as the project rule requires when data moves differently.
- `TermsView`: add the same responsibility statement (Chronicles is not responsible for information the user chooses to send to their AI provider, and gives no privacy guarantee for it) and bump the Terms' `LEGAL_VERSIONS` entry too.
- `molecules/AiSafetyProtocol.tsx`: add insights to the screening text, update `PROTOCOL_DATE` and its change log.
- `CLAUDE.md`: a short section for both features.

## Reused pieces
`atoms/Modal`, core `Checkbox`, `PillButton`, `RowPill`, `SettingsActionRow`, `FilterTabs`, `usePlanData`, `useSaveFields`, `useCreateEntry`, `unscheduled` / `hoursOf` / `startPatch` / `lengthPatch` / `clampHours` (`utils/planner.ts`), `topicEntries`, `stripHtml`, `copyText`, `showFlash`, `patternScreen` / `replyPatternScreen` / `replyNeedsReview` / `classifyReply`, `SupportNotice` / `CrisisCard`.

## Ideas left out of this version
- Sending wellness check-ins with insights.
- "Ask in chat" on a chat suggestion (needs a way to hand text to the chat panel).
- Undo for an applied plan (the review step covers it for now).

## Verification
- Unit tests: `aiPlan.test.ts` (request contents, no event titles, every rejection path in `parsePlan`), `aiInsights.test.ts` (Journal topic only, caps, parse), `deviceConsent` (new records, per account, reconcile), `AiSettings` (switch needs the tick before it saves, off drops the record), `AiSharePrompt` (lists every kind sent, Cancel sends nothing), `AiPlanReview` and `AiInsights` with `aiJson` mocked (no request before OK, the prompt shows on every press, unticked rows not applied, withheld answer shows the support notice, no storage writes during a run).
- `npx tsc --noEmit` in `client/`, then the test files above plus `security.test.ts`.
- By hand on the dev server with the test account: enable each switch and read the notice; run AI plan on seeded planning data, untick a row, Apply, and check the Planner and Calendar; run insights on seeded journal entries, Copy and Write about this; confirm in the network tab that only the provider is called and that nothing goes out before Send; confirm both buttons are absent with the switches off and in a second browser profile until Turn on here.

## As built (2026-11-19)

Built as planned, with these differences:
- **One gated request function, not `aiJson`.** `aiFeatureJson(feature, system, prompt)` in `services/aiAssistant.ts` refuses unless that feature is switched on and agreed to in this browser, so the check sits beside the request.
- **One hook and one set of record helpers for both features**: `useAiFeatureEnabled(feature)`, `recordAiFeatureChoice` / `aiFeatureChosenHere` / `reconcileAiFeature`. The record's name carries the consent version (`aiPlan:v1`).
- **`eventsByDay` was not moved whole.** The shared part is `eventOccurrences` in `utils/plannerEvents.ts`; the Planner still builds its own lane rows from it.
- **"Write about this" stays inside the Journal** (`writeFromPrompt` in `JournalView`) rather than going through `useNewEntryInJournal`. The prompt opens as the first line of a new entry and nothing is saved until something is written.
- **Insights safety**: the writing is screened locally before sending (`patternScreen`). The model-based input classifier is not run, to keep a run to one request (plus one review request only when the answer touches risk topics).
- **Planning days run 06:00 to 23:00** when checking the AI's times, a little wider than the 08:00 to 22:00 the AI is asked to use.
- The privacy policy and Terms versions are both `2026-11-19`, so every account is asked to accept again.

Not built (as listed above): wellness data in insights, "Ask in chat", Undo for an applied plan. Also not built: a minor-age check on journal text for insights. The 18+ line is in the consent notice only.

### Changed after review (2026-11-19)
- **Event names are sent.** The plan above says busy times go with no event names. That was wrong for planning: what an event is matters to how tasks are placed around it. The request now sends each event's and meeting's name and time for the 14 days (all-day ones included), never its notes, place or attendees. The share prompt lists them by name, and the consent notice, privacy policy and Settings text say so.
- **The AI keeps goals on track, not just the week.** Beyond placing tasks and adding new ones, the answer may change a task's priority or what it belongs to, change a goal's or milestone's dates, status or title, add milestones, and move a one-off event's day or time. Every suggestion is a row in the review with before and after and the reason. Event moves start unticked.
- **Titles, filing and the roadmap.** The AI may clean up a goal's, milestone's or task's title (spelling, grammar, clarity, never its meaning), file a goal under one of the person's own categories and set its type, set a task's type from the person's own list, and fill in missing start and target dates so every goal and milestone has a bar on the Roadmap. The categories and task types are sent so it can only pick from them.
- **Notes and priority order are sent.** Task, goal and milestone notes go with the request (where each stands), along with the tasks already planned for the 14 days. Goals and milestones are sent in the order of the planning boards, which the AI is told is the priority order.
- **Events: name and time only, in and out.** Nothing else about an event or meeting is sent, and the only change the AI can suggest for one is its day or time. Repeating events are never moved.
- **The panel scrolls.** `Modal` is now never taller than the screen: its title and buttons stay put and the body scrolls.
- **Long answers.** With goals, milestones and events in the answer, a plan could run past the room it was given and arrive cut off, which read as "no plan". The plan request now asks for 16,000 tokens of room (falling back to 4,096 for a model that refuses that much), runs Claude 5 models at medium effort, asks the model to keep "why" short and cap its changes at about forty, and an answer that is still cut off is read as far as it got (`firstJsonObject` in `utils/aiJson.ts`), with a note in the review that some suggestions may be missing.

