import { useState, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { AuthTemplate } from '../components/templates/AuthTemplate.js';
import { RegisterForm } from '../components/organisms/RegisterForm.js';
import { RecoveryKeyDisplay } from '../components/molecules/RecoveryKeyDisplay.js';
import { ConsentCard, EMPTY_CONSENT, consentComplete, type ConsentValue } from '../components/molecules/ConsentCard.js';
import { useConsentStore } from '../stores/consentStore.js';
import { deriveAuthSecret, newRecoveryProof, LEGAL_VERSIONS } from '@chronicles/shared';

export function RegisterView() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { setupEncryption } = useEncryption();
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [consent, setConsent] = useState<ConsentValue>(EMPTY_CONSENT);
  const agree = useConsentStore(s => s.agree);
  // The sign-up link from a beta approval carries the email and its invite code
  const [params] = useSearchParams();
  const inviteCode = params.get('invite')?.trim() || undefined;
  const invitedEmail = params.get('email')?.trim() ?? '';

  const handleRegister = async ({ email, username, password }: { email: string; username: string; password: string }) => {
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
