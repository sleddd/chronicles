import { useEffect, useSyncExternalStore } from 'react';
import { ensureAiConfig, isAiChatEnabled, isAiFeatureEnabled, isAiReady, subscribeAi, type AiFeature } from '../services/aiAssistant.js';
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

/** True when the AI is on and its chat is switched on (Settings → In-App AI). */
export function useAiChatEnabled(): boolean {
  useAiReady(); // loads the saved AI settings when unlocked
  return useSyncExternalStore(subscribeAi, isAiChatEnabled, () => false);
}

/** True when an opt-in sharing feature (AI task planning, AI insights) is on, agreed to in this browser, and AI is ready. */
export function useAiFeatureEnabled(feature: AiFeature): boolean {
  useAiReady(); // loads the saved AI settings when unlocked
  return useSyncExternalStore(subscribeAi, () => isAiFeatureEnabled(feature), () => false);
}
