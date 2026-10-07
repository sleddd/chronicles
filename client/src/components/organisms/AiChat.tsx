import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { Icon } from '../../../../design-system/components/core/Icon.jsx';
import { PillButton } from '../atoms/PillButton.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useAiReady } from '../../hooks/useAiReady.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { entries as entriesApi } from '../../services/api.js';
import { autoNutritionOnSave, chatReply, getAiConfigValue, type ChatTurn } from '../../services/aiAssistant.js';
import { mealForNow, nowTime } from '../../utils/foodLog.js';
import { toDateStr } from '../../utils/dateUtils.js';
import { chatSystemPrompt, parseSaveCommand, textToEntryHtml, type TopicRef } from '../../utils/chatSave.js';
import { getOrCreateJournalTopic } from '../../utils/getOrCreateJournalTopic.js';
import { parseChatMarkdown, type Inline } from '../../utils/chatMarkdown.js';
import { findBanned, limitEmojis, rewriteInstruction, scrubBanned } from '../../utils/chatStyle.js';

/* ── Styles (floating overlay: the one place a shadow is allowed) ── */

const Bubble = styled.button<{ $lifted: boolean }>`
  position: fixed;
  right: 24px;
  bottom: ${({ $lifted }) => ($lifted ? '88px' : '24px')};
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
  @media (max-width: 640px) { right: 16px; bottom: ${({ $lifted }) => ($lifted ? '80px' : '16px')}; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:hover { transform: none; } }
  @media print { display: none; }
`;

const Panel = styled.section<{ $lifted: boolean }>`
  position: fixed;
  right: 24px;
  bottom: ${({ $lifted }) => ($lifted ? '152px' : '88px')};
  z-index: 900;
  width: 380px;
  height: min(560px, calc(100dvh - 140px));
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
    bottom: ${({ $lifted }) => ($lifted ? '144px' : '80px')};
    height: min(70dvh, calc(100dvh - 120px));
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

/* Alternating bubbles: the user on the right in the accent tint, the assistant
   on the left in a sunken bubble; notes sit centred and quiet. */
const Msg = styled.div<{ $role: 'user' | 'assistant' | 'note' }>`
  max-width: ${({ $role }) => ($role === 'note' ? '100%' : '85%')};
  align-self: ${({ $role }) => ($role === 'user' ? 'flex-end' : $role === 'assistant' ? 'flex-start' : 'center')};
  padding: ${({ $role }) => ($role === 'note' ? '0 4px' : '9px 13px')};
  background: ${({ $role }) => ($role === 'user' ? 'var(--color-accent-subtle)' : $role === 'assistant' ? 'var(--bg-sunken)' : 'transparent')};
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

const Input = styled.textarea`
  flex: 1;
  min-height: 38px;
  max-height: 120px;
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

const Empty = styled.div`
  margin: auto 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-tertiary);
  code { font-family: var(--mono, monospace); font-size: 12px; color: var(--text-secondary); }
`;

/* ── Model ── */

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'note';
  text: string;
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
 * the page or locking the journal clears them. `/save <topic> <text>` saves
 * text as an encrypted journal entry (no AI involved, nothing sent anywhere
 * but the existing encrypted entries API).
 */
export function AiChat() {
  const aiReady = useAiReady();
  const topics = useEntriesStore(s => s.topics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const { encryptPost } = useEncryption();
  const openInJournal = useOpenInJournal();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Clear the journal's bottom save bar
  const lifted = location.pathname.startsWith('/journal');

  // "Journal" is the app's default home for notes — always offer it, creating
  // the topic on first save (JOURNAL_PLACEHOLDER_ID) if it doesn't exist yet
  const topicRefs: TopicRef[] = useMemo(() => {
    const refs = topics.map(t => ({ id: t.id, name: t.name }));
    if (!refs.some(t => t.name.toLowerCase() === 'journal')) refs.unshift({ id: JOURNAL_PLACEHOLDER_ID, name: 'Journal' });
    return refs;
  }, [topics]);

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

  const push = (...msgs: Omit<ChatMessage, 'id'>[]) =>
    setMessages(prev => [...prev, ...msgs.map(m => ({ ...m, id: nextId++ }))]);

  const handleSave = async (raw: string) => {
    const cmd = parseSaveCommand(raw, topicRefs);
    push({ role: 'user', text: raw });
    if (cmd.kind === 'help') {
      push({ role: 'note', text: 'Type /save, a topic, then the text — for example: /save Journal Felt calm after my walk today.' });
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
      const content = textToEntryHtml(cmd.text);
      const metadata: Record<string, unknown> = { _taxonomyId: topicId };
      // A meal saved from chat lands in the Meals log for today, with its
      // nutrients estimated by the AI (a failed estimate never blocks the save)
      let estimated = false;
      if (cmd.topic.name.toLowerCase() === 'meals') {
        const now = new Date();
        let cf: Record<string, unknown> = {
          mealDescription: cmd.text, mealType: mealForNow(now), consumedDate: toDateStr(now), consumedTime: nowTime(now), notes: '',
        };
        if (aiReady) {
          try {
            const filled = await autoNutritionOnSave(cmd.text, cf);
            if (filled) { cf = filled; estimated = true; }
          } catch (err) {
            console.warn('Nutrient estimate failed:', err);
          }
        }
        metadata._customFields = cf;
      }
      const encrypted = await encryptPost(content, metadata);
      const result = await entriesApi.create({
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
    if (!text || busy) return;
    setInput('');

    if (parseSaveCommand(text, topicRefs).kind !== 'none') { await handleSave(text); return; }

    if (!aiReady) {
      push({ role: 'user', text }, { role: 'note', text: 'Set up the AI assistant to chat.', settingsLink: true });
      return;
    }

    const history: ChatTurn[] = [...messages, { id: 0, role: 'user' as const, text }]
      .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => (m.role === 'user' || m.role === 'assistant') && !m.error)
      .filter(m => parseSaveCommand(m.text, topicRefs).kind === 'none')
      .map(m => ({ role: m.role, content: m.text }));
    push({ role: 'user', text });
    setBusy(true);
    try {
      const system = chatSystemPrompt(topicRefs.map(t => t.name), getAiConfigValue()?.chatNotes ?? '');
      let reply = (await chatReply(system, history)).trim();
      // House style: if a banned phrase slipped through, ask for one quiet
      // rewrite; whatever still remains is removed before display
      const found = findBanned(reply);
      if (found.length) {
        try {
          const rewritten = (await chatReply(system, [
            ...history, { role: 'assistant', content: reply }, { role: 'user', content: rewriteInstruction(found) },
          ])).trim();
          if (rewritten) reply = rewritten;
        } catch { /* keep the original; it's scrubbed below */ }
      }
      reply = limitEmojis(findBanned(reply).length ? scrubBanned(reply) : reply);
      push({ role: 'assistant', text: reply || '…' });
    } catch (err) {
      push({ role: 'note', error: true, text: err instanceof Error ? err.message : 'The assistant didn’t answer — try again.' });
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
        <Panel $lifted={lifted} role="dialog" aria-label="AI assistant chat">
          <Head>
            <Title>Assistant<span>Not saved</span></Title>
            {messages.length > 0 && <HeadBtn type="button" onClick={() => setMessages([])}>Clear</HeadBtn>}
            <HeadBtn type="button" onClick={() => setOpen(false)} aria-label="Close chat">
              <Icon name="x" size={18} strokeWidth={2} aria-hidden="true" />
            </HeadBtn>
          </Head>
          <Log ref={logRef} aria-live="polite">
            {messages.length === 0 && (
              <Empty>
                {aiReady ? 'Ask anything. This chat isn’t saved.' : 'Set up the AI assistant in Settings to chat.'}
                <br />To keep something, type <code>/save topic text</code> — it becomes a journal entry.
              </Empty>
            )}
            {messages.map(m => (
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
            {busy && <Msg $role="assistant" aria-label="Assistant is replying">…</Msg>}
          </Log>
          <Composer>
            <Input
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={aiReady ? 'Message, or /save topic text' : '/save topic text'}
              aria-label="Message"
            />
            <PillButton type="button" onClick={() => void send()} disabled={busy || !input.trim()} style={{ minWidth: 0, padding: '9px 16px' }}>
              Send
            </PillButton>
          </Composer>
        </Panel>
      )}
      <Bubble
        type="button"
        $lifted={lifted}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close assistant chat' : 'Open assistant chat'}
        aria-expanded={open}
      >
        {open
          ? <Icon name="x" size={22} strokeWidth={2} aria-hidden="true" />
          : <MaterialIcon $size={26} aria-hidden="true">forum</MaterialIcon>}
      </Bubble>
    </>
  );
}
