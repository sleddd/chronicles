import { useSyncExternalStore } from 'react';
import { isAiReady, subscribeAi } from '../services/aiAssistant.js';

/** True when the AI assistant is switched on, unlocked, and fully configured. */
export function useAiReady(): boolean {
  return useSyncExternalStore(subscribeAi, isAiReady, () => false);
}
