/* A short message shown in a floating bar for a few seconds (e.g. "Couldn't
   delete that entry"). Any code can call showFlash; FlashNotice (mounted once
   in App) shows it. Same pattern as appUpdate.ts. */

let message: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => { for (const l of listeners) l(); };

export function showFlash(text: string, ms = 5000): void {
  message = text;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { message = null; timer = null; emit(); }, ms);
  emit();
}

export function clearFlash(): void {
  message = null;
  if (timer) { clearTimeout(timer); timer = null; }
  emit();
}

export const getFlash = () => message;

export function subscribeToFlash(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
