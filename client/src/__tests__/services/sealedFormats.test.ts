import { describe, it, expect, beforeEach } from 'vitest';
import { sealMarkerHeld, noteSealMarker, LEGACY_FORMATS_UNTIL } from '../../services/sealedFormats.js';

beforeEach(() => localStorage.clear());

describe('seal markers the server could leave out', () => {
  const before = LEGACY_FORMATS_UNTIL - 1;

  it('follows the server while this browser has never seen the marker', () => {
    expect(sealMarkerHeld('topicsSealV2', false, before)).toBe(false);
    expect(sealMarkerHeld('topicsSealV2', true, before)).toBe(true);
  });

  it('keeps counting a marker once seen, even when the server drops it', () => {
    sealMarkerHeld('topicsSealV2', true, before);
    expect(sealMarkerHeld('topicsSealV2', false, before)).toBe(true);
    expect(sealMarkerHeld('dosesSealV2', false, before)).toBe(false);
    noteSealMarker('dosesSealV2');
    expect(sealMarkerHeld('dosesSealV2', false, before)).toBe(true);
  });

  it('refuses the older formats everywhere from the cut-off', () => {
    expect(sealMarkerHeld('entriesSealV3', false, LEGACY_FORMATS_UNTIL)).toBe(true);
  });
});
