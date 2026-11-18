import { useState } from 'react';

/* Which nav sections show their views (the drop-down under Health, Planning, Kitchen,
   Finance), shared by the rail and the phone menu. The current section starts open; a
   section opened or closed by hand stays that way (per browser — a convenience). */

const KEY = 'nav-sections-open-v1';

function read(): Record<string, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, boolean] => typeof e[1] === 'boolean'));
  } catch { return {}; }
}

export function useNavSections(): { isOpen: (key: string, current: boolean) => boolean; toggle: (key: string, current: boolean) => void } {
  const [chosen, setChosen] = useState(read);
  const isOpen = (key: string, current: boolean) => chosen[key] ?? current;
  const toggle = (key: string, current: boolean) => setChosen(prev => {
    const next = { ...prev, [key]: !(prev[key] ?? current) };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* this visit only */ }
    return next;
  });
  return { isOpen, toggle };
}
