import { useLayoutEffect } from 'react';
import { useUIStore } from '../stores/uiStore.js';

/** Sign in, sign up and recovery: always the dark theme while the page shows (before it paints),
    then back to the person's own theme */
export function useDarkAuthTheme(): void {
  useLayoutEffect(() => {
    const { setForcedTheme } = useUIStore.getState();
    setForcedTheme('dark');
    return () => setForcedTheme(null);
  }, []);
}
