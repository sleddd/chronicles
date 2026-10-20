/* ── Calendar sync types ── */

/**
 * Per-entry sync state, stored inside the encrypted metadata at
 * `metadata._customFields._sync`. The server never sees this.
 */
export interface EntrySyncState {
  googleEventId: string;
  calendarId: string;
  /** Hash of the last payload both sides agreed on (see computeSyncHash). */
  syncedHash: string;
  /** True when the entry was created by importing a foreign Google event. */
  imported?: boolean;
  /** Notes / attendees / phone pushed by older versions were cleared from the Google event */
  detailsCleared?: boolean;
}

export interface GoogleEventTime {
  /** All-day form (YYYY-MM-DD; end date is exclusive per the Google API). */
  date?: string;
  /** Timed form (RFC3339, no offset when paired with timeZone on write). */
  dateTime?: string;
  timeZone?: string;
}

/** The subset of a Google Calendar event Chronicles reads/writes. */
export interface GoogleEventPayload {
  summary: string;
  /** Never sent by Chronicles' payloads (notes stay private); '' clears an old one */
  description?: string;
  location: string;
  start: GoogleEventTime;
  end: GoogleEventTime;
  extendedProperties?: { private: Record<string, string> };
}

/** A Google Calendar event as returned by events.list / insert. */
export interface GoogleEvent {
  id: string;
  status?: string;
  updated?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  recurringEventId?: string;
  recurrence?: string[];
  extendedProperties?: { private?: Record<string, string> };
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
}

/** Pending remote deletion, persisted in localStorage until drained. */
export interface PendingCalendarDelete {
  calendarId: string;
  googleEventId: string;
}
