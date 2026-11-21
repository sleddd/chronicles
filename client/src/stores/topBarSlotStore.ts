import { create } from 'zustand';

/* The mobile top bar's slot for a page's main action (MobileChrome's BarActions).
   MobileChrome registers its element here as it mounts and takes it back as it
   unmounts, so TopBarAction can move its action into whichever bar is showing
   now — every page mounts its own MobileChrome, and the journal's full-width
   editor unmounts it and mounts a fresh one on the way back. The newest slot
   still mounted is the one in use. */
interface TopBarSlotState {
  slots: HTMLElement[];
  slot: HTMLElement | null;
  register: (el: HTMLElement) => () => void;
}

export const useTopBarSlot = create<TopBarSlotState>((set, get) => ({
  slots: [],
  slot: null,
  register: el => {
    const slots = [...get().slots.filter(s => s !== el), el];
    set({ slots, slot: el });
    return () => {
      const left = get().slots.filter(s => s !== el);
      set({ slots: left, slot: left[left.length - 1] ?? null });
    };
  },
}));

/** A callback ref for the slot element (React 19: the returned cleanup runs as it unmounts) */
export function registerTopBarSlot(el: HTMLElement | null): (() => void) | undefined {
  return el ? useTopBarSlot.getState().register(el) : undefined;
}
