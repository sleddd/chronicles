'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  deriveKey,
  deriveKeyFromRecoveryKey,
  unwrapMasterKey,
  wrapMasterKey,
  parseRecoveryKeyFromDisplay,
  generateRecoveryKey,
  generateSalt,
  formatRecoveryKeyForDisplay,
} from '@/lib/crypto/keyDerivation';

type RecoveryStep = 'email' | 'recovery' | 'newPassword' | 'showNewRecoveryKey' | 'success';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<RecoveryStep>('email');
  const [email, setEmail] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Data from server for recovery
  const [recoveryData, setRecoveryData] = useState<{
    salt: string;
    recoveryKeySalt: string;
    encryptedMasterKey: string;
    masterKeyIv: string;
  } | null>(null);

  // Master key recovered from recovery key
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);

  // New recovery key to show after password reset
  const [newRecoveryKeyDisplay, setNewRecoveryKeyDisplay] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`/api/user/recover?email=${encodeURIComponent(email)}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to initiate recovery');
        setLoading(false);
        return;
      }

      setRecoveryData(data);
      setStep('recovery');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!recoveryData) {
      setError('Recovery data not found. Please start over.');
      setLoading(false);
      return;
    }

    try {
      // Parse the recovery key (remove dashes if user copy-pasted formatted version)
      const cleanRecoveryKey = parseRecoveryKeyFromDisplay(recoveryKey.trim());

      // Derive key from recovery key
      const recoveryDerivedKey = await deriveKeyFromRecoveryKey(
        cleanRecoveryKey,
        recoveryData.recoveryKeySalt
      );

      // Attempt to unwrap the master key
      const unwrappedMasterKey = await unwrapMasterKey(
        recoveryData.encryptedMasterKey,
        recoveryData.masterKeyIv,
        recoveryDerivedKey
      );

      setMasterKey(unwrappedMasterKey);
      setStep('newPassword');
    } catch (err) {
      console.error('Recovery key validation failed:', err);
      setError('Invalid recovery key. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!masterKey || !recoveryData) {
      setError('Recovery data lost. Please start over.');
      return;
    }

    setLoading(true);

    try {
      // Derive a new key from the new password
      const newPasswordKey = await deriveKey(newPassword, recoveryData.salt);

      // Wrap the master key with the new password key
      const wrappedWithNewPassword = await wrapMasterKey(masterKey, newPasswordKey);

      // Generate a NEW recovery key (rotate after use)
      const newRecoveryKey = generateRecoveryKey();
      const newRecoveryKeySalt = generateSalt();
      const newRecoveryDerivedKey = await deriveKeyFromRecoveryKey(newRecoveryKey, newRecoveryKeySalt);
      const wrappedWithNewRecovery = await wrapMasterKey(masterKey, newRecoveryDerivedKey);

      // Send to server with new recovery key
      const response = await fetch('/api/user/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          newPassword,
          encryptedMasterKey: wrappedWithNewPassword.encryptedKey,
          masterKeyIv: wrappedWithNewPassword.iv,
          // New recovery key data
          encryptedMasterKeyWithRecovery: wrappedWithNewRecovery.encryptedKey,
          recoveryKeyIv: wrappedWithNewRecovery.iv,
          recoveryKeySalt: newRecoveryKeySalt,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to reset password');
        setLoading(false);
        return;
      }

      // Show the new recovery key to the user
      setNewRecoveryKeyDisplay(formatRecoveryKeyForDisplay(newRecoveryKey));
      setStep('showNewRecoveryKey');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyRecoveryKey = async () => {
    try {
      await navigator.clipboard.writeText(newRecoveryKeyDisplay);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = newRecoveryKeyDisplay;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center backdrop-blur-sm bg-white/30">
      <div className="max-w-md w-full space-y-8 p-8 backdrop-blur-sm bg-white/30 rounded-lg shadow-md">
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/chronicles-logo.png"
            alt="Chronicles"
            className="h-16 w-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-gray-900">
            {step === 'success' ? 'Password Reset' : 'Recover Your Account'}
          </h1>
        </div>

        {step === 'email' && (
          <form className="mt-8 space-y-6" onSubmit={handleEmailSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your account email"
                className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 backdrop-blur-sm bg-white/30"
              />
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
              style={{ backgroundColor: loading ? undefined : '#1aaeae' }}
            >
              {loading ? 'Checking...' : 'Continue'}
            </button>

            <div className="text-center">
              <Link href="/login" className="text-sm hover:underline" style={{ color: '#1aaeae' }}>
                Back to Login
              </Link>
            </div>
          </form>
        )}

        {step === 'recovery' && (
          <form className="mt-8 space-y-6" onSubmit={handleRecoveryKeySubmit}>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800">
                Enter your recovery key to continue. This is the key you saved when you created your account.
              </p>
            </div>

            <div>
              <label htmlFor="recoveryKey" className="block text-sm font-medium text-gray-700">
                Recovery Key
              </label>
              <input
                id="recoveryKey"
                name="recoveryKey"
                type="text"
                required
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx-xxxx-..."
                className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 backdrop-blur-sm bg-white/30 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Paste your recovery key with or without dashes
              </p>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
              style={{ backgroundColor: loading ? undefined : '#1aaeae' }}
            >
              {loading ? 'Verifying...' : 'Verify Recovery Key'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setError('');
                }}
                className="text-sm hover:underline"
                style={{ color: '#1aaeae' }}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}

        {step === 'newPassword' && (
          <form className="mt-8 space-y-6" onSubmit={handleNewPasswordSubmit}>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-green-800">
                Recovery key verified! Now create a new password for your account.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                  New Password (min 12 characters)
                </label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 backdrop-blur-sm bg-white/30"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm New Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 backdrop-blur-sm bg-white/30"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
              style={{ backgroundColor: loading ? undefined : '#1aaeae' }}
            >
              {loading ? 'Resetting Password...' : 'Reset Password'}
            </button>
          </form>
        )}

        {step === 'showNewRecoveryKey' && (
          <div className="mt-8 space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm font-medium text-green-800">Password reset successful!</p>
              </div>
              <p className="text-sm text-green-700">
                Your recovery key has been rotated for security. Save your new key below.
              </p>
            </div>

            <div className="bg-amber-50 border-2 border-amber-500 rounded-lg p-4">
              <p className="text-sm font-bold text-amber-800 mb-2">SAVE YOUR NEW RECOVERY KEY</p>
              <p className="text-sm text-amber-700">
                Your old recovery key no longer works. This new key is the <strong>ONLY WAY</strong> to recover your account if you forget your password again.
              </p>
            </div>

            <div className="backdrop-blur-sm bg-white/40 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-2 text-center">Your New Recovery Key:</p>
              <div className="font-mono text-sm text-center backdrop-blur-sm bg-white/30 border border-border rounded p-3 break-all select-all">
                {newRecoveryKeyDisplay}
              </div>
              <button
                type="button"
                onClick={handleCopyRecoveryKey}
                className="mt-3 w-full px-4 py-2 text-sm text-white rounded-md"
                style={{ backgroundColor: copied ? '#059669' : '#1aaeae' }}
              >
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
            </div>

            <div className="border-t border-border pt-4">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-teal-600 border-border rounded"
                />
                <span className="text-sm text-gray-700">
                  I have saved my new recovery key in a secure location
                </span>
              </label>
            </div>

            <button
              type="button"
              onClick={() => setStep('success')}
              disabled={!confirmed}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white disabled:bg-gray-400"
              style={{ backgroundColor: confirmed ? '#1aaeae' : undefined }}
            >
              Continue to Login
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="mt-8 space-y-6 text-center">
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <svg className="w-12 h-12 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <h2 className="text-lg font-medium text-green-800 mb-2">You&apos;re All Set!</h2>
              <p className="text-sm text-green-700">
                Your password has been reset and your recovery key has been updated. You can now log in with your new password.
              </p>
            </div>

            <Link
              href="/login"
              className="inline-block w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white text-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
              style={{ backgroundColor: '#1aaeae' }}
            >
              Go to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
