import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement scrolling; components call it on mount
window.scrollTo = (() => {}) as typeof window.scrollTo;
Element.prototype.scrollIntoView = function scrollIntoView() {};

/* Node 26 has its own experimental global localStorage / sessionStorage, which
   shadows jsdom's and is unusable without --localstorage-file. Put a working
   in-memory Storage in its place when that happens. */
function memoryStorage(): Storage {
  let data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => { data = new Map(); },
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => { data.delete(k); },
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
  };
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  let usable = false;
  try { usable = typeof globalThis[name]?.clear === 'function'; } catch { usable = false; }
  if (!usable) {
    const store = memoryStorage();
    Object.defineProperty(globalThis, name, { value: store, configurable: true, writable: true });
    if (typeof window !== 'undefined') Object.defineProperty(window, name, { value: store, configurable: true, writable: true });
  }
}
