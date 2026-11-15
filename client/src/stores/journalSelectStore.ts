import { create } from 'zustand';

/* The journal list's select mode: started from the list head's ⋯ menu
   ("Select entries"), shown as checkboxes on the rows, and ended by Done or
   Delete in the same head row. Shared by ViewTabs (the head) and EntryList
   (the rows). */
interface JournalSelectState {
  selecting: boolean;
  ids: Set<number>;
  start: () => void;
  stop: () => void;
  toggle: (id: number) => void;
}

export const useJournalSelect = create<JournalSelectState>(set => ({
  selecting: false,
  ids: new Set(),
  start: () => set({ selecting: true, ids: new Set() }),
  stop: () => set({ selecting: false, ids: new Set() }),
  toggle: id => set(s => {
    const ids = new Set(s.ids);
    if (ids.has(id)) ids.delete(id); else ids.add(id);
    return { ids };
  }),
}));
