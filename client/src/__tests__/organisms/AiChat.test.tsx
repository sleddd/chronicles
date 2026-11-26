import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({
  status: { consentAt: '2026-10-18T12:00:00Z', consentVersion: 2, blocked: false } as {
    consentAt: string | null; consentVersion: number | null; blocked: boolean;
    aiUserId?: string;
    enforcement?: { level: string; pausedUntil: string | null; refusals24h: number; refusals30d: number };
  },
}));

vi.mock('@/hooks/useAiReady', () => ({ useAiReady: () => true }));
vi.mock('@/hooks/useOpenInJournal', () => ({ useOpenInJournal: () => vi.fn() }));
const endSessionFn = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/EncryptionContext', () => ({ useEncryption: () => ({ encryptPost: vi.fn() }) }));
vi.mock('@/hooks/useSignOut', () => ({ useEndSession: () => endSessionFn, useSignOut: () => vi.fn() }));
vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ topics: [], addDecryptedEntry: vi.fn() }),
}));
vi.mock('@/services/aiAssistant', () => ({
  chatReply: vi.fn(),
  classifyRisk: vi.fn(),
  classifyReply: vi.fn(),
  getAiConfigValue: () => ({ chatNotes: '' }),
  autoNutritionOnSave: vi.fn(),
}));
vi.mock('@/services/analyticsQueue', () => ({ queueAnalyticsEvent: vi.fn() }));
vi.mock('@/services/api', () => ({
  entries: { create: vi.fn() },
  aiChat: {
    status: vi.fn(async () => state.status),
    consent: vi.fn(async () => {
      state.status = { consentAt: '2026-10-18T12:00:00Z', consentVersion: 2, blocked: false };
      return state.status;
    }),
    withdraw: vi.fn(),
  },
}));

import { AiChat } from '@/components/organisms/AiChat';
import { chatReply, classifyRisk, classifyReply } from '@/services/aiAssistant';
import { aiChat } from '@/services/api';
import { queueAnalyticsEvent } from '@/services/analyticsQueue';

const queued = (event: string) => (queueAnalyticsEvent as any).mock.calls.filter((c: any[]) => c[0].event === event);
import { useAiChatStore } from '@/stores/aiChatStore';

const NONE = { rating: 'none', kind: null };
Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;

function openChat() {
  render(<MemoryRouter><AiChat /></MemoryRouter>);
  fireEvent.click(screen.getByLabelText('Open In-App AI'));
}

async function send(text: string) {
  const box = await screen.findByLabelText('Message');
  fireEvent.change(box, { target: { value: text } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })); });
}

describe('AiChat safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.status = { consentAt: '2026-10-18T12:00:00Z', consentVersion: 2, blocked: false };
    useAiChatStore.setState({ status: null, loadError: false });
    (chatReply as any).mockResolvedValue('Here to help.');
    (classifyRisk as any).mockResolvedValue(NONE);
    (classifyReply as any).mockResolvedValue(null);
  });

  it('shows the header disclosure', () => {
    openChat();
    expect(screen.getByText('· Not a person.')).toBeInTheDocument();
  });

  it('asks for 18+ consent before the chat can be used', async () => {
    state.status = { consentAt: null, consentVersion: null, blocked: false };
    openChat();
    expect(await screen.findByText('Before you chat')).toBeInTheDocument();
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
    const turnOn = screen.getByRole('button', { name: 'Turn on chat' });
    expect(turnOn).toBeDisabled();
    fireEvent.click(screen.getByLabelText('I’m 18 or older'));
    await act(async () => { fireEvent.click(turnOn); });
    expect(aiChat.consent).toHaveBeenCalledWith(2);
    expect(await screen.findByLabelText('Message')).toBeInTheDocument();
  });

  it('shows a plain reply when nothing is found', async () => {
    openChat();
    await send('What should I cook tonight?');
    expect(await screen.findByText('Here to help.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Crisis resources')).not.toBeInTheDocument();
    expect(queued('crisis_card_shown')).toHaveLength(0);
  });

  it('shows the medical note once a session when a medical question comes up', async () => {
    openChat();
    await send('What should I cook tonight?');
    expect(screen.queryByText(/is not a doctor and can’t give medical advice/)).not.toBeInTheDocument();
    await send('Can I take ibuprofen with my blood pressure medication?');
    expect(await screen.findByText(/is not a doctor and can’t give medical advice/)).toBeInTheDocument();
    await send('What dose is usual?');
    expect(screen.getAllByText(/is not a doctor and can’t give medical advice/)).toHaveLength(1);
  });

  it('concern: shows the card above a reply written under the safe rules', async () => {
    (classifyRisk as any).mockResolvedValue({ rating: 'concern', kind: 'eating_disorder' });
    openChat();
    await send('I feel bad about my body lately');
    expect(await screen.findByText('Here to help.')).toBeInTheDocument();
    expect(screen.getByLabelText('Crisis resources')).toBeInTheDocument();
    expect(queued('crisis_card_shown')).toHaveLength(1);
    expect(queueAnalyticsEvent).toHaveBeenCalledWith({ event: 'crisis_card_shown', rating: 'concern', kind: 'eating_disorder' });
    const lastSystem = (chatReply as any).mock.calls.at(-1)[0] as string;
    expect(lastSystem).toContain('SAFETY MODE');
  });

  it('elevated: no pause — the reply, then a quiet support notice after it', async () => {
    openChat();
    await send('I want to kill myself');
    const reply = await screen.findByText('Here to help.');
    const notice = screen.getByLabelText('Crisis resources');
    expect(reply.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.textContent).toContain('If you or someone you know is having a difficult time, support is available.');
    expect(screen.queryByRole('button', { name: 'Keep talking' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message')).not.toBeDisabled();
    expect(queueAnalyticsEvent).toHaveBeenCalledWith({ event: 'crisis_card_shown', rating: 'elevated', kind: 'suicide' });
    expect((chatReply as any).mock.calls.at(-1)[0]).toContain('SAFETY MODE');
  });

  it('Find resources opens the help chips', async () => {
    (classifyRisk as any).mockResolvedValue({ rating: 'concern', kind: 'eating_disorder' });
    openChat();
    await send('I feel bad about my body');
    await screen.findByText('Here to help.');
    expect(screen.queryByRole('link', { name: 'Call 988' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Find resources/ }));
    expect(screen.getByRole('link', { name: 'Call 988' })).toHaveAttribute('href', 'tel:988');
    const labels = screen.getAllByRole('link').map(a => a.textContent);
    expect(labels.indexOf('Eating disorder helpline')).toBeLessThan(labels.indexOf('Text HOME to 741741'));
    expect(labels).toContain('Call 911');
  });

  it('urgent: pins the card with 911 first, and it stays through Clear', async () => {
    (classifyRisk as any).mockResolvedValue({ rating: 'urgent', kind: 'suicide' });
    openChat();
    await send('I have a plan');
    const card = await screen.findByLabelText('Crisis resources');
    expect(card.textContent?.indexOf('In danger right now')).toBeLessThan(card.textContent!.indexOf('988'));
    expect(queueAnalyticsEvent).toHaveBeenCalledWith({ event: 'crisis_card_shown', rating: 'urgent', kind: 'suicide' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Keep talking' })); });
    await screen.findByText('Here to help.');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Crisis resources').textContent).toContain('Help is here');
  });

  it('withholds a harmful reply behind the card', async () => {
    (chatReply as any).mockResolvedValue('Some talk about self-harm.');
    (classifyReply as any).mockResolvedValue('self_harm');
    openChat();
    await send('Tell me something');
    expect(await screen.findByLabelText('Crisis resources')).toBeInTheDocument();
    expect(screen.queryByText('Some talk about self-harm.')).not.toBeInTheDocument();
    expect(screen.getByText(/withheld because it wasn’t safe/)).toBeInTheDocument();
    expect(queued('crisis_card_shown')).toHaveLength(1);
  });

  it('skips the reply review for ordinary replies', async () => {
    openChat();
    await send('What should I cook tonight?');
    await screen.findByText('Here to help.');
    expect(classifyReply).not.toHaveBeenCalled();
  });

  it('withholds a reply on a sensitive topic when its review fails', async () => {
    (chatReply as any).mockResolvedValue('Something about an overdose.');
    (classifyReply as any).mockRejectedValue(new Error('offline'));
    openChat();
    await send('Tell me something');
    expect(await screen.findByText(/withheld because it wasn’t safe/)).toBeInTheDocument();
    expect(screen.queryByText('Something about an overdose.')).not.toBeInTheDocument();
  });

  it('writes the first reply in safe mode when the pattern check hits', async () => {
    openChat();
    await send('I wish I didn’t wake up');
    await screen.findByText('Here to help.');
    expect(chatReply).toHaveBeenCalledTimes(1);
    expect((chatReply as any).mock.calls[0][0]).toContain('SAFETY MODE');
  });

  it('adds the eating rules once eating risk appears', async () => {
    (classifyRisk as any).mockResolvedValue({ rating: 'concern', kind: 'eating_disorder' });
    openChat();
    await send('I feel guilty after eating');
    await screen.findByText('Here to help.');
    expect((chatReply as any).mock.calls.at(-1)[0]).toContain('calorie counts');
  });

  it('falls back to the pattern check when the classifier fails', async () => {
    (classifyRisk as any).mockRejectedValue(new Error('offline'));
    openChat();
    await send('I wish I didn’t wake up');
    await waitFor(() => expect(queueAnalyticsEvent).toHaveBeenCalledWith({ event: 'crisis_card_shown', rating: 'concern', kind: 'suicide' }));
  });

  it('minor (local check): shows the tagged reply without the tag and pauses for good', async () => {
    (chatReply as any).mockResolvedValue('[[MINOR]]\nThank you for telling me. Chronicles is made for grown-ups.');
    openChat();
    await send('No. I am eight');
    expect(await screen.findByText('Thank you for telling me. Chronicles is made for grown-ups.')).toBeInTheDocument();
    expect(screen.queryByText(/\[\[MINOR\]\]/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
    expect(screen.getByText('This chat is for adults. The account owner can resume it by signing in again.')).toBeInTheDocument();
    expect(queued('minor_detected')).toHaveLength(1);
    // The under-18 stop ends the session: the owner signs in again to a fresh chat
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(endSessionFn).toHaveBeenCalledWith('Signed out. Sign in again to carry on.');
  });

  it('minor (classifier): an untagged reply is replaced by the fixed one', async () => {
    (classifyRisk as any).mockResolvedValue({ rating: 'none', kind: null, minor: true });
    (chatReply as any).mockResolvedValue('Sure, let’s play a game!');
    openChat();
    await send('my teacher gave us homework at recess');
    expect(await screen.findByText(/Chronicles is made for grown-ups, so I can't keep chatting/)).toBeInTheDocument();
    expect(screen.queryByText('Sure, let’s play a game!')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('minor (model tag only): pauses too', async () => {
    (chatReply as any).mockResolvedValue('[[MINOR]]\nThis chat is only for grown-ups, though.');
    openChat();
    await send('i just want to chat');
    expect(await screen.findByText('This chat is only for grown-ups, though.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
    expect(queued('minor_detected')).toHaveLength(1);
  });

  it('tells a blocked account the chat is off', async () => {
    state.status = { consentAt: null, consentVersion: null, blocked: true };
    openChat();
    expect(await screen.findByText(/turned off for this account/)).toBeInTheDocument();
  });

  it('warned: one quiet line about declined requests, and the chat still works', async () => {
    state.status = { ...state.status, aiUserId: 'a'.repeat(32), enforcement: { level: 'warned', pausedUntil: null, refusals24h: 5, refusals30d: 5 } };
    openChat();
    expect(await screen.findByText('Some recent requests were declined by the AI. Repeated declined requests pause In-App AI for a day.')).toBeInTheDocument();
    await send('What should I cook tonight?');
    expect(await screen.findByText('Here to help.')).toBeInTheDocument();
  });

  it('paused: says until when, and sends nothing', async () => {
    const until = new Date(Date.now() + 20 * 3_600_000).toISOString();
    state.status = { ...state.status, aiUserId: 'a'.repeat(32), enforcement: { level: 'paused', pausedUntil: until, refusals24h: 10, refusals30d: 10 } };
    openChat();
    expect(await screen.findByText(/In-App AI is paused until .+\./)).toBeInTheDocument();
    expect(screen.queryByText('Before you chat')).not.toBeInTheDocument();
    await send('hello');
    expect(chatReply).not.toHaveBeenCalled();
    expect(classifyRisk).not.toHaveBeenCalled();
    expect(screen.getAllByText(/In-App AI is paused until/).length).toBeGreaterThan(0);
  });
});
