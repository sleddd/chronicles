import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styled, { keyframes } from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { PillButton } from '../atoms/PillButton.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useAiReady } from '../../hooks/useAiReady.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { entries as entriesApi, analytics as analyticsApi } from '../../services/api.js';
import { autoNutritionOnSave, chatReply, classifyReply, classifyRisk, getAiConfigValue, type ChatTurn } from '../../services/aiAssistant.js';
import { useUIStore } from '../../stores/uiStore.js';
import { chatSaveEntry, chatSaveFormats } from '../../utils/chatSaveFields.js';
import { MINOR_FALLBACK_REPLY, stripMinorTag, chatSystemPrompt, chatTranscriptHtml, parseSaveCommand, textToEntryHtml, SAVED_CHATS_TOPIC, type TopicRef } from '../../utils/chatSave.js';
import { getOrCreateJournalTopic, getOrCreateTopic } from '../../utils/getOrCreateJournalTopic.js';
import { parseChatMarkdown, type Inline } from '../../utils/chatMarkdown.js';
import { findBanned, limitEmojis, rewriteInstruction, scrubBanned } from '../../utils/chatStyle.js';
import { AI_DISCLOSURE, AI_REMINDER, reminderDue } from '../../utils/chatDisclosure.js';
import { maxRisk, minorPattern, patternScreen, replyNeedsReview, replyPatternScreen, NO_RISK, type RiskKind, type RiskResult } from '../../utils/chatSafety.js';
import { useAiChatStore, hasCurrentConsent } from '../../stores/aiChatStore.js';
import { Checkbox } from '../atoms/core/Checkbox.jsx';
import { CrisisCard, SupportNotice } from '../molecules/CrisisCard.js';

/* ── Styles (floating overlay: the one place a shadow is allowed) ── */

/* High enough to clear the bottom Save bars (journal editor, forms). The
   panel opens just above the bubble (bubble + 52px + 12px gap). */
const POS = {
  default: { bubble: '112px', bubblePhone: '96px', panel: '176px', panelPhone: '160px' },
};
type Pos = typeof POS.default;

const Bubble = styled.button<{ $pos: Pos }>`
  position: fixed;
  right: 24px;
  bottom: ${({ $pos }) => $pos.bubble};
  z-index: 900;
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--on-accent, #fff);
  background: var(--color-accent);
  border: none;
  border-radius: var(--r-full, 999px);
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.25));
  cursor: pointer;
  transition: transform 150ms ease-out, background 150ms;
  &:hover { background: var(--color-accent-hover, var(--color-accent)); transform: translateY(-1px); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
  @media (max-width: 640px) { right: 16px; bottom: ${({ $pos }) => $pos.bubblePhone}; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:hover { transform: none; } }
  @media print { display: none; }
`;

const Panel = styled.section<{ $pos: Pos }>`
  position: fixed;
  right: 24px;
  bottom: ${({ $pos }) => $pos.panel};
  z-index: 900;
  width: 380px;
  /* Top edge stays at least 3rem below the top of the screen */
  height: min(560px, calc(100dvh - ${({ $pos }) => $pos.panel} - 3rem));
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  /* The chat is a soft, conversational overlay — rounded on purpose */
  border-radius: 18px;
  box-shadow: var(--shadow-xl, 0 16px 48px rgba(0,0,0,0.3));
  overflow: hidden;
  @media (max-width: 640px) {
    right: 12px;
    left: 12px;
    width: auto;
    bottom: ${({ $pos }) => $pos.panelPhone};
    height: min(70dvh, calc(100dvh - ${({ $pos }) => $pos.panelPhone} - 3rem));
  }
  @media print { display: none; }
`;

const Head = styled.header`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
`;

const Title = styled.h2`
  flex: 1;
  margin: 0;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-secondary);
  span {
    margin-left: 8px;
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
    color: var(--text-tertiary);
  }
`;

const HeadBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  background: transparent;
  border: none;
  padding: 4px;
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

const Log = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

/* Alternating bubbles: the user on the right in a lighter grey (never the
   accent — text on an accent can't always stay readable), the assistant on the
   left in a sunken bubble; notes sit centred and quiet. */
const Msg = styled.div<{ $role: 'user' | 'assistant' | 'note' }>`
  max-width: ${({ $role }) => ($role === 'note' ? '100%' : '85%')};
  align-self: ${({ $role }) => ($role === 'user' ? 'flex-end' : $role === 'assistant' ? 'flex-start' : 'center')};
  padding: ${({ $role }) => ($role === 'note' ? '0 4px' : '9px 13px')};
  background: ${({ $role }) => ($role === 'user' ? 'var(--bg-active)' : $role === 'assistant' ? 'var(--bg-sunken)' : 'transparent')};
  /* Light: --bg-active is darker than the sunken bubble — the user's stays the lighter grey */
  ${({ $role }) => ($role === 'user' ? "html[data-theme='light'] & { background: var(--bg-hover); }" : '')}
  border-radius: ${({ $role }) => ($role === 'user' ? '16px 16px 4px 16px' : $role === 'assistant' ? '16px 16px 16px 4px' : '0')};
  font-family: var(--font-sans);
  font-size: ${({ $role }) => ($role === 'note' ? '12px' : '14px')};
  line-height: 1.55;
  text-align: ${({ $role }) => ($role === 'note' ? 'center' : 'left')};
  color: ${({ $role }) => ($role === 'note' ? 'var(--text-tertiary)' : 'var(--text-primary)')};
  white-space: ${({ $role }) => ($role === 'assistant' ? 'normal' : 'pre-wrap')};
  overflow-wrap: anywhere;

  /* Basic formatting in assistant replies */
  p { margin: 0; }
  p + p, p + ul, p + ol, ul + p, ol + p, ul + ul, ol + ol, ul + ol, ol + ul, h4 + * , * + h4 { margin-top: 8px; }
  h4 { margin: 0; font-size: 14px; font-weight: 700; }
  ul, ol { margin: 0; padding-left: 20px; }
  li + li { margin-top: 2px; }
  strong { font-weight: 700; }
  code {
    font-family: var(--mono, monospace);
    font-size: 12px;
    padding: 1px 5px;
    background: var(--bg-hover);
    border-radius: 6px;
  }
`;

const ErrorText = styled.span`
  color: var(--color-danger, #c0392b);
`;

const Suggestion = styled.button`
  display: inline;
  font-family: var(--mono, monospace);
  font-size: 12px;
  color: var(--color-accent);
  background: var(--color-accent-subtle);
  border: none;
  border-radius: 8px;
  padding: 2px 8px;
  cursor: pointer;
  text-align: left;
  &:hover { text-decoration: underline; }
`;

const LinkBtn = styled.button`
  font: inherit;
  color: var(--color-accent);
  background: none;
  border: none;
  padding: 0;
  margin-left: 6px;
  cursor: pointer;
  text-decoration: underline;
`;

const Composer = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 14px;
  border-top: 1px solid var(--border-subtle);
`;

/* Grows with what you type (see the auto-size effect) up to ~9 lines, then scrolls */
const Input = styled.textarea`
  flex: 1;
  min-height: 38px;
  max-height: 200px;
  overflow-y: auto;
  resize: none;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.4;
  color: var(--text-primary);
  background: var(--bg-sunken);
  border: none;
  border-radius: 20px;
  padding: 9px 14px;
  &:focus { outline: 2px solid var(--color-accent-subtle); }
  &::placeholder { color: var(--text-tertiary); }
`;

/* "Thinking" dots: three dots rising and brightening in turn */
const dotPulse = keyframes`
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
`;

const Typing = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    animation: ${dotPulse} 1.2s ease-in-out infinite;
  }
  span:nth-child(2) { animation-delay: 0.15s; }
  span:nth-child(3) { animation-delay: 0.3s; }
  @media (prefers-reduced-motion: reduce) {
    span { animation: none; opacity: 0.6; }
  }
`;

const PausedNote = styled.span`
  flex: 1;
  align-self: center;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const Empty = styled.div`
  margin: auto 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-tertiary);
  code { font-family: var(--mono, monospace); font-size: 12px; color: var(--text-secondary); }
  p { margin: 0; }
  p + p { margin-top: 12px; }
`;

/* The consent screen fills the panel in place of the log and message box */
const Consent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 18px 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
  h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 300;
    color: var(--text-primary);
  }
  ul { margin: 0; padding-left: 18px; }
  li + li { margin-top: 6px; }
`;

const ConsentActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
`;

/* ── Model ── */

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'note' | 'crisis';
  text: string;
  /** Crisis card: the kind of risk, and whether the AI's reply was withheld */
  kind?: RiskKind | null;
  rating?: 'concern' | 'elevated' | 'urgent';
  withheld?: boolean;
  error?: boolean;
  /** Set on the confirmation note after a /save */
  savedEntryId?: number;
  /** Set on notes that should link to Settings */
  settingsLink?: boolean;
}

let nextId = 1;
const JOURNAL_PLACEHOLDER_ID = -1;

/** Inline spans; a `/save …` code span becomes a one-tap button that fills the input. */
function renderInline(nodes: Inline[], onUse: (cmd: string) => void): ReactNode[] {
  return nodes.map((n, i) => {
    if (n.kind === 'text') return <Fragment key={i}>{n.text}</Fragment>;
    if (n.kind === 'bold') return <strong key={i}>{renderInline(n.children, onUse)}</strong>;
    if (n.kind === 'italic') return <em key={i}>{renderInline(n.children, onUse)}</em>;
    if (/^\/save\s/.test(n.text)) {
      return (
        <Suggestion key={i} type="button" onClick={() => onUse(n.text)} title="Put this in the message box to save it">
          {n.text}
        </Suggestion>
      );
    }
    return <code key={i}>{n.text}</code>;
  });
}

/** Assistant reply with basic formatting: paragraphs, headings, lists, bold, italic, code. */
function renderReply(text: string, onUse: (cmd: string) => void): ReactNode {
  return parseChatMarkdown(text).map((b, i) => {
    if (b.kind === 'heading') return <h4 key={i}>{renderInline(b.children, onUse)}</h4>;
    if (b.kind === 'ul') return <ul key={i}>{b.items.map((it, j) => <li key={j}>{renderInline(it, onUse)}</li>)}</ul>;
    if (b.kind === 'ol') return <ol key={i} start={b.start}>{b.items.map((it, j) => <li key={j}>{renderInline(it, onUse)}</li>)}</ol>;
    return (
      <p key={i}>
        {b.lines.map((line, j) => <Fragment key={j}>{j > 0 && <br />}{renderInline(line, onUse)}</Fragment>)}
      </p>
    );
  });
}

/**
 * Floating, unsaved AI chat. Messages live only in this component — closing
 * the page or locking the journal clears them. `/save chat` saves the whole
 * conversation to the "Saved Chats" topic. `/save <topic> <text>` saves
 * text as an encrypted journal entry (no AI involved, nothing sent anywhere
 * but the existing encrypted entries API).
 */
export function AiChat() {
  const aiReady = useAiReady();
  const topics = useEntriesStore(s => s.topics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const { encryptNewPost, lock } = useEncryption();
  const openInJournal = useOpenInJournal();
  const navigate = useNavigate();
  const location = useLocation();
  const pos = POS.default;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // When the session began or the AI disclosure was last repeated (memory only)
  const disclosedAtRef = useRef(Date.now());
  // Safety (memory only, kept through Clear, gone with the session): once a
  // risk sign appears the AI answers under the safe conversation rules; an
  // urgent sign pins the crisis card at the top for the rest of the session
  const safeModeRef = useRef(false);
  // Once eating-disorder risk appears: no calorie numbers in the chat or on /save Meals
  const eatingSafeRef = useRef(false);
  const [pinned, setPinned] = useState<{ kind: RiskKind | null } | null>(null);
  // Paused after an urgent sign until "Keep talking" (concern / elevated never pause)
  const [paused, setPaused] = useState<{ history: ChatTurn[]; kind: RiskKind | null } | null>(null);
  // Paused for good (until the owner locks and unlocks) when the writer seems to be under 18
  const [minorLocked, setMinorLocked] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [consentError, setConsentError] = useState('');
  const consentStatus = useAiChatStore(s => s.status);
  const loadConsent = useAiChatStore(s => s.load);
  const acceptConsent = useAiChatStore(s => s.accept);
  const blocked = !!consentStatus?.blocked;
  const consented = hasCurrentConsent(consentStatus);
  const chatOn = aiReady && consented;
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-size the message box to its text (shrinks back after sending)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input, open]);

  // Clear the journal's bottom save bar

  // "Journal" is the app's default home for notes — always offer it, creating
  // the topic on first save (JOURNAL_PLACEHOLDER_ID) if it doesn't exist yet
  const topicRefs: TopicRef[] = useMemo(() => {
    const refs = topics.map(t => ({ id: t.id, name: t.name }));
    if (!refs.some(t => t.name.toLowerCase() === 'journal')) refs.unshift({ id: JOURNAL_PLACEHOLDER_ID, name: 'Journal' });
    return refs;
  }, [topics]);

  useEffect(() => { void loadConsent(); }, [loadConsent]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const push = (...msgs: Omit<ChatMessage, 'id'>[]) => {
    const withIds = msgs.map(m => ({ ...m, id: nextId++ }));
    setMessages(prev => [...prev, ...withIds]);
    return withIds[withIds.length - 1]?.id ?? 0;
  };

  /** A risk sign turns on the safe rules for the rest of the session (and the eating rules for eating risk). */
  const markRisk = (risk: RiskResult) => {
    if (risk.rating === 'none') return;
    safeModeRef.current = true;
    if (risk.kind === 'eating_disorder') eatingSafeRef.current = true;
  };

  /** Show crisis resources and count them (rating + kind only — never the account or the words).
   *  Urgent pins the full card and pauses; otherwise a quiet support notice joins the thread. */
  const showCrisis = (risk: RiskResult, opts: { withheld?: boolean } = {}) => {
    const rating = risk.rating === 'none' ? 'concern' : risk.rating;
    const kind = risk.kind;
    void analyticsApi.crisisCard(rating, kind).catch(() => { /* counting never blocks the chat */ });
    markRisk({ rating, kind });
    if (rating === 'urgent') {
      setPinned({ kind });
      push({ role: 'note', text: 'Chat paused. Help is pinned at the top of this chat.' });
      return;
    }
    push({ role: 'crisis', text: '', kind, rating, withheld: opts.withheld });
  };

  /** The writer seems to be under 18: pause the chat for good and count it (no content). */
  const lockForMinor = () => {
    setMinorLocked(true);
    setPaused(null);
    void analyticsApi.minorDetected().catch(() => { /* counting never blocks the chat */ });
  };

  /** A reply from the model, kept to the house style (one quiet rewrite, then scrubbed). */
  const generateReply = async (history: ChatTurn[], safe: boolean): Promise<string> => {
    const system = chatSystemPrompt(topicRefs.map(t => t.name), getAiConfigValue()?.chatNotes ?? '', safe, eatingSafeRef.current,
      chatSaveFormats(topicRefs, topicCustomFields));
    let reply = (await chatReply(system, history)).trim();
    const found = findBanned(reply);
    if (found.length) {
      try {
        const rewritten = (await chatReply(system, [
          ...history, { role: 'assistant', content: reply }, { role: 'user', content: rewriteInstruction(found) },
        ])).trim();
        if (rewritten) reply = rewritten;
      } catch { /* keep the original; it's scrubbed below */ }
    }
    return limitEmojis(findBanned(reply).length ? scrubBanned(reply) : reply);
  };

  /** Screen a reply (patterns + the classifier) and show it. Returns the kind of
   *  harm when the reply was withheld instead, else null. */
  const deliver = async (reply: string, history: ChatTurn[], userRisk: RiskResult): Promise<RiskKind | null> => {
    const lastUser = history[history.length - 1]?.content ?? '';
    // Patterns first; the classifier reviews only replies that touch these
    // topics, and if that review fails the reply is withheld (fail closed)
    const harmful = replyPatternScreen(reply)
      ?? (replyNeedsReview(reply) ? await classifyReply(reply, lastUser).catch(() => userRisk.kind ?? 'suicide' as RiskKind) : null);
    if (harmful) return harmful;
    // The model follows the age rules by tagging its reply — strip the tag and pause
    const { text, tagged } = stripMinorTag(reply);
    push({ role: 'assistant', text: text || '…' });
    if (tagged) lockForMinor();
    return null;
  };

  const keepTalking = async () => {
    if (!paused) return;
    const { history, kind } = paused;
    setPaused(null);
    setBusy(true);
    try {
      // The urgent card is already pinned — a held-back reply just says so
      if (await deliver(await generateReply(history, true), history, { rating: 'urgent', kind })) {
        push({ role: 'note', text: 'The reply was withheld because it wasn’t safe to show.' });
      }
    } catch (err) {
      push({ role: 'note', error: true, text: err instanceof Error ? err.message : 'In-App AI didn’t answer — try again.' });
    } finally {
      setBusy(false);
    }
  };

  const giveConsent = async () => {
    setConsentError('');
    try { await acceptConsent(); disclosedAtRef.current = Date.now(); }
    catch (err) { setConsentError(err instanceof Error ? err.message : 'That didn’t save — try again.'); }
  };

  const handleSave = async (raw: string) => {
    const cmd = parseSaveCommand(raw, topicRefs);
    push({ role: 'user', text: raw });
    if (cmd.kind === 'help') {
      push({ role: 'note', text: 'Type /save chat to keep this conversation, or /save, a topic, then the text — for example: /save Journal Felt calm after my walk today.' });
      return;
    }
    if (cmd.kind === 'chat') {
      // The conversation so far (no notes, errors or /save commands), oldest first
      const turns = messages
        .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => (m.role === 'user' || m.role === 'assistant') && !m.error)
        .filter(m => parseSaveCommand(m.text, topicRefs).kind === 'none')
        .map(m => ({ role: m.role, text: m.text }));
      if (!turns.length) {
        push({ role: 'note', error: true, text: 'Nothing to save yet — chat first, then type /save chat.' });
        return;
      }
      setBusy(true);
      try {
        const topicId = await getOrCreateTopic(SAVED_CHATS_TOPIC, 'comments');
        const content = chatTranscriptHtml(turns);
        const metadata: Record<string, unknown> = { _taxonomyId: topicId, _widgetType: 'saved-chat' };
        const encrypted = await encryptNewPost(content, metadata);
        const result = await entriesApi.create({ id: encrypted.id,
          contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
          isEncrypted: true, taxonomyIds: [topicId],
        });
        const id = result.id as number;
        addDecryptedEntry({
          id, content, metadata, isEncrypted: true,
          createdAt: new Date(result.createdAt as string),
          updatedAt: new Date((result.updatedAt || result.createdAt) as string),
        });
        push({ role: 'note', text: `Chat saved to ${SAVED_CHATS_TOPIC}.`, savedEntryId: id });
      } catch (err) {
        console.error('Chat save failed:', err);
        push({ role: 'note', error: true, text: 'That didn’t save — try again.' });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (cmd.kind === 'noTopic') {
      const names = topicRefs.map(t => t.name).slice(0, 12).join(', ');
      push({ role: 'note', error: true, text: `No topic called “${cmd.attempted}”.${names ? ` Your topics: ${names}.` : ''}` });
      return;
    }
    if (cmd.kind === 'noText') {
      push({ role: 'note', error: true, text: `Add the text to save after “${cmd.topic.name}”.` });
      return;
    }
    if (cmd.kind !== 'save') return;
    setBusy(true);
    try {
      const topicId = cmd.topic.id === JOURNAL_PLACEHOLDER_ID ? await getOrCreateJournalTopic() : cmd.topic.id;
      // Shaped like the topic's own form: a symptom's names as chips, a
      // task's title, an exercise's stats… (plain text for plain topics)
      const shaped = chatSaveEntry(cmd.topic.name, cmd.text, topicCustomFields[topicId] ?? []);
      const content = shaped.customFields && shaped.content ? shaped.content : textToEntryHtml(cmd.text);
      const metadata: Record<string, unknown> = { _taxonomyId: topicId };
      // A meal lands in the Meals log for today, with its nutrients estimated
      // by the AI (a failed estimate never blocks the save)
      let estimated = false;
      if (shaped.customFields) {
        let cf = shaped.customFields;
        if (cmd.topic.name.toLowerCase() === 'meals' && aiReady && !eatingSafeRef.current) {
          try {
            const filled = await autoNutritionOnSave(String(cf.mealDescription ?? ''), cf);
            if (filled) { cf = filled; estimated = true; }
          } catch (err) {
            console.warn('Nutrient estimate failed:', err);
          }
        }
        metadata._customFields = cf;
      }
      const encrypted = await encryptNewPost(content, metadata);
      const result = await entriesApi.create({ id: encrypted.id,
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
        isEncrypted: true, taxonomyIds: [topicId],
      });
      const id = result.id as number;
      addDecryptedEntry({
        id, content, metadata, isEncrypted: true,
        createdAt: new Date(result.createdAt as string),
        updatedAt: new Date((result.updatedAt || result.createdAt) as string),
      });
      push({ role: 'note', text: `Saved to ${cmd.topic.name}${estimated ? ' with AI nutrient estimates' : ''}.`, savedEntryId: id });
    } catch (err) {
      console.error('Chat save failed:', err);
      push({ role: 'note', error: true, text: 'That didn’t save — try again.' });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy || paused || minorLocked) return;
    setInput('');

    // Every three hours, remind in the thread that this is an AI
    if (reminderDue(disclosedAtRef.current)) {
      disclosedAtRef.current = Date.now();
      push({ role: 'note', text: AI_REMINDER });
    }

    if (parseSaveCommand(text, topicRefs).kind !== 'none') { await handleSave(text); return; }

    if (!chatOn) {
      push({ role: 'user', text }, blocked
        ? { role: 'note', text: 'In-App AI chat is turned off for this account.' }
        : aiReady
          ? { role: 'note', text: 'Turn on the chat first.' }
          : { role: 'note', text: 'Set up In-App AI to chat.', settingsLink: true });
      return;
    }

    const history: ChatTurn[] = [...messages, { id: 0, role: 'user' as const, text }]
      .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => (m.role === 'user' || m.role === 'assistant') && !m.error)
      .filter(m => parseSaveCommand(m.text, topicRefs).kind === 'none')
      .map(m => ({ role: m.role, content: m.text }));
    push({ role: 'user', text });
    setBusy(true);
    try {
      // Screening: the local pattern check, and the classifier through the
      // user's key in parallel with the reply (used only if nothing is found)
      const pattern = patternScreen(text);
      if (pattern.kind === 'eating_disorder') eatingSafeRef.current = true;
      const safeNow = safeModeRef.current || pattern.rating !== 'none';
      const replyP = generateReply(history, safeNow)
        .then(r => ({ ok: true as const, r }), (e: unknown) => ({ ok: false as const, e }));
      const classified = await classifyRisk(history).catch(() => NO_RISK);
      const risk = maxRisk(pattern, classified);

      // A likely minor (the local check or the classifier): the model's
      // age-rules reply if it gave one, else a fixed one — then pause for good
      if (minorPattern(text) || classified.minor) {
        const res = await replyP;
        const tagged = res.ok ? stripMinorTag(res.r) : null;
        const safe = tagged?.tagged && tagged.text && !replyPatternScreen(tagged.text);
        push({ role: 'assistant', text: safe ? tagged!.text : MINOR_FALLBACK_REPLY });
        if (risk.rating !== 'none') showCrisis(risk);
        lockForMinor();
        return;
      }

      // Urgent: pause, with the full card (911 first) pinned for the session
      if (risk.rating === 'urgent') {
        showCrisis(risk);
        setPaused({ history, kind: risk.kind });
        return;
      }
      // Concern / elevated: the reply goes on (under the safe rules) and a
      // quiet support notice follows it, so the conversation isn't interrupted
      markRisk(risk);
      let res = await replyP;
      if (risk.rating !== 'none' && !safeNow) {
        res = await generateReply(history, true).then(r => ({ ok: true as const, r }), (e: unknown) => ({ ok: false as const, e }));
      }
      let withheld: RiskKind | null = null;
      try {
        if (!res.ok) throw res.e;
        withheld = await deliver(res.r, history, risk);
      } catch (err) {
        push({ role: 'note', error: true, text: err instanceof Error ? err.message : 'In-App AI didn’t answer — try again.' });
      }
      if (risk.rating !== 'none' || withheld) {
        showCrisis(risk.rating !== 'none' ? risk : { rating: 'concern', kind: withheld }, { withheld: !!withheld });
      }
    } catch (err) {
      push({ role: 'note', error: true, text: err instanceof Error ? err.message : 'In-App AI didn’t answer — try again.' });
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
  };

  const useSuggestion = (cmd: string) => {
    setInput(cmd);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <>
      {open && (
        <Panel $pos={pos} role="dialog" aria-label="In-App AI chat">
          <Head>
            <Title>In-App AI<span>· Not a person.</span></Title>
            {messages.length > 0 && (
              <HeadBtn type="button" onClick={() => { setMessages([]); setPaused(null); disclosedAtRef.current = Date.now(); }}>Clear</HeadBtn>
            )}
            <HeadBtn type="button" onClick={() => setOpen(false)} aria-label="Close chat">
              <Icon name="x" size={18} strokeWidth={2} aria-hidden="true" />
            </HeadBtn>
          </Head>
          {aiReady && !blocked && !consented ? (
            <Consent>
              <h3>Before you chat</h3>
              <ul>
                <li>{AI_DISCLOSURE}</li>
                <li>The chat is for adults 18 and over.</li>
                <li>Your messages go to the AI provider you chose in Settings, under its terms and data rules. Chronicles doesn’t keep the chat unless you type <code>/save</code>.</li>
                <li>Every message is screened for signs of suicide, self-harm or eating disorder risk. If one appears, crisis resources appear under the reply, starting with the 988 Suicide &amp; Crisis Lifeline; for the most serious signs, the chat pauses.</li>
                <li>Chronicles records only that crisis resources were shown — the date, the rating and the kind of risk. Never what you wrote, or that it was you.</li>
                <li>The AI isn’t a therapist, doctor or crisis counselor, and it can’t contact anyone for you. In immediate danger, call 911.</li>
              </ul>
              <Checkbox label="I’m 18 or older" checked={ageOk} onChange={e => setAgeOk(e.target.checked)} />
              <div>
                <LinkBtn type="button" style={{ marginLeft: 0 }} onClick={() => { navigate('/settings'); setOpen(false); }}>
                  Read the full safety protocol
                </LinkBtn>
                {' '}in Settings → In-App AI.
              </div>
              {consentError && <ErrorText role="alert">{consentError}</ErrorText>}
              <ConsentActions>
                <PillButton type="button" $variant="neutral" onClick={() => setOpen(false)}>Not now</PillButton>
                <PillButton type="button" disabled={!ageOk} onClick={() => void giveConsent()}>Turn on chat</PillButton>
              </ConsentActions>
            </Consent>
          ) : (<>
          {pinned && (paused ? (
            <CrisisCard urgent paused fill kind={pinned.kind} style={{ margin: '12px' }} />
          ) : (
            <CrisisCard compact kind={pinned.kind} />
          ))}
          {/* While paused, the urgent card takes the thread's place (it comes back after Keep talking) */}
          {!paused && <Log ref={logRef} aria-live="polite">
            {messages.length === 0 && (
              <Empty>
                <p>
                {AI_DISCLOSURE}{' '}
                {blocked ? 'In-App AI chat is turned off for this account.'
                  : aiReady ? 'It’s here to help with Chronicles: estimating calories, sorting tasks, and thinking through entries. It isn’t a companion or a counselor. This chat isn’t saved and the AI cannot see anything in your journal.' : 'Set up In-App AI in Settings to chat.'}
                </p>
                <p>To keep something, type <code>/save topic text</code> — it becomes a journal entry — or <code>/save chat</code> to keep the whole conversation.</p>
              </Empty>
            )}
            {messages.map(m => m.role === 'crisis' ? (
              <SupportNotice key={m.id} kind={m.kind ?? null} withheld={m.withheld} />
            ) : (
              <Msg key={m.id} $role={m.role}>
                {m.error ? <ErrorText>{m.text}</ErrorText>
                  : m.role === 'assistant' ? renderReply(m.text, useSuggestion)
                  : m.text}
                {m.savedEntryId !== undefined && (
                  <LinkBtn type="button" onClick={() => { openInJournal(m.savedEntryId!); setOpen(false); }}>Open</LinkBtn>
                )}
                {m.settingsLink && (
                  <LinkBtn type="button" onClick={() => { navigate('/settings'); setOpen(false); }}>Open Settings</LinkBtn>
                )}
              </Msg>
            ))}
            {busy && (
              <Msg $role="assistant" role="status" aria-label="In-App AI is replying">
                <Typing aria-hidden="true"><span /><span /><span /></Typing>
              </Msg>
            )}
          </Log>}
          {/* While paused, the message bar holds Keep talking — always in view, never scrolled away */}
          {minorLocked ? (
            <Composer>
              <PausedNote>This chat is for adults. The account owner can resume it with their password.</PausedNote>
              <PillButton type="button" onClick={lock}>Lock Chronicles</PillButton>
            </Composer>
          ) : paused ? (
            <Composer>
              <PausedNote>Chat paused</PausedNote>
              <PillButton type="button" onClick={() => void keepTalking()}>Keep talking</PillButton>
            </Composer>
          ) : (
            <Composer>
              <Input
                ref={inputRef}
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={chatOn ? 'Message, or /save topic text' : '/save topic text'}
                aria-label="Message"
              />
              <PillButton type="button" onClick={() => void send()} disabled={busy || !input.trim()} style={{ minWidth: 0, padding: '9px 16px' }}>
                Send
              </PillButton>
            </Composer>
          )}
          </>)}
        </Panel>
      )}
      <Bubble
        $pos={pos}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close In-App AI' : 'Open In-App AI'}
        aria-expanded={open}
      >
        {open
          ? <Icon name="x" size={22} strokeWidth={2} aria-hidden="true" />
          : <MaterialIcon $size={26} aria-hidden="true">forum</MaterialIcon>}
      </Bubble>
    </>
  );
}
