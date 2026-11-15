import { useState, useCallback, useEffect } from 'react';
import { useFreshSignIn } from '../hooks/useFreshSignIn.js';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { AuthTemplate } from '../components/templates/AuthTemplate.js';
import { RegisterForm } from '../components/organisms/RegisterForm.js';
import { RecoveryKeyDisplay } from '../components/molecules/RecoveryKeyDisplay.js';
import { ConsentCard, EMPTY_CONSENT, consentComplete, type ConsentValue } from '../components/molecules/ConsentCard.js';
import { useConsentStore } from '../stores/consentStore.js';
import { deriveAuthSecret, newRecoveryProof, LEGAL_VERSIONS } from '@chronicles/shared';

/** This tab's copy of the sign-up link's email and one-time code (sessionStorage). */
const INVITE_KEY = 'chronicles.invite-v1';

export function RegisterView() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { setupEncryption } = useEncryption();
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [consent, setConsent] = useState<ConsentValue>(EMPTY_CONSENT);
  const agree = useConsentStore(s => s.agree);
  // The sign-up link from a beta approval carries the email and its invite code
  // — after the # (never sent to the server, so it stays out of access logs);
  // links sent before that carry them in the query
  const [query] = useSearchParams();
  // Read once, then taken out of the address bar (below) so the one-time code
  // doesn't sit in the browser's history. Kept for this tab only, so a reload
  // of the page still has it
  const [{ inviteCode, invitedEmail }] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    let invite = (fragment.get('invite') ?? query.get('invite'))?.trim() || undefined;
    let email = (fragment.get('email') ?? query.get('email'))?.trim() ?? '';
    try {
      if (invite) sessionStorage.setItem(INVITE_KEY, JSON.stringify({ invite, email }));
      else {
        const kept = JSON.parse(sessionStorage.getItem(INVITE_KEY) ?? 'null') as { invite?: unknown; email?: unknown } | null;
        if (kept && typeof kept.invite === 'string') {
          invite = kept.invite;
          if (!email && typeof kept.email === 'string') email = kept.email;
        }
      }
    } catch { /* no session storage: the link still works until a reload */ }
    return { inviteCode: invite, invitedEmail: email };
  });
  useEffect(() => {
    if (window.location.hash || query.has('invite') || query.has('email')) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, [query]);

  const freshSignIn = useFreshSignIn();
  const handleRegister = async ({ email, username, password }: { email: string; username: string; password: string }) => {
    // Nothing of whoever used this browser last may carry over into the new account
    await freshSignIn();
    // Setup encryption — generates master key, wraps with password + recovery key
    const result = await setupEncryption(password);

    // The server gets only derived secrets — never the password or recovery key
    const [authSecret, { recoveryKeyHash, recoveryKeySalt }] = await Promise.all([
      deriveAuthSecret(password, email),
      newRecoveryProof(result.recoveryKey),
    ]);

    // Register with server
    await register({
      email,
      username,
      authSecret,
      encryptedMasterKey: result.wrappedMK,
      kekSalt: result.salt,
      kekWrapIv: result.wrapIv,
      recoveryWrappedMK: result.recoveryWrappedMK,
      recoveryWrapIv: result.recoveryWrapIv,
      recoveryKeyHash,
      recoveryKeySalt,
      ...(inviteCode ? { inviteCode } : {}),
    });

    // Record the consent given on the card (if this fails, the consent gate
    // asks again before the app opens)
    await agree({
      termsVersion: LEGAL_VERSIONS.terms,
      healthVersion: LEGAL_VERSIONS.health,
      breachNotice: consent.breachNotice,
      ...(consent.breachNotice === 'mail' ? { postalAddress: consent.postalAddress.trim() } : {}),
    }).catch(() => { /* asked again at the gate */ });

    // Show recovery key — user must save it
    setRecoveryKey(result.recoveryKey);
  };

  const handleConfirm = useCallback(() => {
    // Clear recovery key from memory before navigating
    setRecoveryKey(null);
    navigate('/dashboard');
  }, [navigate]);

  if (recoveryKey) {
    return (
      <AuthTemplate title="Save Your Recovery Key">
        <RecoveryKeyDisplay
          recoveryKey={recoveryKey}
          onConfirm={handleConfirm}
        />
      </AuthTemplate>
    );
  }

  return (
    <AuthTemplate
      title="Create Account"
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <RegisterForm
        onSubmit={handleRegister}
        initialEmail={invitedEmail}
        canSubmit={consentComplete(consent)}
        extra={<ConsentCard value={consent} onChange={setConsent} />}
      />
    </AuthTemplate>
  );
}
