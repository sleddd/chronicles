import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// "Don't share with AI": topics, features and single entries no AI ever sees,
// and the list the server enforces for the Chronicles AI app.

const api = vi.hoisted(() => ({
  aiHidden: { list: vi.fn(), set: vi.fn(), updatedAt: vi.fn() },
  settings: { upsert: vi.fn(), getSome: vi.fn() },
}));
vi.mock('../../services/api.js', () => api);

const store = vi.hoisted(() => ({ entries: [] as { id: number; metadata: Record<string, unknown>; updatedAt?: Date }[], initialized: true }));
vi.mock('../../stores/entriesStore.js', () => ({
  useEntriesStore: { getState: () => ({ decryptedEntries: store.entries, isInitialized: store.initialized }) },
}));

// The sealed copy: "sealed" here is just { sealed: value }, and the rollback
// guard's memory is one number
const cipher = vi.hoisted(() => ({ seen: 0 }));
vi.mock('../../services/settingCipher.js', () => ({
  isSealed: (v: unknown) => !!v && typeof v === 'object' && 'sealed' in (v as object),
  openSetting: async (_k: string, v: { sealed: unknown }) => v.sealed,
  sealSetting: async (_k: string, value: unknown) => ({ sealed: value }),
  seenRevision: () => cipher.seen,
  trackGuardedSave: (_k: string, send: () => Promise<unknown>) => send(),
}));
vi.mock('../../services/recordCipher.js', () => ({
  recordCipher: () => ({ encryptBytes: vi.fn(), decryptBytes: vi.fn() }),
}));

import {
  parseAiPrivacy, isHiddenFromAi, visibleToAi, featureHiddenFromAi, loadAiPrivacy, getAiPrivacy, updateAiPrivacy,
  reconcileAiHidden, markHiddenBeforeCreate, markHiddenOnSave, clearAiPrivacy, aiPrivacyLoaded, aiPrivacyUnreadable,
  resetAiPrivacy, topicHiddenFromAi, newAiMarkBatch, flushAiMarks,
} from '../../services/aiPrivacy.js';
import { withAiHiddenKept, stampAiHidden } from '../../utils/aiHiddenFlag.js';

const JOURNAL = 1, THERAPY = 2, TASKS = 3;
const entry = (id: number, topic: number, extra: Record<string, unknown> = {}) => ({ id, metadata: { _taxonomyId: topic, ...extra } });
const NONE = { appEnabled: false, hiddenTopicIds: [], hiddenFeatures: [] };
/** Both stored copies say the same thing. */
const load = (value: Record<string, unknown> = {}) => loadAiPrivacy({ ...NONE, ...value }, { ...NONE, ...value }, true);
/** What the server holds, as GET /settings returns it. A save changes it, like the real one. */
let server: Record<string, unknown> = {};
const serverHolds = (sealed: Record<string, unknown> | null, readable: Record<string, unknown> = sealed ?? {}) => {
  server = { ...(sealed && { aiPrivacySealed: { sealed: { ...NONE, ...sealed } } }), aiPrivacy: { ...NONE, ...readable } };
  api.settings.getSome.mockImplementation(async () => Object.entries(server).map(([key, value]) => ({ key, value })));
  api.settings.upsert.mockImplementation(async (key: string, value: unknown) => { server[key] = value; return {}; });
};

describe('aiPrivacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAiPrivacy();
    cipher.seen = 0;
    store.entries = [];
    store.initialized = true;
    api.aiHidden.list.mockResolvedValue({ ids: [] });
    api.aiHidden.set.mockResolvedValue({ success: true });
    api.aiHidden.updatedAt.mockResolvedValue({ entries: [] });
    serverHolds({});
  });

  it('parses only well-formed values', () => {
    expect(parseAiPrivacy({ appEnabled: true, hiddenTopicIds: [2, 'x', -1], hiddenFeatures: ['doses', 'secrets'] }))
      .toEqual({ appEnabled: true, hiddenTopicIds: [2], hiddenFeatures: ['doses'] });
    expect(parseAiPrivacy(undefined)).toEqual(NONE);
  });

  describe('until the choices have been read', () => {
    it('everything counts as hidden from AI', () => {
      expect(aiPrivacyLoaded()).toBe(false);
      expect(isHiddenFromAi({ _taxonomyId: JOURNAL })).toBe(true);
      expect(isHiddenFromAi({ _taxonomyId: JOURNAL }, getAiPrivacy())).toBe(true);
      expect(visibleToAi([entry(1, JOURNAL)])).toEqual([]);
      expect(featureHiddenFromAi('doses')).toBe(true);
    });

    it('nothing is taken off (or put on) the server’s list', async () => {
      store.entries = [entry(1, JOURNAL)];
      api.aiHidden.list.mockResolvedValue({ ids: [1] });
      await reconcileAiHidden({ prune: true });
      expect(api.aiHidden.list).not.toHaveBeenCalled();
      expect(api.aiHidden.set).not.toHaveBeenCalled();
    });

    it('the session ending goes back to that', () => {
      load();
      expect(isHiddenFromAi({ _taxonomyId: JOURNAL })).toBe(false);
      clearAiPrivacy();
      expect(isHiddenFromAi({ _taxonomyId: JOURNAL })).toBe(true);
    });
  });

  describe('the two stored copies', () => {
    it('the sealed copy is believed; the server’s readable copy can only add to what is hidden', () => {
      loadAiPrivacy({ ...NONE, hiddenTopicIds: [THERAPY], hiddenFeatures: ['doses'] }, { ...NONE, appEnabled: true, hiddenTopicIds: [TASKS] }, true);
      expect(getAiPrivacy().hiddenTopicIds.sort()).toEqual([THERAPY, TASKS]);
      expect(getAiPrivacy().hiddenFeatures).toEqual(['doses']);
      // The app's switch is the sealed copy's: the server can't turn it on here
      expect(getAiPrivacy().appEnabled).toBe(false);
    });

    it('a readable copy stripped of a hidden topic is put right, and the topic stays hidden', () => {
      loadAiPrivacy({ ...NONE, hiddenTopicIds: [THERAPY] }, NONE, true);
      expect(isHiddenFromAi({ _taxonomyId: THERAPY })).toBe(true);
      expect(api.settings.upsert).toHaveBeenCalledWith('aiPrivacy', { ...NONE, hiddenTopicIds: [THERAPY] });
    });

    it('copies that agree write nothing', () => {
      load({ hiddenTopicIds: [THERAPY] });
      expect(api.settings.upsert).not.toHaveBeenCalled();
    });

    it('a sealed copy seen before that is now missing or older: everything stays hidden', () => {
      cipher.seen = 3;
      loadAiPrivacy(undefined, NONE, false);
      expect(aiPrivacyLoaded()).toBe(false);
      expect(isHiddenFromAi({ _taxonomyId: JOURNAL })).toBe(true);
    });

    it('never sealed yet (first use): the readable copy is used', () => {
      loadAiPrivacy(undefined, { ...NONE, hiddenTopicIds: [THERAPY] }, false);
      expect(aiPrivacyLoaded()).toBe(true);
      expect(isHiddenFromAi({ _taxonomyId: THERAPY })).toBe(true);
      expect(isHiddenFromAi({ _taxonomyId: JOURNAL })).toBe(false);
    });
  });

  it('hides an entry by its own switch or by its topic', () => {
    load({ hiddenTopicIds: [THERAPY] });
    expect(isHiddenFromAi({ _taxonomyId: JOURNAL })).toBe(false);
    expect(isHiddenFromAi({ _taxonomyId: JOURNAL, _aiHidden: true })).toBe(true);
    expect(isHiddenFromAi({ _taxonomyId: THERAPY })).toBe(true);
    expect(isHiddenFromAi({ _taxonomyId: String(THERAPY) })).toBe(true);
    expect(isHiddenFromAi(null)).toBe(false);
  });

  it('visibleToAi leaves hidden entries out', () => {
    load({ hiddenTopicIds: [THERAPY] });
    const all = [entry(10, JOURNAL), entry(11, JOURNAL, { _aiHidden: true }), entry(12, THERAPY), entry(13, TASKS)];
    expect(visibleToAi(all).map(e => e.id)).toEqual([10, 13]);
  });

  it('features outside entries', () => {
    load({ hiddenFeatures: ['bills', 'vision'] });
    expect(featureHiddenFromAi('bills')).toBe(true);
    expect(featureHiddenFromAi('vision')).toBe(true);
    expect(featureHiddenFromAi('doses')).toBe(false);
  });

  it('a hidden new entry is marked on the server before it exists', async () => {
    load({ hiddenTopicIds: [THERAPY] });
    await markHiddenBeforeCreate(50, { _taxonomyId: THERAPY });
    expect(api.aiHidden.set).toHaveBeenCalledWith([50], true);
    await markHiddenBeforeCreate(51, { _taxonomyId: JOURNAL });
    expect(api.aiHidden.set).toHaveBeenCalledTimes(1);
  });

  describe('saving an existing entry', () => {
    it('one that is hidden is marked, once for a run of saves', async () => {
      load();
      await markHiddenOnSave(20, { _taxonomyId: JOURNAL, _aiHidden: true });
      await markHiddenOnSave(20, { _taxonomyId: JOURNAL, _aiHidden: true });
      expect(api.aiHidden.set).toHaveBeenCalledTimes(1);
      expect(api.aiHidden.set).toHaveBeenCalledWith([20], true);
    });

    it('if the server can’t be told, the save fails and the next one asks again', async () => {
      load();
      api.aiHidden.set.mockRejectedValueOnce(new Error('offline'));
      await expect(markHiddenOnSave(21, { _taxonomyId: JOURNAL, _aiHidden: true })).rejects.toThrow();
      await markHiddenOnSave(21, { _taxonomyId: JOURNAL, _aiHidden: true });
      expect(api.aiHidden.set).toHaveBeenCalledTimes(2);
    });

    it('one shared again here is taken off the list, after the choices are read afresh', async () => {
      load();
      store.entries = [entry(22, JOURNAL, { _aiHidden: true })];
      await markHiddenOnSave(22, { _taxonomyId: JOURNAL });
      expect(api.settings.getSome).toHaveBeenCalled();
      expect(api.aiHidden.set).toHaveBeenCalledWith([22], false);
    });

    it('…but not if its topic was hidden in another tab meanwhile', async () => {
      load();
      store.entries = [entry(23, JOURNAL, { _aiHidden: true })];
      serverHolds({ hiddenTopicIds: [JOURNAL] });
      await markHiddenOnSave(23, { _taxonomyId: JOURNAL });
      expect(api.aiHidden.set).not.toHaveBeenCalledWith([23], false);
      expect(api.aiHidden.set).toHaveBeenCalledWith([23], true);
    });

    it('…and it stays hidden when the choices can’t be read', async () => {
      load();
      store.entries = [entry(24, JOURNAL, { _aiHidden: true })];
      api.settings.getSome.mockRejectedValue(new Error('offline'));
      await markHiddenOnSave(24, { _taxonomyId: JOURNAL });
      expect(api.aiHidden.set).not.toHaveBeenCalled();
    });

    it('an entry that was never hidden asks the server nothing', async () => {
      load();
      store.entries = [entry(25, JOURNAL)];
      await markHiddenOnSave(25, { _taxonomyId: JOURNAL });
      expect(api.aiHidden.set).not.toHaveBeenCalled();
      expect(api.settings.getSome).not.toHaveBeenCalled();
    });
  });

  describe('reconcile', () => {
    beforeEach(() => {
      load({ hiddenTopicIds: [THERAPY] });
      store.entries = [entry(1, JOURNAL), entry(2, THERAPY), entry(3, JOURNAL, { _aiHidden: true }), entry(4, JOURNAL)];
      // The server has 4 hidden (this copy says no longer), and 99 (marked before a create this browser hasn't seen)
      api.aiHidden.list.mockResolvedValue({ ids: [4, 99] });
    });

    it('adds what is missing and never un-hides from a copy held in memory', async () => {
      await reconcileAiHidden();
      expect(api.aiHidden.set).toHaveBeenCalledWith([2, 3], true);
      expect(api.aiHidden.set).toHaveBeenCalledTimes(1);
    });

    const AT = '2026-11-20T10:00:00.000Z';
    /** The entries as a fresh load holds them: each with the time the server last saved it. */
    const loaded = () => { store.entries = store.entries.map(e => ({ ...e, updatedAt: new Date(AT) })); };

    it('right after a fresh load it also takes off what is no longer hidden (and leaves unknown ids alone)', async () => {
      loaded();
      serverHolds({ hiddenTopicIds: [THERAPY] });
      api.aiHidden.updatedAt.mockResolvedValue({ entries: [{ id: 4, updatedAt: AT }] });
      await reconcileAiHidden({ prune: true });
      expect(api.aiHidden.set).toHaveBeenCalledWith([2, 3], true);
      expect(api.aiHidden.set).toHaveBeenCalledWith([4], false);
      expect(api.aiHidden.set).toHaveBeenCalledTimes(2);
      // One small request for when they were last saved, never a download of each entry
      expect(api.aiHidden.updatedAt).toHaveBeenCalledWith([4]);
    });

    // Another device may hide something while this one is still loading: what
    // was read a moment ago must not undo it
    it('never shares an entry again that was saved since this browser read it', async () => {
      loaded();
      serverHolds({ hiddenTopicIds: [THERAPY] });
      api.aiHidden.updatedAt.mockResolvedValue({ entries: [{ id: 4, updatedAt: '2026-11-20T10:00:05.000Z' }] });
      await reconcileAiHidden({ prune: true });
      expect(api.aiHidden.set).not.toHaveBeenCalledWith(expect.arrayContaining([4]), false);
    });

    it('never shares an entry again whose topic was hidden since this browser read the choices', async () => {
      loaded();
      serverHolds({ hiddenTopicIds: [THERAPY, JOURNAL] });
      api.aiHidden.updatedAt.mockResolvedValue({ entries: [{ id: 4, updatedAt: AT }] });
      await reconcileAiHidden({ prune: true });
      expect(api.aiHidden.set).not.toHaveBeenCalledWith(expect.anything(), false);
      expect(api.aiHidden.updatedAt).not.toHaveBeenCalled();
    });

    it('shares nothing again when the choices or the entry can’t be read afresh', async () => {
      loaded();
      api.aiHidden.updatedAt.mockRejectedValue(new Error('offline'));
      await reconcileAiHidden({ prune: true });
      expect(api.aiHidden.set).not.toHaveBeenCalledWith(expect.anything(), false);

      api.settings.getSome.mockRejectedValue(new Error('offline'));
      await expect(reconcileAiHidden({ prune: true })).rejects.toThrow();
      expect(api.aiHidden.set).not.toHaveBeenCalledWith(expect.anything(), false);
    });

    it('nor an entry held without the time it was last saved', async () => {
      serverHolds({ hiddenTopicIds: [THERAPY] });
      await reconcileAiHidden({ prune: true });
      expect(api.aiHidden.set).not.toHaveBeenCalledWith(expect.anything(), false);
    });
  });

  describe('an import marks its hidden entries together', () => {
    it('the marks wait in the batch and go in one request', async () => {
      load({ hiddenTopicIds: [THERAPY] });
      const batch = newAiMarkBatch();
      await markHiddenBeforeCreate(11, { _taxonomyId: THERAPY }, batch);
      await markHiddenBeforeCreate(12, { _taxonomyId: JOURNAL }, batch);
      await markHiddenBeforeCreate(13, { _taxonomyId: JOURNAL, _aiHidden: true }, batch);
      expect(api.aiHidden.set).not.toHaveBeenCalled();
      await flushAiMarks(batch);
      expect(api.aiHidden.set).toHaveBeenCalledTimes(1);
      expect(api.aiHidden.set).toHaveBeenCalledWith([11, 13], true);
      // Flushed once: nothing left to send again
      await flushAiMarks(batch);
      expect(api.aiHidden.set).toHaveBeenCalledTimes(1);
    });

    it('a flush that fails fails the import step (the entries are not created unmarked)', async () => {
      load({ hiddenTopicIds: [THERAPY] });
      const batch = newAiMarkBatch();
      await markHiddenBeforeCreate(11, { _taxonomyId: THERAPY }, batch);
      api.aiHidden.set.mockRejectedValueOnce(new Error('offline'));
      await expect(flushAiMarks(batch)).rejects.toThrow();
    });
  });

  describe('when the choices can’t be read', () => {
    it('is told apart from "not read yet", and everything stays hidden', () => {
      expect(aiPrivacyUnreadable()).toBe(false);
      cipher.seen = 4; // this browser has seen a sealed copy, and now there is none
      loadAiPrivacy(undefined, { ...NONE, appEnabled: true }, false);
      expect(aiPrivacyUnreadable()).toBe(true);
      expect(aiPrivacyLoaded()).toBe(false);
      expect(isHiddenFromAi({ _taxonomyId: JOURNAL })).toBe(true);
      expect(topicHiddenFromAi(JOURNAL)).toBe(true);
    });

    // A sealed copy that is there but won't open is not "never made": the
    // server's own copy must not stand in for it, even in a browser that has seen none
    it('a sealed copy that is stored but didn’t open leaves everything hidden, first use or not', () => {
      loadAiPrivacy(undefined, { ...NONE, appEnabled: true }, true);
      expect(aiPrivacyUnreadable()).toBe(true);
      expect(isHiddenFromAi({ _taxonomyId: JOURNAL })).toBe(true);
    });

    it('starting again switches the AI app off first, keeps what the server lists as hidden, and seals it', async () => {
      cipher.seen = 4;
      loadAiPrivacy(undefined, { ...NONE, appEnabled: true }, false);
      api.settings.getSome.mockResolvedValue([{ key: 'aiPrivacy', value: { appEnabled: true, hiddenTopicIds: [THERAPY], hiddenFeatures: ['doses'] } }]);
      store.entries = [entry(2, THERAPY)];
      await resetAiPrivacy();
      const next = { appEnabled: false, hiddenTopicIds: [THERAPY], hiddenFeatures: ['doses'] };
      // The server's copy first: the app stops even if sealing then fails
      expect(api.settings.upsert.mock.calls).toEqual([['aiPrivacy', next], ['aiPrivacySealed', { sealed: next }]]);
      expect(getAiPrivacy()).toEqual(next);
      expect(aiPrivacyLoaded()).toBe(true);
      expect(api.aiHidden.set).toHaveBeenCalledWith([2], true);
    });

    it('the AI app is off on the server even when sealing fails', async () => {
      cipher.seen = 4;
      loadAiPrivacy(undefined, { ...NONE, appEnabled: true }, false);
      api.settings.getSome.mockResolvedValue([{ key: 'aiPrivacy', value: { appEnabled: true } }]);
      api.settings.upsert.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'));
      await expect(resetAiPrivacy()).rejects.toThrow();
      expect(api.settings.upsert.mock.calls[0]).toEqual(['aiPrivacy', NONE]);
      expect(aiPrivacyLoaded()).toBe(false);
    });
  });

  it('a topic kept from AI is hidden by name too', () => {
    load({ hiddenTopicIds: [THERAPY] });
    expect(topicHiddenFromAi(THERAPY)).toBe(true);
    expect(topicHiddenFromAi(JOURNAL)).toBe(false);
  });

  describe('changing the choices', () => {
    it('what restricts reaches the server first, then the sealed copy, then the rest', async () => {
      load();
      store.entries = [entry(5, THERAPY)];
      await updateAiPrivacy(now => ({ ...now, appEnabled: true, hiddenTopicIds: [THERAPY] }));
      const next = { appEnabled: true, hiddenTopicIds: [THERAPY], hiddenFeatures: [] };
      expect(api.settings.upsert.mock.calls).toEqual([
        // Therapy hidden at once; the app not yet on
        ['aiPrivacy', { ...next, appEnabled: false }],
        ['aiPrivacySealed', { sealed: next }],
        ['aiPrivacy', next],
      ]);
      expect(api.aiHidden.set).toHaveBeenCalledWith([5], true);
      expect(getAiPrivacy()).toEqual(next);
    });

    it('a change that only shares more writes the sealed copy first', async () => {
      load();
      await updateAiPrivacy(now => ({ ...now, appEnabled: true }));
      const next = { ...NONE, appEnabled: true };
      expect(api.settings.upsert.mock.calls).toEqual([['aiPrivacySealed', { sealed: next }], ['aiPrivacy', next]]);
    });

    // The kill switch: the server stops the app (and ends its sessions) before anything else is written
    it('switching the AI app off reaches the server first, and stands even if the rest fails', async () => {
      load({ appEnabled: true });
      serverHolds({ appEnabled: true });
      api.settings.upsert.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'));
      await expect(updateAiPrivacy(now => ({ ...now, appEnabled: false }))).rejects.toThrow();
      expect(api.settings.upsert.mock.calls[0]).toEqual(['aiPrivacy', { ...NONE, appEnabled: false }]);
      expect(getAiPrivacy().appEnabled).toBe(false);
      // The next load agrees: the app is on only when both copies say so
      clearAiPrivacy();
      loadAiPrivacy({ ...NONE, appEnabled: true }, { ...NONE, appEnabled: false }, true);
      expect(getAiPrivacy().appEnabled).toBe(false);
      expect(api.settings.upsert).toHaveBeenCalledTimes(2); // nothing rewritten: the server's copy is not switched back on
    });

    it('a copy of choices that haven’t been read still counts as not read', () => {
      clearAiPrivacy();
      const copy = { ...getAiPrivacy() };
      expect(aiPrivacyLoaded(copy)).toBe(false);
      expect(isHiddenFromAi({ _taxonomyId: JOURNAL }, copy)).toBe(true);
      expect(featureHiddenFromAi('doses', copy)).toBe(true);
    });

    it('builds on what the server holds now, so a tab left open can’t undo a choice made elsewhere', async () => {
      load(); // this tab loaded before another one hid Therapy and switched the app off
      serverHolds({ hiddenTopicIds: [THERAPY] });
      await updateAiPrivacy(now => ({ ...now, hiddenFeatures: ['doses'] }));
      const next = { appEnabled: false, hiddenTopicIds: [THERAPY], hiddenFeatures: ['doses'] };
      // Only restricts: the server's copy first, then the sealed one (nothing left for a third write)
      expect(api.settings.upsert.mock.calls).toEqual([['aiPrivacy', next], ['aiPrivacySealed', { sealed: next }]]);
    });

    it('a topic taken off the list shares its entries again, except ones with their own switch', async () => {
      const AT = new Date('2026-11-20T10:00:00.000Z');
      load({ hiddenTopicIds: [THERAPY] });
      serverHolds({ hiddenTopicIds: [THERAPY] });
      store.entries = [{ ...entry(6, THERAPY), updatedAt: AT }, { ...entry(7, THERAPY, { _aiHidden: true }), updatedAt: AT }, { ...entry(8, JOURNAL), updatedAt: AT }];
      api.aiHidden.list.mockResolvedValue({ ids: [6, 7] });
      api.aiHidden.updatedAt.mockResolvedValue({ entries: [{ id: 6, updatedAt: AT.toISOString() }] });
      await updateAiPrivacy(now => ({ ...now, hiddenTopicIds: [] }));
      expect(api.aiHidden.set).toHaveBeenCalledWith([6], false);
      expect(api.aiHidden.set).not.toHaveBeenCalledWith(expect.arrayContaining([7]), false);
    });

    // Another device may have ticked Hide on one of them since this tab read it
    it('…but never one that was saved since this tab read it', async () => {
      const AT = new Date('2026-11-20T10:00:00.000Z');
      load({ hiddenTopicIds: [THERAPY] });
      serverHolds({ hiddenTopicIds: [THERAPY] });
      store.entries = [{ ...entry(6, THERAPY), updatedAt: AT }, { ...entry(9, THERAPY), updatedAt: AT }];
      api.aiHidden.updatedAt.mockResolvedValue({ entries: [
        { id: 6, updatedAt: AT.toISOString() }, { id: 9, updatedAt: '2026-11-20T10:00:05.000Z' },
      ] });
      await updateAiPrivacy(now => ({ ...now, hiddenTopicIds: [] }));
      expect(api.aiHidden.set).toHaveBeenCalledWith([6], false);
      expect(api.aiHidden.set).not.toHaveBeenCalledWith(expect.arrayContaining([9]), false);
    });

    it('…and none at all when the server can’t say when they were saved', async () => {
      load({ hiddenTopicIds: [THERAPY] });
      serverHolds({ hiddenTopicIds: [THERAPY] });
      store.entries = [{ ...entry(6, THERAPY), updatedAt: new Date() }];
      api.aiHidden.updatedAt.mockRejectedValue(new Error('offline'));
      await updateAiPrivacy(now => ({ ...now, hiddenTopicIds: [] }));
      expect(api.aiHidden.set).not.toHaveBeenCalledWith(expect.anything(), false);
    });

    // The topic's switch alone hides only its name from the AI app: its entries
    // are on the server's list before anything else can fail
    it('a newly hidden topic’s entries are marked before the sealed copy is written, and stay marked if that fails', async () => {
      load();
      store.entries = [entry(5, THERAPY), entry(8, JOURNAL)];
      api.settings.upsert.mockImplementationOnce(async (key: string, value: unknown) => { server[key] = value; return {}; })
        .mockRejectedValueOnce(new Error('offline'));
      await expect(updateAiPrivacy(now => ({ ...now, hiddenTopicIds: [THERAPY] }))).rejects.toThrow();
      expect(api.aiHidden.set).toHaveBeenCalledWith([5], true);
      expect(getAiPrivacy().hiddenTopicIds).toEqual([THERAPY]);
    });

    it('the server’s list is brought in line before the AI app is switched on', async () => {
      load();
      store.entries = [entry(3, JOURNAL, { _aiHidden: true })];
      const order: string[] = [];
      api.aiHidden.set.mockImplementation(async () => { order.push('marked'); return { success: true }; });
      api.settings.upsert.mockImplementation(async (key: string, value: unknown) => {
        server[key] = value;
        if (key === 'aiPrivacy' && (value as { appEnabled: boolean }).appEnabled) order.push('on');
        return {};
      });
      await updateAiPrivacy(now => ({ ...now, appEnabled: true }));
      expect(order).toEqual(['marked', 'on']);
    });

    it('while the journal is still loading, a topic isn’t hidden and the app isn’t switched on (nothing is written)', async () => {
      load();
      store.initialized = false;
      await expect(updateAiPrivacy(now => ({ ...now, hiddenTopicIds: [THERAPY] }))).rejects.toThrow();
      await expect(updateAiPrivacy(now => ({ ...now, appEnabled: true }))).rejects.toThrow();
      expect(api.settings.upsert).not.toHaveBeenCalled();
      // Switching the app off never waits for the journal
      serverHolds({ appEnabled: true });
      await updateAiPrivacy(now => ({ ...now, appEnabled: false }));
      expect(server.aiPrivacy).toEqual(NONE);
    });

    // Two devices in the same moment: the other one's write lands between this one's read and its own
    it('a change another device wrote over is made once more', async () => {
      load();
      let first = true;
      api.settings.upsert.mockImplementation(async (key: string, value: unknown) => {
        server[key] = value;
        // The other device, hiding Tasks from its own (older) read, right after this one's last write
        if (key === 'aiPrivacySealed' && first) {
          first = false;
          server = { aiPrivacySealed: { sealed: { ...NONE, hiddenTopicIds: [TASKS] } }, aiPrivacy: { ...NONE, hiddenTopicIds: [TASKS] } };
        }
        return {};
      });
      await updateAiPrivacy(now => ({ ...now, hiddenTopicIds: [...new Set([...now.hiddenTopicIds, THERAPY])] }));
      expect((server.aiPrivacy as { hiddenTopicIds: number[] }).hiddenTopicIds.sort()).toEqual([THERAPY, TASKS]);
      expect(getAiPrivacy().hiddenTopicIds.sort()).toEqual([THERAPY, TASKS]);
    });

    it('a failed save changes nothing here', async () => {
      load();
      api.settings.upsert.mockRejectedValueOnce(new Error('offline'));
      await expect(updateAiPrivacy(now => ({ ...now, hiddenTopicIds: [THERAPY] }))).rejects.toThrow();
      expect(getAiPrivacy().hiddenTopicIds).toEqual([]);
    });
  });
});

// A save path that rebuilds an entry's metadata must not share it with AI again by leaving the switch out
describe('withAiHiddenKept', () => {
  it('no key at all keeps what the entry was', () => {
    expect(withAiHiddenKept({ _aiHidden: true }, { _taxonomyId: 1 })).toEqual({ _taxonomyId: 1, _aiHidden: true });
    expect(withAiHiddenKept({}, { _taxonomyId: 1 })).toEqual({ _taxonomyId: 1 });
    expect(withAiHiddenKept(null, { _taxonomyId: 1 })).toEqual({ _taxonomyId: 1 });
  });
  it('true hides', () => {
    expect(withAiHiddenKept({}, { _aiHidden: true })).toEqual({ _aiHidden: true });
  });
  it('only an explicit false shares it again, and the key is then left out', () => {
    expect(withAiHiddenKept({ _aiHidden: true }, { _taxonomyId: 1, _aiHidden: false })).toEqual({ _taxonomyId: 1 });
  });
});

// An editor says "shared again" only when the box was unticked in it
describe('stampAiHidden', () => {
  const stamped = (hidden: boolean, untickedHere: boolean) => { const m: Record<string, unknown> = { _taxonomyId: 1 }; stampAiHidden(m, hidden, untickedHere); return m; };
  it('ticked: hidden', () => {
    expect(stamped(true, false)).toEqual({ _taxonomyId: 1, _aiHidden: true });
    expect(stamped(true, true)).toEqual({ _taxonomyId: 1, _aiHidden: true });
  });
  it('unticked here: shared again, said out loud', () => {
    expect(stamped(false, true)).toEqual({ _taxonomyId: 1, _aiHidden: false });
  });
  it('never touched: says nothing, so an entry hidden on another device stays hidden', () => {
    const meta = stamped(false, false);
    expect(meta).toEqual({ _taxonomyId: 1 });
    expect(withAiHiddenKept({ _aiHidden: true }, meta)).toEqual({ _taxonomyId: 1, _aiHidden: true });
  });
});

/**
 * Guard: every AI feature that sends entries goes through the filter. A new
 * feature that calls aiFeatureJson must use visibleToAi (or useKitchenData,
 * which does) — this test fails until it does.
 */
describe('every AI feature honours "Don’t share with AI"', () => {
  const src = resolve(__dirname, '../..');
  const read = (p: string) => readFileSync(resolve(src, p), 'utf8');
  const features = [
    'components/organisms/AiInsights.tsx',
    'components/organisms/AiPlanReview.tsx',
    'components/organisms/AiMenuPlan.tsx',
    'components/organisms/AiRecipeFromIngredients.tsx',
  ];

  it.each(features)('%s filters what it sends', (file) => {
    const code = read(file);
    expect(code).toMatch(/aiFeatureJson|aiAssistant/);
    expect(/visibleToAi\(|useKitchenData\(/.test(code)).toBe(true);
  });

  it('the kitchen data filters hidden entries', () => {
    expect(read('hooks/useKitchenData.ts')).toMatch(/visibleToAi\(allergyLists[\s\S]*visibleToAi\(menuLists[\s\S]*visibleToAi\(recipeLists/);
  });

  it('calorie estimates skip hidden entries', () => {
    expect(read('services/aiAssistant.ts')).toMatch(/isHiddenFromAi\(meta\)/);
  });

  // The on-save estimates can't be called without saying which entry it is:
  // an optional argument let a caller leave the check out without noticing
  it('the on-save estimates require the entry’s metadata', () => {
    const code = read('services/aiAssistant.ts');
    expect(code).not.toMatch(/meta\?: Record<string, unknown>/);
    expect(code).not.toMatch(/if \(meta && isHiddenFromAi/);
    expect(read('utils/entrySave.ts')).not.toMatch(/aiMeta\?:/);
  });

  // A topic kept from AI isn't named to the chat model either
  it('the chat leaves hidden topics out of what it tells the model', () => {
    expect(read('components/organisms/AiChat.tsx')).toMatch(/!topicHiddenFromAi\(t\.id\)\);\s+const system = chatSystemPrompt\(shared\.map/);
  });

  // The estimates (calories, nutrients, a media item's details) send an entry's
  // text too. Every file that calls one is listed here with how it keeps hidden
  // entries out; a new caller fails this test until it is added with its check.
  it('every file that asks for an AI estimate checks first', () => {
    const { execSync } = require('child_process') as typeof import('child_process');
    const calls = 'estimateEntryCalories\\(|estimateEntryNutrition\\(|estimateFoodNutrition\\(|autoNutritionOnSave\\(|autoCaloriesOnSave\\(|aiMediaDetails\\b';
    const hits = execSync(`grep -rlE "${calls}" ${src} --include=*.ts --include=*.tsx`, { encoding: 'utf8' })
      .split('\n').filter(Boolean).filter(p => !p.includes('__tests__')).map(p => p.slice(src.length + 1)).sort();
    const checked: Record<string, RegExp> = {
      'services/aiAssistant.ts': /isHiddenFromAi\(meta\)/,
      'services/mediaDetails.ts': /./, // the definition; its one caller is EntryForm
      'utils/entrySave.ts': /customFields, aiMeta\)/,
      'hooks/useSaveCommand.ts': /, cf, metadata\)/,
      'hooks/useCalorieEstimate.ts': /hiddenFromAi/,
      'hooks/useDoseToMeals.ts': /featureHiddenFromAi\('doses'\) \|\| isHiddenFromAi\(/,
      'components/organisms/EntryForm.tsx': /!hiddenFromAi \? aiMediaDetails/,
      'components/organisms/FoodLog.tsx': /isHiddenFromAi\(entry\.metadata/,
      'components/organisms/HealthQuickLog.tsx': /!isHiddenFromAi\(\{ _taxonomyId: topicId \}\)/,
      'components/molecules/fields/MediaFields.tsx': /./, // a comment naming the prop
    };
    expect(hits).toEqual(Object.keys(checked).sort());
    for (const [file, check] of Object.entries(checked)) expect(read(file), file).toMatch(check);
  });

  it('no other file sends entries to AI without the filter', () => {
    // Files that call aiFeatureJson today: exactly the features above (plus its definition)
    const { execSync } = require('child_process') as typeof import('child_process');
    const hits = execSync(`grep -rl "aiFeatureJson(" ${src} --include=*.ts --include=*.tsx`, { encoding: 'utf8' })
      .split('\n').filter(Boolean).filter(p => !p.includes('__tests__')).map(p => p.slice(src.length + 1)).sort();
    expect(hits).toEqual([...features, 'services/aiAssistant.ts'].sort());
  });
});
