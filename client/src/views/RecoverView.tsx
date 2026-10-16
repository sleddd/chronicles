import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { auth as authApi, ApiError } from '../services/api.js';
import { AuthTemplate } from '../components/templates/AuthTemplate.js';
import { TextInput } from '../components/atoms/TextInput.js';
import { PasswordInput } from '../components/atoms/PasswordInput.js';
import { Button } from '../components/atoms/Button.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { AuthForm } from '../components/atoms/AuthForm.js';
import { ErrorBanner } from '../components/atoms/ErrorBanner.js';
import { FormField } from '../components/molecules/FormField.js';
import { RecoveryKeyDisplay } from '../components/molecules/RecoveryKeyDisplay.js';
import type { RecoverStep } from '../types/health.js';
import { deriveAuthSecret, deriveRecoveryProof, newRecoveryProof, passwordSchema } from '@chronicles/shared';

export function RecoverView() {
  const navigate = useNavigate();
  const { recoverAndRewrap } = useEncryption();
  const [step, setStep] = useState<RecoverStep>('email');
  const [email, setEmail] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryParams, setRecoveryParams] = useState<{ recoveryWrappedMK: string; recoveryWrapIv: string; recoveryKeySalt: string } | null>(null);
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
      if (!params.recoveryWrappedMK || !params.recoveryWrapIv || !params.recoveryKeySalt) {
        throw new Error('No recovery key set for this account');
      }
      setRecoveryParams({ recoveryWrappedMK: params.recoveryWrappedMK, recoveryWrapIv: params.recoveryWrapIv, recoveryKeySalt: params.recoveryKeySalt });
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
    // Just validate the key looks right before advancing — actual unwrap happens
    // atomically with the rewrap in handleNewPasswordStep to avoid auto-lock races.
    const cleanKey = recoveryKey.replace(/[-\s]/g, '');
    if (cleanKey.length < 16) {
      setError('Invalid recovery key');
      return;
    }
    setStep('newPassword');
  };

  const handleNewPasswordStep = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    // The server only sees a secret derived from the password, so the rules are checked here
    const rules = passwordSchema.safeParse(newPassword);
    if (!rules.success) {
      setError(rules.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      // Unwrap with recovery key and rewrap with new password in one atomic step —
      // avoids the auto-lock race that cleared the key between separate steps.
      const cleanKey = recoveryKey.replace(/[-\s]/g, '');
      const { salt, wrappedMK, wrapIv, newRecoveryKey: freshRecoveryKey, newRecoveryWrappedMK, newRecoveryWrapIv } = await recoverAndRewrap(
        cleanKey,
        recoveryParams!.recoveryWrappedMK,
        recoveryParams!.recoveryWrapIv,
        newPassword,
      );

      // Proofs only: the recovery key would unwrap the stored recoveryWrappedMK
      // and the password the new wrapped key, so neither is sent
      const [recoveryProof, newAuthSecret, { recoveryKeyHash: newRecoveryKeyHash, recoveryKeySalt: newRecoveryKeySalt }] = await Promise.all([
        deriveRecoveryProof(cleanKey, recoveryParams!.recoveryKeySalt),
        deriveAuthSecret(newPassword, email),
        newRecoveryProof(freshRecoveryKey),
      ]);

      // Send to server
      await authApi.recover({
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
        ...(needs2FA && twoFACode.trim() && { code: twoFACode.trim() }),
      });

      // Show the new recovery key before navigating away
      setNewRecoveryKey(freshRecoveryKey);
      setStep('newKey');
    } catch (err) {
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
            />
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
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? <Spinner size={18} /> : 'Reset password'}
          </Button>
        </AuthForm>
      )}

      {step === 'newKey' && newRecoveryKey && (
        <RecoveryKeyDisplay
          recoveryKey={newRecoveryKey}
          onConfirm={() => navigate('/')}
        />
      )}
    </AuthTemplate>
  );
}
