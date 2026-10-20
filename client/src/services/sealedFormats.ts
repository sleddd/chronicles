/*
 * Older record formats (unbound settings, v2 entries, topics sealed to 'v1',
 * doses not bound to their day) open only while an account moves over: until
 * its sealed marker (`settingsSealV2`, `entriesSealV3`, `topicsSealV2`,
 * `dosesSealV2`) exists. The markers are settings rows on the server, and a
 * server can't forge one — but it could leave one out to turn the older
 * readers back on and replay ciphertexts it kept. Two backstops:
 *
 * - once this browser has seen a marker, a missing one counts as present
 *   (remembered across sign-out; it holds no data, only which markers exist)
 * - from LEGACY_FORMATS_UNTIL the older forms are refused everywhere
 *
 * The browser record isn't per account (the account id comes from the server
 * too, so it couldn't be trusted to pick the record): an account that has
 * never moved over can only do so on a browser that hasn't seen one that has.
 */

export const SEEN_MARKERS_STORE = 'chronicles.sealSeen.v1';

/** After this the older formats never open, marker or not. */
export const LEGACY_FORMATS_UNTIL = Date.UTC(2027, 0, 1);

function seenMarkers(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_MARKERS_STORE);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Remember that this account's records of a kind are past the move. */
export function noteSealMarker(key: string): void {
  const seen = seenMarkers();
  if (seen.has(key)) return;
  seen.add(key);
  try { localStorage.setItem(SEEN_MARKERS_STORE, JSON.stringify([...seen])); } catch { /* private mode */ }
}

/**
 * Whether a kind of record is past the move — the older form refused — given
 * whether the server has its marker.
 */
export function sealMarkerHeld(key: string, onServer: boolean, now = Date.now()): boolean {
  if (onServer) {
    noteSealMarker(key);
    return true;
  }
  return now >= LEGACY_FORMATS_UNTIL || seenMarkers().has(key);
}
