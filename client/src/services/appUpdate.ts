/**
 * "A new version is available" — set by the service worker registration in
 * main.tsx and shown by the UpdatePrompt bar. Replaces window.confirm, which
 * iPad Safari blocks (it silently returns false).
 */
type Listener = () => void;

let applyUpdate: (() => void) | null = null;
const listeners = new Set<Listener>();

export function setUpdateAvailable(apply: () => void): void {
  applyUpdate = apply;
  listeners.forEach(l => l());
}

/** The pending update's reload function, or null when there's none. */
export function getPendingUpdate(): (() => void) | null {
  return applyUpdate;
}

export function subscribeToUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
