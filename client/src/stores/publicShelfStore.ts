import { create } from 'zustand';
import type { OwnedPublicShelf } from '../services/api.js';
import { PUBLIC_SHELF_TITLE_DEFAULT } from '@shared/validation/schemas';

/*
 * The owner's view of their public shelf: whether one exists (its token,
 * title and count from the server), the title being edited, how the last
 * publish went, and the item waiting for the first-time confirmation. The
 * sync (hooks/usePublicShelfSync) fills it on unlock and republishes from it.
 * Cleared on sign-out; nothing here is secret (the items themselves are
 * never kept — they're built from the entries store when needed).
 */

export type PublicShelfStatus = 'idle' | 'saving' | 'offline' | 'error';

interface PublicShelfState {
  /** The server has been asked whether this account has a shelf */
  loaded: boolean;
  publicShelf: OwnedPublicShelf | null;
  title: string;
  status: PublicShelfStatus;
  /** The last body the server accepted — nothing identical is sent again */
  lastSentBody: string | null;
  /** The entry id a bookmark tap is waiting on while the first-time confirmation shows */
  pendingItemId: number | null;
  setLoaded: (publicShelf: OwnedPublicShelf | null) => void;
  setPublicShelf: (publicShelf: OwnedPublicShelf | null) => void;
  setTitle: (title: string) => void;
  setStatus: (status: PublicShelfStatus) => void;
  setLastSentBody: (body: string | null) => void;
  setPendingItemId: (id: number | null) => void;
  reset: () => void;
}

const initial = {
  loaded: false,
  publicShelf: null,
  title: PUBLIC_SHELF_TITLE_DEFAULT,
  status: 'idle' as PublicShelfStatus,
  lastSentBody: null,
  pendingItemId: null,
};

export const usePublicShelfStore = create<PublicShelfState>((set) => ({
  ...initial,
  setLoaded: (publicShelf) => set({ loaded: true, publicShelf, title: publicShelf?.title ?? PUBLIC_SHELF_TITLE_DEFAULT }),
  setPublicShelf: (publicShelf) => set({ publicShelf }),
  setTitle: (title) => set({ title }),
  setStatus: (status) => set({ status }),
  setLastSentBody: (lastSentBody) => set({ lastSentBody }),
  setPendingItemId: (pendingItemId) => set({ pendingItemId }),
  reset: () => set({ ...initial }),
}));
