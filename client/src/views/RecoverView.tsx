import { useAuth } from '../contexts/AuthContext.js';
import { Checkbox } from '../components/atoms/Checkbox.js';
import { useState, type FormEvent } from 'react';
import { useFreshSignIn } from '../hooks/useFreshSignIn.js';
import { useNavigate, Link } from 'react-router-dom';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { auth as authApi, ApiError } from '../services/api.js';
import { AuthTemplate } from '../components/templates/AuthTemplate.js';
import { useDarkAuthTheme } from '../hooks/useDarkAuthTheme.js';
import { TextInput } from '../components/atoms/TextInput.js';
import { PasswordInput } from '../components/atoms/PasswordInput.js';
import { Button } from '../components/atoms/Button.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { AuthForm } from '../components/atoms/AuthForm.js';
import { ErrorBanner } from '../components/atoms/ErrorBanner.js';
import { FormField } from '../components/molecules/FormField.js';
import { RecoveryKeyDisplay } from '../components/molecules/RecoveryKeyDisplay.js';
import type { RecoverStep } from '../types/health.js';
import { deriveAuthSecret, deriveRecoveryProof, newRecoveryProof, newPasswordProblem } from '@chronicles/shared';
import { PasswordStrengthMeter } from '../components/molecules/PasswordStrengthMeter.js';

export function RecoverView() {
  useDarkAuthTheme();
  const navigate = useNavigate();
  const { recoverAndRewrap, clearKey } = useEncryption();
  const { adoptSession } = useAuth();
  // A lost or stolen device is a common reason to be here: its passkeys can go too
  const [removePasskeys, setRemovePasskeys] = useState(false);
  const [step, setStep] = useState<RecoverStep>('email');
  const [email, setEmail] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // The salt comes for the email. The wrapped key comes only once the recovery
  // key (and a 2FA code, when the account has 2FA) has checked out, with a
  // short-lived token that stands in for the code when the new password is sent
  const [recoverySalt, setRecoverySalt] = useState('');
  const [recoveryWrap, setRecoveryWrap] = useState<{ recoveryWrappedMK: string; recoveryWrapIv: string; recoveryToken: string } | null>(null);
  const [has2FA, setHas2FA] = useState(false);
  const [newRecoveryKey, setNewRecoveryKey] = useState('');
  // Accounts with 2FA also need an authenticator or backup code — the server
  // asks for it only once the recovery key checks out
  const [needs2FA, setNeeds2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');

  const handleEmailStep = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const params = await authApi.getRecoveryParams(email);
      if (!params.recoveryKeySalt) {
        throw new Error('No recovery key set for this account');
      }
      setRecoverySalt(params.recoveryKeySalt);
      setStep('recovery');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find account');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryStep = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanKey = recoveryKey.replace(/[-\s]/g, '');
    if (cleanKey.length < 16) {
      setError('Invalid recovery key');
      return;
    }
    // The server checks a proof of the key (never the key) and only then hands
    // over the wrapped key. The unwrap itself happens with the rewrap in
    // handleNewPasswordStep, in one step
    setLoading(true);
    try {
      const recoveryProof = await deriveRecoveryProof(cleanKey, recoverySalt);
      const wrap = await authApi.recoveryWrap({
        email,
        recoveryProof,
        ...(needs2FA && twoFACode.trim() && { code: twoFACode.trim() }),
      });
      setRecoveryWrap(wrap);
      setHas2FA(wrap.totpEnabled);
      // That code is spent: the token carries on from here
      setNeeds2FA(false);
      setTwoFACode('');
      setStep('newPassword');
    } catch (err) {
      if (err instanceof ApiError && err.body.requires2FA) setNeeds2FA(true);
      setError(err instanceof Error ? err.message : 'Invalid recovery key');
    } finally {
      setLoading(false);
    }
  };

  const freshSignIn = useFreshSignIn();
  const handleNewPasswordStep = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    // The server only sees a secret derived from the password, so the rules are checked here
    const pwProblem = newPasswordProblem(newPassword, { email });
    if (pwProblem) {
      setError(pwProblem);
      return;
    }

    setLoading(true);
    try {
      // Nothing of whoever used this browser last may carry over
      await freshSignIn(email);
      // Unwrap with recovery key and rewrap with new password in one atomic step —
      // avoids the auto-lock race that cleared the key between separate steps.
      const cleanKey = recoveryKey.replace(/[-\s]/g, '');
      const { salt, wrappedMK, wrapIv, newRecoveryKey: freshRecoveryKey, newRecoveryWrappedMK, newRecoveryWrapIv } = await recoverAndRewrap(
        cleanKey,
        recoveryWrap!.recoveryWrappedMK,
        recoveryWrap!.recoveryWrapIv,
        newPassword,
      );

      // Proofs only: the recovery key would unwrap the stored recoveryWrappedMK
      // and the password the new wrapped key, so neither is sent
      const [recoveryProof, newAuthSecret, { recoveryKeyHash: newRecoveryKeyHash, recoveryKeySalt: newRecoveryKeySalt }] = await Promise.all([
        deriveRecoveryProof(cleanKey, recoverySalt),
        deriveAuthSecret(newPassword, email),
        newRecoveryProof(freshRecoveryKey),
      ]);

      // Send to server
      const { user } = await authApi.recover({
        email,
        recoveryProof,
        newAuthSecret,
        newEncryptedMasterKey: wrappedMK,
        newKekSalt: salt,
        newKekWrapIv: wrapIv,
        newRecoveryWrappedMK,
        newRecoveryWrapIv,
        newRecoveryKeyHash,
        newRecoveryKeySalt,
        // The token from the key check stands in for the 2FA code. Once it has
        // run out (five minutes), the server asks for a code again
        ...(needs2FA && twoFACode.trim() ? { code: twoFACode.trim() } : { recoveryToken: recoveryWrap!.recoveryToken }),
        ...(removePasskeys && { removePasskeys: true }),
      });
      // The server signed this browser in, and the key is open here: carry on signed in
      adoptSession({ ...user, totpEnabled: has2FA });

      // Show the new recovery key before navigating away
      setNewRecoveryKey(freshRecoveryKey);
      setStep('newKey');
    } catch (err) {
      // No session came of it: the key opened for the attempt goes again
      clearKey();
      if (err instanceof ApiError && err.body.requires2FA) setNeeds2FA(true);
      setError(err instanceof Error ? err.message : 'Invalid recovery key or recovery failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthTemplate
      title="Recover Account"
      footer={step !== 'newKey' ? <>Remember your password? <Link to="/login">Sign in</Link></> : undefined}
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {step === 'email' && (
        <AuthForm onSubmit={handleEmailStep}>
          <FormField label="Email address" htmlFor="recover-email">
            <TextInput
              id="recover-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </FormField>
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? <Spinner size={18} /> : 'Continue'}
          </Button>
        </AuthForm>
      )}

      {step === 'recovery' && (
        <AuthForm onSubmit={handleRecoveryStep}>
          <FormField label="Recovery Key" htmlFor="recover-key">
            <TextInput
              id="recover-key"
              value={recoveryKey}
              onChange={e => setRecoveryKey(e.target.value)}
              placeholder="Enter your recovery key"
              required
            />
          </FormField>
          {needs2FA && (
            <FormField label="Authenticator or backup code" htmlFor="recover-key-2fa">
              <TextInput
                id="recover-key-2fa"
                value={twoFACode}
                onChange={e => setTwoFACode(e.target.value)}
                placeholder="123456 or xxxxxx-xxxxxx"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </FormField>
          )}
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? <Spinner size={18} /> : 'Verify'}
          </Button>
        </AuthForm>
      )}

      {step === 'newPassword' && (
        <AuthForm onSubmit={handleNewPasswordStep}>
          <FormField label="New Password" htmlFor="recover-newpw">
            <PasswordInput
              id="recover-newpw"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Min 12 chars"
              required
              autoComplete="new-password"
            />
            <PasswordStrengthMeter password={newPassword} email={email} />
          </FormField>
          <FormField label="Confirm Password" htmlFor="recover-confirm">
            <PasswordInput
              id="recover-confirm"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              required
            />
          </FormField>
          {needs2FA && (
            <FormField label="Authenticator or backup code" htmlFor="recover-2fa">
              <TextInput
                id="recover-2fa"
                value={twoFACode}
                onChange={e => setTwoFACode(e.target.value)}
                placeholder="123456 or xxxxxx-xxxxxx"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </FormField>
          )}
          <Checkbox
            checked={removePasskeys}
            onChange={setRemovePasskeys}
            label="Also remove every passkey (choose this if a device was lost or stolen)"
          />
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? <Spinner size={18} /> : 'Reset password'}
          </Button>
        </AuthForm>
      )}

      {step === 'newKey' && newRecoveryKey && (
        <RecoveryKeyDisplay
          recoveryKey={newRecoveryKey}
          onConfirm={() => navigate('/dashboard')}
        />
      )}
    </AuthTemplate>
  );
}
