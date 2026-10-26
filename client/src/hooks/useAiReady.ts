import { useEffect, useSyncExternalStore } from 'react';
import { ensureAiConfig, isAiReady, subscribeAi } from '../services/aiAssistant.js';
import { settings as settingsApi } from '../services/api.js';
import { useOptionalEncryption } from '../contexts/EncryptionContext.js';

/** True when the AI assistant is switched on, unlocked, and fully configured. */
export function useAiReady(): boolean {
  const ready = useSyncExternalStore(subscribeAi, isAiReady, () => false);
  const enc = useOptionalEncryption();
  const isUnlocked = !!enc?.isUnlocked;
  const decryptBytes = enc?.decryptBytes;
  // Unlocked but nothing in memory: load the saved AI settings again
  useEffect(() => {
    if (isUnlocked && !ready && decryptBytes) void ensureAiConfig(decryptBytes, settingsApi.getAll);
  }, [isUnlocked, ready, decryptBytes]);
  return ready;
}
