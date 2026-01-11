'use client';

import { useAccentColor } from '@/lib/hooks/useAccentColor';

/**
 * Component that initializes accent color CSS variables and background image events.
 * Must be rendered inside the app to trigger the useAccentColor hook effects.
 */
export function AccentColorInitializer() {
  // This hook sets CSS custom properties and dispatches background brightness events
  useAccentColor();
  return null;
}
