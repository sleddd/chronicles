import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithTheme } from '../testUtils';

vi.mock('../../contexts/EncryptionContext.js', () => ({
  useEncryption: () => ({ encryptBytes: vi.fn(async () => ({ ciphertext: new ArrayBuffer(16), iv: 'aXZpdml2aXZpdml2' })) }),
}));
vi.mock('../../services/api.js', () => ({
  settings: { upsert: vi.fn(async () => ({})), remove: vi.fn(async () => ({})) },
}));
vi.mock('../../stores/aiChatStore.js', () => ({
  useAiChatStore: (sel: (s: unknown) => unknown) => sel({ status: null, load: async () => {}, withdraw: async () => {} }),
}));

import { AiSettings } from '../../components/organisms/AiSettings.js';
import { setAiConfig, isAiReady, isAiFeatureEnabled, getAiConfigValue, DEFAULT_AI_CONFIG } from '../../services/aiAssistant.js';
import { setEgressAccount, aiChosenHere, recordAiChoice, aiFeatureChosenHere } from '../../services/deviceConsent.js';
import { AI_SHARING_CHECKS } from '../../utils/chatDisclosure.js';
import { settings as settingsApi } from '../../services/api.js';

const cfg = { ...DEFAULT_AI_CONFIG, enabled: true, provider: 'openai' as const, model: 'gpt-5-mini', apiKey: 'sk-test' };

beforeEach(() => {
  localStorage.clear();
  setEgressAccount('tag-settings');
});
afterEach(() => { setAiConfig(null, null); setEgressAccount(null); });

describe('In-App AI settings on a browser that never turned AI on', () => {
  it('says AI is on but not used here, and Turn on here records the choice', async () => {
    setAiConfig(cfg, null);
    expect(isAiReady()).toBe(false);
    render(<AiSettings />);
    expect(screen.getByText(/On, but not used from this browser/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on here' }));
    expect(aiChosenHere()).toBe(true);
    await waitFor(() => expect(screen.queryByText(/On, but not used from this browser/)).toBeNull());
    expect(isAiReady()).toBe(true);
  });
});

describe('AI task planning and AI insights switches', () => {
  beforeEach(() => { vi.mocked(settingsApi.upsert).mockClear(); recordAiChoice(true); setAiConfig(cfg, null); });

  it('switching one on opens its notice and saves nothing until both boxes are ticked and Turn on is pressed', async () => {
    renderWithTheme(<AiSettings />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'AI task planning' }));
    expect(screen.getByText('Read this before you turn it on')).toBeTruthy();
    expect(settingsApi.upsert).not.toHaveBeenCalled();
    expect(isAiFeatureEnabled('aiPlan')).toBe(false);

    const turnOn = screen.getByRole('button', { name: 'Turn on' }) as HTMLButtonElement;
    expect(turnOn.disabled).toBe(true);
    for (const label of AI_SHARING_CHECKS) fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(turnOn);

    await waitFor(() => expect(settingsApi.upsert).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(isAiFeatureEnabled('aiPlan')).toBe(true));
    expect(aiFeatureChosenHere('aiPlan')).toBe(true);
    // The other feature is untouched
    expect(getAiConfigValue()?.insightsEnabled).toBe(false);
    expect(aiFeatureChosenHere('aiInsights')).toBe(false);
  });

  it('Not now leaves it off', () => {
    renderWithTheme(<AiSettings />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'AI insights' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Read this before you turn it on')).toBeNull();
    expect(settingsApi.upsert).not.toHaveBeenCalled();
    expect(isAiFeatureEnabled('aiInsights')).toBe(false);
  });

  it('on in the saved config is not enough in a browser that never agreed', async () => {
    setAiConfig({ ...cfg, planEnabled: true }, null);
    expect(isAiFeatureEnabled('aiPlan')).toBe(false);
    renderWithTheme(<AiSettings />);
    expect(screen.getByText('On, but not used from this browser. Read the notice here to use it, or turn it off everywhere.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on here' }));
    expect(screen.getByText('Read this before you turn it on')).toBeTruthy();
    expect(isAiFeatureEnabled('aiPlan')).toBe(false);
  });

  it('can be turned off from a browser that never agreed, without agreeing first', async () => {
    setAiConfig({ ...cfg, planEnabled: true }, null);
    renderWithTheme(<AiSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(settingsApi.upsert).toHaveBeenCalled());
    expect(screen.getByRole('checkbox', { name: 'AI task planning' })).not.toBeChecked();
    expect(isAiFeatureEnabled('aiPlan')).toBe(false);
  });

  it('switching it off saves at once and ends this browser’s agreement', async () => {
    renderWithTheme(<AiSettings />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'AI insights' }));
    for (const label of AI_SHARING_CHECKS) fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(isAiFeatureEnabled('aiInsights')).toBe(true));
    fireEvent.click(screen.getByRole('checkbox', { name: 'AI insights' }));
    await waitFor(() => expect(getAiConfigValue()?.insightsEnabled).toBe(false));
    expect(aiFeatureChosenHere('aiInsights')).toBe(false);
  });
});
