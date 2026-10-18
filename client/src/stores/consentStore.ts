import { create } from 'zustand';
import { consent as consentApi, type ConsentInput, type ConsentStatus } from '../services/api.js';

/* The account's Terms / health-data consent, shared by the consent gate
   (ProtectedRoute), sign-up and Settings. */

interface ConsentState {
  status: ConsentStatus | null;
  loadError: boolean;
  load: () => Promise<void>;
  agree: (c: ConsentInput) => Promise<void>;
  setBreachNotice: (breachNotice: 'email' | 'mail', postalAddress?: string) => Promise<void>;
  reset: () => void;
}

export const useConsentStore = create<ConsentState>(set => ({
  status: null,
  loadError: false,
  load: async () => {
    try { set({ status: await consentApi.status(), loadError: false }); }
    catch { set({ loadError: true }); }
  },
  agree: async c => { set({ status: await consentApi.agree(c), loadError: false }); },
  setBreachNotice: async (b, addr) => { set({ status: await consentApi.setBreachNotice(b, addr) }); },
  reset: () => set({ status: null, loadError: false }),
}));

/** Which items still need agreeing to: none when consent is current. */
export function consentNeeded(status: ConsentStatus | null): { terms: boolean; health: boolean; age: boolean } {
  if (!status) return { terms: true, health: true, age: true };
  const c = status.consent;
  if (!c || c.healthConsentWithdrawnAt) return { terms: true, health: true, age: true };
  return {
    terms: c.termsVersion !== status.current.terms,
    health: c.healthVersion !== status.current.health,
    age: !c.ageConfirmed,
  };
}

export function consentIsCurrent(status: ConsentStatus | null): boolean {
  const n = consentNeeded(status);
  return !!status?.consent && !n.terms && !n.health && !n.age;
}
