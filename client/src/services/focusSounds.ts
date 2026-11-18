import { create } from 'zustand';

/* Focus sounds: ambient loops (rain, fire, birds…) to play together, each at its own
   volume — no timer. The files live in src/assets/sounds; Vite gives each a URL and
   they load only when first played (they aren't precached). One player for the whole
   app (module-level audio elements), so a mix keeps playing while you move between
   pages; it stops when the session ends (stopAllFocusSounds, from clearKey). The
   volumes are remembered per browser. */

export interface FocusSound { id: string; label: string; icon: string; url: string }

const FILES = import.meta.glob('../assets/sounds/*.m4a', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

/** How each file shows: its name and a Material icon (in the order they're listed) */
const META: Record<string, { label: string; icon: string }> = {
  'binaural-rain': { label: 'Binaural rain', icon: 'rainy' },
  'binaural-beach': { label: 'Binaural beach', icon: 'beach_access' },
  'binaural-birds': { label: 'Binaural birds', icon: 'headphones' },
  stream: { label: 'Stream', icon: 'water' },
  forest: { label: 'Forest', icon: 'forest' },
  gulls: { label: 'Gulls', icon: 'waves' },
  crickets: { label: 'Crickets', icon: 'pest_control' },
  wind: { label: 'Wind', icon: 'air' },
  wind2: { label: 'Gusts', icon: 'air' },
  thunder: { label: 'Thunder', icon: 'thunderstorm' },
  frost: { label: 'Frost', icon: 'ac_unit' },
  campfire: { label: 'Campfire', icon: 'local_fire_department' },
  fire: { label: 'Fireplace', icon: 'fireplace' },
  train: { label: 'Train', icon: 'train' },
  heartbeat: { label: 'Heartbeat', icon: 'favorite' },
  flute: { label: 'Flute', icon: 'graphic_eq' },
};

const idOf = (path: string) => path.split('/').pop()!.replace(/\.m4a$/, '');
const order = Object.keys(META);

/** Every sound in the folder: the known ones in META's order, any new file after them by its name */
export const FOCUS_SOUNDS: FocusSound[] = Object.entries(FILES)
  .map(([path, url]) => {
    const id = idOf(path);
    const meta = META[id] ?? { label: id.replace(/[-_]+/g, ' ').replace(/^\w/, c => c.toUpperCase()), icon: 'music_note' };
    return { id, url, ...meta };
  })
  .sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.label.localeCompare(b.label);
  });

const VOLUME_KEY = 'focus-volumes-v1';
const DEFAULT_VOLUME = 0.6;

function readVolumes(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] >= 0 && e[1] <= 1));
  } catch { return {}; }
}

interface FocusState {
  /** The sounds playing now */
  playing: string[];
  /** Each sound's volume, 0–1 (remembered per browser) */
  volumes: Record<string, number>;
  /** A sound that couldn't start (the browser refused, or the file failed) */
  failed: string | null;
}

export const useFocusSounds = create<FocusState>(() => ({ playing: [], volumes: readVolumes(), failed: null }));

const audio = new Map<string, HTMLAudioElement>();

export const volumeOf = (id: string) => useFocusSounds.getState().volumes[id] ?? DEFAULT_VOLUME;

function element(s: FocusSound): HTMLAudioElement {
  let el = audio.get(s.id);
  if (!el) {
    el = new Audio(s.url);
    el.loop = true;
    el.preload = 'none';
    audio.set(s.id, el);
  }
  el.volume = volumeOf(s.id);
  return el;
}

/** Start or stop one sound */
export function toggleFocusSound(id: string): void {
  const s = FOCUS_SOUNDS.find(x => x.id === id);
  if (!s) return;
  const { playing } = useFocusSounds.getState();
  if (playing.includes(id)) {
    audio.get(id)?.pause();
    useFocusSounds.setState({ playing: playing.filter(x => x !== id) });
    return;
  }
  const el = element(s);
  useFocusSounds.setState({ playing: [...playing, id], failed: null });
  el.play().catch(() => {
    useFocusSounds.setState(st => ({ playing: st.playing.filter(x => x !== id), failed: id }));
  });
}

/** One sound's volume (0–1), applied at once and remembered */
export function setFocusVolume(id: string, v: number): void {
  const volume = Math.max(0, Math.min(1, v));
  const el = audio.get(id);
  if (el) el.volume = volume;
  const volumes = { ...useFocusSounds.getState().volumes, [id]: volume };
  useFocusSounds.setState({ volumes });
  try { localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes)); } catch { /* per browser only */ }
}

/** Stop everything (the Stop all link, and when the session ends) */
export function stopAllFocusSounds(): void {
  for (const el of audio.values()) el.pause();
  useFocusSounds.setState({ playing: [] });
}
