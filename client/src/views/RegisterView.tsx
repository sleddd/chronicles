import { useState, useCallback, useEffect, useRef } from 'react';
import { useFreshSignIn } from '../hooks/useFreshSignIn.js';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { AuthTemplate } from '../components/templates/AuthTemplate.js';
import { useDarkAuthTheme } from '../hooks/useDarkAuthTheme.js';
import { RegisterForm } from '../components/organisms/RegisterForm.js';
import { RecoveryKeyDisplay } from '../components/molecules/RecoveryKeyDisplay.js';
import { PasskeyOffer } from '../components/organisms/PasskeyOffer.js';
import { passkeysAvailable } from '../services/passkeys.js';
import { ConsentCard, EMPTY_CONSENT, consentComplete, type ConsentValue } from '../components/molecules/ConsentCard.js';
import { useConsentStore } from '../stores/consentStore.js';
import { deriveAuthSecret, newRecoveryProof, LEGAL_VERSIONS } from '@chronicles/shared';

/** This tab's copy of the sign-up link's email and one-time code (sessionStorage). */
const INVITE_KEY = 'chronicles.invite-v1';

export function RegisterView() {
  useDarkAuthTheme();
  const navigate = useNavigate();
  const { register } = useAuth();
  const { setupEncryption, clearKey } = useEncryption();
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  // After the recovery key, where the browser can do it: the passkey step. The
  // password just chosen confirms it, so it is kept for that step only — in a
  // ref (no copies in render history), dropped the moment the step is over
  const [passkeyStep, setPasskeyStep] = useState<{ email: string } | null>(null);
  const [canPasskey, setCanPasskey] = useState(false);
  const passwordRef = useRef('');
  const emailRef = useRef('');
  useEffect(() => { void passkeysAvailable().then(setCanPasskey); }, []);
  useEffect(() => () => { passwordRef.current = ''; }, []);
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
  /** Starting a sign-up clears this tab's session storage (nothing of the last person
   *  carries over) and a fresh key can wipe the browser: put the link's code back, so a
   *  reload after a refused attempt still has it */
  const keepInvite = () => {
    if (!inviteCode) return;
    try { sessionStorage.setItem(INVITE_KEY, JSON.stringify({ invite: inviteCode, email: invitedEmail })); } catch { /* no session storage */ }
  };
  useEffect(() => {
    if (window.location.hash || query.has('invite') || query.has('email')) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, [query]);

  const freshSignIn = useFreshSignIn();
  const handleRegister = async ({ email, username, password }: { email: string; username: string; password: string }) => {
    // Nothing of whoever used this browser last may carry over into the new account
    await freshSignIn(email);
    // Setup encryption — generates master key, wraps with password + recovery key
    const result = await setupEncryption(password);
    keepInvite();

    // The server gets only derived secrets — never the password or recovery key
    const [authSecret, { recoveryKeyHash, recoveryKeySalt }] = await Promise.all([
      deriveAuthSecret(password, email),
      newRecoveryProof(result.recoveryKey),
    ]);

    // Register with server
    try {
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
    } catch (err) {
      // No account came of it: the key made for the attempt goes again (a tab
      // holds the key only while it is signed in)
      clearKey();
      throw err;
    }
    // The code is spent with the account
    try { sessionStorage.removeItem(INVITE_KEY); } catch { /* no session storage */ }

    // Record the consent given on the card (if this fails, the consent gate
    // asks again before the app opens)
    await agree({
      termsVersion: LEGAL_VERSIONS.terms,
      healthVersion: LEGAL_VERSIONS.health,
      breachNotice: consent.breachNotice,
      ...(consent.breachNotice === 'mail' ? { postalAddress: consent.postalAddress.trim() } : {}),
    }).catch(() => { /* asked again at the gate */ });

    // Show recovery key — user must save it
    passwordRef.current = password;
    emailRef.current = email;
    setRecoveryKey(result.recoveryKey);
  };

  const finish = useCallback(() => {
    passwordRef.current = '';
    setPasskeyStep(null);
    navigate('/dashboard');
  }, [navigate]);

  const handleConfirm = useCallback(() => {
    // Clear recovery key from memory before moving on
    setRecoveryKey(null);
    // Then the passkey step, where this browser can use one
    if (canPasskey && passwordRef.current) setPasskeyStep({ email: emailRef.current });
    else finish();
  }, [canPasskey, finish]);

  if (passkeyStep) {
    return (
      <AuthTemplate title="Sign In With One Touch">
        <PasskeyOffer email={passkeyStep.email} password={() => passwordRef.current} onDone={finish} />
      </AuthTemplate>
    );
  }

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
    <AuthTemplate title="Create your account" wide>
      <RegisterForm
        onSubmit={handleRegister}
        initialEmail={invitedEmail}
        canSubmit={consentComplete(consent)}
        consentMissing={[!consent.age, !consent.terms, !consent.health, consent.breachNotice === 'mail' && consent.postalAddress.trim().length < 8].filter(Boolean).length}
        footStart={<>Already have an account? <Link to="/login">Sign in</Link></>}
        extra={<ConsentCard value={consent} onChange={setConsent} bare />}
      />
    </AuthTemplate>
  );
}
