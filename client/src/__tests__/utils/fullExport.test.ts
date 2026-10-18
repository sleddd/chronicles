import { describe, it, expect } from 'vitest';
import { buildFullExport, openAllSettings, redactSecrets } from '@/utils/fullExport';

const enc = (v: unknown) => ({ ciphertext: btoa(JSON.stringify(v)), iv: 'iv' });
const decrypt = async (ct: ArrayBuffer) => ct; // test double: "ciphertext" is the plaintext bytes

describe('fullExport', () => {
  it('removes AI, AWS and R2 credentials anywhere in a value', () => {
    expect(redactSecrets({ provider: 'anthropic', apiKey: 'sk', nested: { awsSecretAccessKey: 'x', keep: 1 }, chatNotes: 'Call me Sam' }))
      .toEqual({ provider: 'anthropic', nested: { keep: 1 }, chatNotes: 'Call me Sam' });
  });

  it('opens sealed settings, keeps plain ones, and reports ones that won’t open', async () => {
    const rows = [
      { key: 'aiConfig', value: enc({ chatNotes: 'Notes', apiKey: 'secret' }) },
      { key: 'themeMode', value: 'dark' },
      { key: 'broken', value: { ciphertext: '!!!', iv: 'x' } },
    ];
    const { settings, unreadable } = await openAllSettings(rows, decrypt);
    expect(settings.aiConfig).toEqual({ chatNotes: 'Notes' });
    expect(settings.themeMode).toBe('dark');
    expect(unreadable).toEqual(['broken']);
  });

  it('bundles every part', () => {
    const out = buildFullExport({ entries: [1], topics: [2], doseLogs: [3], settings: { a: 1 }, finance: { f: 1 }, now: new Date('2026-10-18T00:00:00Z') });
    expect(out).toMatchObject({ kind: 'full-export', exportedAt: '2026-10-18T00:00:00.000Z', entries: [1], topics: [2], medicationDoseLogs: [3], settings: { a: 1 }, finance: { f: 1 } });
  });
});
