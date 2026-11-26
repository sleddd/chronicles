import { useEffect, useSyncExternalStore } from 'react';
import { ensureAiConfig, isAiChatEnabled, isAiFeatureEnabled, isAiReady, subscribeAi, type AiFeature } from '../services/aiAssistant.js';
import { settings as settingsApi } from '../services/api.js';
import { getAiStatus, loadAiStatus } from '../services/aiAccess.js';
import { useOptionalEncryption } from '../contexts/EncryptionContext.js';

/** True when the AI assistant is switched on, unlocked, fully configured, and not paused or turned off for the account. */
export function useAiReady(): boolean {
  const ready = useSyncExternalStore(subscribeAi, isAiReady, () => false);
  const enc = useOptionalEncryption();
  const isUnlocked = !!enc?.isUnlocked;
  const decryptBytes = enc?.decryptBytes;
  // Unlocked but nothing in memory: load the saved AI settings again
  useEffect(() => {
    if (isUnlocked && !ready && decryptBytes) void ensureAiConfig(decryptBytes, settingsApi.getAll);
  }, [isUnlocked, ready, decryptBytes]);
  // Set up: read the account's In-App AI status once (a pause or block hides AI
  // features everywhere, and every Anthropic request needs its anonymous id)
  useEffect(() => {
    if (isUnlocked && ready && !getAiStatus()) void loadAiStatus();
  }, [isUnlocked, ready]);
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
