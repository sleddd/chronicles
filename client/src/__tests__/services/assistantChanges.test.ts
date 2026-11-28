import { describe, it, expect, vi, beforeEach } from 'vitest';

// What the Chronicles AI app overwrote: each kept version opened far enough to
// name it, and one put back shown in this tab. A version that can't be opened
// here is never offered to put back.

const api = vi.hoisted(() => ({ assistantChanges: { list: vi.fn(), restore: vi.fn(), remove: vi.fn(), clear: vi.fn() }, entries: { update: vi.fn() } }));
vi.mock('../../services/api.js', () => api);

const cipher = vi.hoisted(() => ({ decrypt: vi.fn(), decryptBytes: vi.fn(), encryptBytes: vi.fn() }));
vi.mock('../../services/recordCipher.js', () => ({ recordCipher: () => cipher }));
vi.mock('../../services/settingCipher.js', () => ({
  isSealed: (v: unknown) => !!v && typeof v === 'object' && 'ciphertext' in (v as object),
  openSetting: vi.fn(async (_k: string, v: { ciphertext: string }) => {
    if (v.ciphertext === 'old-key') throw new Error('no');
    return { h1: { '2026-11': '1' } };
  }),
}));
const privacy = vi.hoisted(() => ({ reconcileAiHidden: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../services/aiPrivacy.js', () => privacy);
const finance = vi.hoisted(() => ({ clearFinanceCache: vi.fn() }));
vi.mock('../../stores/financeStore.js', () => finance);
const habits = vi.hoisted(() => ({ setState: vi.fn() }));
vi.mock('../../stores/habitStore.js', () => ({ useHabitStore: habits }));
vi.mock('../../utils/habits.js', () => ({ parseHabitLog: (v: unknown) => v }));
vi.mock('../../hooks/useTodayDoses.js', () => ({ DOSES_CHANGED: 'chronicles:doses-changed' }));

const store = vi.hoisted(() => ({
  entries: [] as { id: number; content: string; metadata: Record<string, unknown> }[],
  update: vi.fn(),
  add: vi.fn(),
}));
vi.mock('../../stores/entriesStore.js', () => ({
  useEntriesStore: { getState: () => ({ decryptedEntries: store.entries, allTopics: [{ id: 3, name: 'task' }], updateDecryptedEntry: store.update, addDecryptedEntry: store.add }) },
}));

import { describeChange, restoreChange, loadChanges, HideNotKept } from '../../services/assistantChanges.js';
import type { AssistantChangeWire } from '../../services/api.js';

const wire = (over: Partial<AssistantChangeWire>): AssistantChangeWire =>
  ({ id: 1, kind: 'entry', ref: '5', savedAt: '2026-11-25T15:02:00Z', body: 'Yw==', bodyIv: 'aXY=', meta: 'bQ==', metaIv: 'aXY=', extra: null, ...over });
/** Stands in for the context's encryptPost. */
const encryptPost = vi.fn();
/** Stands in for the context's decryptPosts. */
const decryptPosts = vi.fn();
const opened = (content: string, metadata: Record<string, unknown>) =>
  decryptPosts.mockResolvedValue([{ id: 5, content, metadata, createdAt: new Date(), updatedAt: new Date(), isEncrypted: true }]);

describe('assistantChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.entries = [];
    privacy.reconcileAiHidden.mockResolvedValue(undefined);
  });

  describe('naming a kept version', () => {
    it('an entry by its topic and its first line', async () => {
      opened('<p>Call the dentist</p><p>notes</p>', { _taxonomyId: 3 });
      const c = await describeChange(wire({}), decryptPosts);
      expect(c).toMatchObject({ what: 'Task', name: 'Call the dentist', canRestore: true });
    });

    it('a dose by its medication, day and status', async () => {
      store.entries = [{ id: 9, content: '<p>Vitamin D</p>', metadata: {} }];
      cipher.decrypt.mockResolvedValue({ medicationPostId: 9, scheduledTime: '08:00', status: 'taken' });
      const c = await describeChange(wire({ kind: 'dose', ref: 'u-1', meta: null, metaIv: null, extra: { date: '2026-11-25' } }), decryptPosts);
      expect(cipher.decrypt).toHaveBeenCalledWith('dose', 'u-1|2026-11-25', 'Yw==', 'aXY=');
      expect(c).toMatchObject({ what: 'Dose', name: 'Vitamin D · 2026-11-25 · taken', canRestore: true });
    });

    it('a bill by its name, and the habit check-ins', async () => {
      cipher.decrypt.mockResolvedValue({ name: 'Internet' });
      expect(await describeChange(wire({ kind: 'bill', ref: 'b-1' }), decryptPosts)).toMatchObject({ what: 'Bill', name: 'Internet', canRestore: true });
      const habit = wire({ kind: 'setting', ref: 'habitLog', body: null, bodyIv: null, extra: { value: { ciphertext: 'x', iv: 'y', v: 2 } } });
      expect(await describeChange(habit, decryptPosts)).toMatchObject({ what: 'Habit check-ins', canRestore: true });
    });

    it('one this browser can’t open can’t be put back', async () => {
      decryptPosts.mockResolvedValue([{ id: 5, content: '[Decryption failed]', metadata: null }]);
      expect((await describeChange(wire({}), decryptPosts)).canRestore).toBe(false);
      cipher.decrypt.mockRejectedValue(new Error('OperationError'));
      expect((await describeChange(wire({ kind: 'bill', ref: 'b-1' }), decryptPosts)).canRestore).toBe(false);
      const oldKey = wire({ kind: 'setting', ref: 'habitLog', extra: { value: { ciphertext: 'old-key', iv: 'y', v: 2 } } });
      expect((await describeChange(oldKey, decryptPosts)).canRestore).toBe(false);
      // Any other setting isn't one the AI app can write
      expect((await describeChange(wire({ kind: 'setting', ref: 'aiConfig', extra: { value: { ciphertext: 'x' } } }), decryptPosts)).canRestore).toBe(false);
    });

    it('loads a page', async () => {
      opened('<p>A</p>', { _taxonomyId: 3 });
      api.assistantChanges.list.mockResolvedValue({ changes: [wire({ id: 4 }), wire({ id: 3 })], more: true });
      const page = await loadChanges(decryptPosts, 9);
      expect(api.assistantChanges.list).toHaveBeenCalledWith(9);
      expect(page.changes.map(c => c.id)).toEqual([4, 3]);
      expect(page.more).toBe(true);
    });
  });

  describe('putting one back', () => {
    it('never one that can’t be opened here', async () => {
      const c = { id: 1, kind: 'entry' as const, what: 'Entry', deleted: false, name: '', savedAt: '', canRestore: false, wire: wire({}) };
      await expect(restoreChange(c, decryptPosts, encryptPost)).rejects.toThrow();
      expect(api.assistantChanges.restore).not.toHaveBeenCalled();
    });

    it('an entry shows in the journal at once, with its own "Hide from AI" said either way', async () => {
      opened('<p>Old text</p>', { _taxonomyId: 3 });
      const c = await describeChange(wire({}), decryptPosts);
      api.assistantChanges.restore.mockResolvedValue(wire({}));
      await restoreChange(c, decryptPosts, encryptPost);
      expect(api.assistantChanges.restore).toHaveBeenCalledWith(1);
      expect(store.update).toHaveBeenCalledWith(5, { content: '<p>Old text</p>', metadata: { _taxonomyId: 3, _aiHidden: false } });
      expect(privacy.reconcileAiHidden).toHaveBeenCalled();
    });

    // The version put back is from before the AI app's change, and may be from
    // before the owner ticked Hide: putting it back must not share the entry again
    it('an entry hidden from AI now stays hidden, and the switch is saved onto the version put back', async () => {
      store.entries = [{ id: 5, content: '<p>New text</p>', metadata: { _taxonomyId: 3, _aiHidden: true } }];
      opened('<p>Old text</p>', { _taxonomyId: 3 });
      const c = await describeChange(wire({}), decryptPosts);
      api.assistantChanges.restore.mockResolvedValue(wire({}));
      const sealed = { contentEncrypted: 'c', contentIv: 'ci', metadataEncrypted: 'm', metadataIv: 'mi' };
      encryptPost.mockResolvedValue(sealed);
      await restoreChange(c, decryptPosts, encryptPost);
      expect(store.update).toHaveBeenCalledWith(5, { content: '<p>Old text</p>', metadata: { _taxonomyId: 3, _aiHidden: true } });
      expect(encryptPost).toHaveBeenCalledWith(5, '<p>Old text</p>', { _taxonomyId: 3, _aiHidden: true });
      expect(api.entries.update).toHaveBeenCalledWith(5, sealed);
    });

    it('says so when the switch couldn’t be saved (it still counts as hidden here)', async () => {
      store.entries = [{ id: 5, content: '<p>New text</p>', metadata: { _taxonomyId: 3, _aiHidden: true } }];
      opened('<p>Old text</p>', { _taxonomyId: 3 });
      const c = await describeChange(wire({}), decryptPosts);
      api.assistantChanges.restore.mockResolvedValue(wire({}));
      encryptPost.mockRejectedValue(new Error('offline'));
      await expect(restoreChange(c, decryptPosts, encryptPost)).rejects.toBeInstanceOf(HideNotKept);
      expect(store.update).toHaveBeenCalledWith(5, expect.objectContaining({ metadata: { _taxonomyId: 3, _aiHidden: true } }));
    });

    it('an entry the AI app deleted comes back into the journal, with the times it had', async () => {
      const deleted = wire({ id: 8, extra: { deleted: true, session: 2, createdAt: '2026-01-02T03:04:05.123456+00:00', updatedAt: '2026-11-20T10:00:00+00:00', topicIds: [] } });
      decryptPosts.mockImplementation(async (posts: { id: number; createdAt: Date; updatedAt: Date }[]) =>
        posts.map(p => ({ id: p.id, content: '<p>Call the dentist</p>', metadata: { _taxonomyId: 3 }, createdAt: p.createdAt, updatedAt: p.updatedAt, isEncrypted: true })));
      const c = await describeChange(deleted, decryptPosts);
      expect(c).toMatchObject({ what: 'Task', name: 'Call the dentist', deleted: true, canRestore: true });
      api.assistantChanges.restore.mockResolvedValue(deleted);
      await restoreChange(c, decryptPosts, encryptPost);
      expect(api.assistantChanges.restore).toHaveBeenCalledWith(8);
      expect(store.add).toHaveBeenCalledWith(expect.objectContaining({ id: 5, content: '<p>Call the dentist</p>' }));
      const added = store.add.mock.calls[0][0];
      expect(added.createdAt.toISOString()).toBe('2026-01-02T03:04:05.123Z');
      expect(added.updatedAt.toISOString()).toBe('2026-11-20T10:00:00.000Z');
      expect(store.update).not.toHaveBeenCalled();
      expect(privacy.reconcileAiHidden).toHaveBeenCalled();
      // An earlier version of an entry that is still there isn't one
      opened('<p>Old</p>', { _taxonomyId: 3 });
      expect((await describeChange(wire({}), decryptPosts)).deleted).toBe(false);
    });

    it('a dose, a bill and the habit check-ins refresh what shows them', async () => {
      const seen = vi.fn();
      window.addEventListener('chronicles:doses-changed', seen);
      const shown = (w: AssistantChangeWire) => ({ id: w.id, kind: w.kind, what: '', deleted: false, name: '', savedAt: '', canRestore: true, wire: w });
      const dose = wire({ kind: 'dose', ref: 'u-1', extra: { date: '2026-11-25' } });
      api.assistantChanges.restore.mockResolvedValue(dose);
      await restoreChange(shown(dose), decryptPosts, encryptPost);
      expect(seen).toHaveBeenCalled();
      window.removeEventListener('chronicles:doses-changed', seen);

      const bill = wire({ kind: 'bill', ref: 'b-1' });
      api.assistantChanges.restore.mockResolvedValue(bill);
      await restoreChange(shown(bill), decryptPosts, encryptPost);
      expect(finance.clearFinanceCache).toHaveBeenCalled();

      const habit = wire({ kind: 'setting', ref: 'habitLog', extra: { value: { ciphertext: 'x', iv: 'y', v: 2 } } });
      api.assistantChanges.restore.mockResolvedValue(habit);
      await restoreChange(shown(habit), decryptPosts, encryptPost);
      expect(habits.setState).toHaveBeenCalledWith({ log: { h1: { '2026-11': '1' } } });
    });
  });
});
