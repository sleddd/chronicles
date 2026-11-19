import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

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
import { setAiConfig, isAiReady, DEFAULT_AI_CONFIG } from '../../services/aiAssistant.js';
import { setEgressAccount, aiChosenHere } from '../../services/deviceConsent.js';

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
