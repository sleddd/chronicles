import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadAiPrivacy } from '../../services/aiPrivacy.js';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { AiInsights } from '@/components/organisms/AiInsights';
import { useEntriesStore } from '@/stores/entriesStore';

const ai = vi.hoisted(() => ({ aiFeatureJson: vi.fn(), classifyFeatureReply: vi.fn(), aiProviderName: () => 'Claude (Anthropic API)' }));
vi.mock('@/services/aiAssistant', () => ai);
vi.mock('@/services/analyticsQueue', () => ({ queueAnalyticsEvent: vi.fn() }));
vi.mock('@/utils/clipboard', () => ({ copyText: vi.fn().mockResolvedValue(true) }));

const JOURNAL = 7;
const entry = (id: number, topic: number, text: string, daysAgo = 1) => ({
  id, content: `<p>${text}</p>`, isEncrypted: true,
  metadata: { _taxonomyId: topic },
  createdAt: new Date(Date.now() - daysAgo * 86400000), updatedAt: new Date(),
});
const ANSWER = JSON.stringify({ reflection: 'You keep returning to rest.', prompts: ['What would rest look like this week?'], chatSuggestions: ['Help me plan a quiet day'] });

const open = (onWrite = vi.fn()) => {
  renderWithTheme(<AiInsights onWrite={onWrite} trigger={o => <button type="button" onClick={o}>AI insights</button>} />);
  fireEvent.click(screen.getByRole('button', { name: 'AI insights' }));
  return onWrite;
};

describe('AiInsights', () => {
  beforeEach(() => {
    // The "Don't share with AI" choices have been read (until then everything is kept from AI)
    loadAiPrivacy({}, {}, true);
    ai.aiFeatureJson.mockReset().mockResolvedValue(ANSWER);
    ai.classifyFeatureReply.mockReset().mockResolvedValue(null);
    useEntriesStore.setState({
      allTopics: [{ id: JOURNAL, name: 'Journal' }, { id: 8, name: 'Symptom' }],
      decryptedEntries: [entry(1, JOURNAL, 'Walked by the river'), entry(2, 8, 'Headache again'), entry(3, JOURNAL, 'Long ago', 20)],
    } as never);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('asks first, every time, listing what will be shared, and Cancel sends nothing', () => {
    open();
    expect(screen.getByRole('alert')).toHaveTextContent('Your unencrypted data is about to be shared with Claude (Anthropic API).');
    expect(screen.getByText(/^1 journal entry/)).toBeInTheDocument();
    expect(ai.aiFeatureJson).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(ai.aiFeatureJson).not.toHaveBeenCalled();
    // Pressed again: asked again
    fireEvent.click(screen.getByRole('button', { name: 'AI insights' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('sends only Journal entries from the period, and stores nothing', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    open();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('You keep returning to rest.')).toBeInTheDocument();
    const [feature, , prompt] = ai.aiFeatureJson.mock.calls[0] as [string, string, string];
    expect(feature).toBe('aiInsights');
    expect(prompt).toContain('Walked by the river');
    expect(prompt).not.toContain('Headache');
    expect(prompt).not.toContain('Long ago');
    expect(local).not.toHaveBeenCalled();
  });

  it('a wider period sends more, after showing it', () => {
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'Last 30 days' }));
    expect(screen.getByText(/^2 journal entries/)).toBeInTheDocument();
  });

  it('Write about this hands the prompt on and closes', async () => {
    const onWrite = open();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Write about this' }));
    expect(onWrite).toHaveBeenCalledWith('What would rest look like this week?');
    expect(screen.queryByText('You keep returning to rest.')).not.toBeInTheDocument();
  });

  it('withholds a harmful answer and shows where to find support', async () => {
    ai.aiFeatureJson.mockResolvedValue(JSON.stringify({ reflection: 'The most painless way to die is an overdose of pills.', prompts: [], chatSuggestions: [] }));
    ai.classifyFeatureReply.mockResolvedValue('suicide');
    open();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.getByText(/support is available/i)).toBeInTheDocument());
    expect(screen.queryByText(/painless/)).not.toBeInTheDocument();
  });

  it('says so when the request fails, and nothing is shown', async () => {
    ai.aiFeatureJson.mockRejectedValue(new Error('Claude rejected the API key'));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('Claude rejected the API key')).toBeInTheDocument();
  });
});
