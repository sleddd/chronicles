import { create } from 'zustand';
import { aiChat, type AiChatStatus } from '../services/api.js';
import { AI_CONSENT_VERSION } from '../utils/chatDisclosure.js';

/* The AI chat's consent (18+ confirmed, protocol version) and block status,
   kept on the server and shared by the chat panel and Settings → In-App AI. */

interface AiChatState {
  status: AiChatStatus | null;
  loadError: boolean;
  load: () => Promise<void>;
  accept: () => Promise<void>;
  withdraw: () => Promise<void>;
}

export const useAiChatStore = create<AiChatState>(set => ({
  status: null,
  loadError: false,
  load: async () => {
    try { set({ status: await aiChat.status(), loadError: false }); }
    catch { set({ loadError: true }); }
  },
  accept: async () => { set({ status: await aiChat.consent(AI_CONSENT_VERSION) }); },
  withdraw: async () => { set({ status: await aiChat.withdraw() }); },
}));

/** Consent is current when given for this version of the protocol. */
export function hasCurrentConsent(status: AiChatStatus | null): boolean {
  return !!status && !status.blocked && !!status.consentAt && (status.consentVersion ?? 0) >= AI_CONSENT_VERSION;
}
