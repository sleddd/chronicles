import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({
  status: { consentAt: '2026-10-18T12:00:00Z', consentVersion: 1, blocked: false } as {
    consentAt: string | null; consentVersion: number | null; blocked: boolean;
  },
}));

vi.mock('@/hooks/useAiReady', () => ({ useAiReady: () => true }));
vi.mock('@/hooks/useOpenInJournal', () => ({ useOpenInJournal: () => vi.fn() }));
vi.mock('@/contexts/EncryptionContext', () => ({ useEncryption: () => ({ encryptPost: vi.fn() }) }));
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
vi.mock('@/services/api', () => ({
  entries: { create: vi.fn() },
  analytics: { crisisCard: vi.fn().mockResolvedValue({ ok: true }) },
  aiChat: {
    status: vi.fn(async () => state.status),
    consent: vi.fn(async () => {
      state.status = { consentAt: '2026-10-18T12:00:00Z', consentVersion: 1, blocked: false };
      return state.status;
    }),
    withdraw: vi.fn(),
  },
}));

import { AiChat } from '@/components/organisms/AiChat';
import { chatReply, classifyRisk, classifyReply } from '@/services/aiAssistant';
import { analytics, aiChat } from '@/services/api';
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
    state.status = { consentAt: '2026-10-18T12:00:00Z', consentVersion: 1, blocked: false };
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
    expect(aiChat.consent).toHaveBeenCalledWith(1);
    expect(await screen.findByLabelText('Message')).toBeInTheDocument();
  });

  it('shows a plain reply when nothing is found', async () => {
    openChat();
    await send('What should I cook tonight?');
    expect(await screen.findByText('Here to help.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Crisis resources')).not.toBeInTheDocument();
    expect(analytics.crisisCard).not.toHaveBeenCalled();
  });

  it('concern: shows the card above a reply written under the safe rules', async () => {
    (classifyRisk as any).mockResolvedValue({ rating: 'concern', kind: 'eating_disorder' });
    openChat();
    await send('I feel bad about my body lately');
    expect(await screen.findByText('Here to help.')).toBeInTheDocument();
    expect(screen.getByLabelText('Crisis resources')).toBeInTheDocument();
    expect(analytics.crisisCard).toHaveBeenCalledTimes(1);
    expect(analytics.crisisCard).toHaveBeenCalledWith('concern', 'eating_disorder');
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
    expect(analytics.crisisCard).toHaveBeenCalledWith('elevated', 'suicide');
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
    expect(analytics.crisisCard).toHaveBeenCalledWith('urgent', 'suicide');
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
    expect(analytics.crisisCard).toHaveBeenCalledTimes(1);
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
    await waitFor(() => expect(analytics.crisisCard).toHaveBeenCalledWith('concern', 'suicide'));
  });

  it('tells a blocked account the chat is off', async () => {
    state.status = { consentAt: null, consentVersion: null, blocked: true };
    openChat();
    expect(await screen.findByText(/turned off for this account/)).toBeInTheDocument();
  });
});
