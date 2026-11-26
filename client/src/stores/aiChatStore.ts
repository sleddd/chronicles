import { create } from 'zustand';
import { aiChat, type AiChatStatus } from '../services/api.js';
import { getAiStatus, loadAiStatus, setAiStatus, subscribeAiStatus } from '../services/aiAccess.js';
import { AI_CONSENT_VERSION } from '../utils/chatDisclosure.js';

/* The AI chat's consent (18+ confirmed, protocol version), block and pause
   status, kept on the server and shared by the chat panel and Settings →
   In-App AI. The status itself lives in services/aiAccess.ts (the request code
   checks it before every send); this store mirrors it for the components, so a
   declined request reported from anywhere shows up here at once. */

interface AiChatState {
  status: AiChatStatus | null;
  loadError: boolean;
  load: () => Promise<void>;
  accept: () => Promise<void>;
  withdraw: () => Promise<void>;
}

export const useAiChatStore = create<AiChatState>(set => ({
  status: getAiStatus(),
  loadError: false,
  load: async () => {
    const s = await loadAiStatus();
    set({ loadError: !s });
  },
  accept: async () => { setAiStatus(await aiChat.consent(AI_CONSENT_VERSION)); },
  withdraw: async () => { setAiStatus(await aiChat.withdraw()); },
}));

subscribeAiStatus(() => useAiChatStore.setState({ status: getAiStatus() }));

/** Consent is current when given for this version of the protocol. */
export function hasCurrentConsent(status: AiChatStatus | null): boolean {
  return !!status && !status.blocked && !!status.consentAt && (status.consentVersion ?? 0) >= AI_CONSENT_VERSION;
}
