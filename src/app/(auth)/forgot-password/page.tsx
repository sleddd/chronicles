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
} from '@/lib/crypto/keyDerivation';

type RecoveryStep = 'email' | 'recovery' | 'newPassword' | 'success';

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

      // Send to server
      const response = await fetch('/api/user/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          newPassword,
          encryptedMasterKey: wrappedWithNewPassword.encryptedKey,
          masterKeyIv: wrappedWithNewPassword.iv,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to reset password');
        setLoading(false);
        return;
      }

      setStep('success');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
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
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white"
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
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white font-mono text-sm"
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
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white"
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
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white"
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

        {step === 'success' && (
          <div className="mt-8 space-y-6 text-center">
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <svg className="w-12 h-12 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <h2 className="text-lg font-medium text-green-800 mb-2">Password Reset Successful!</h2>
              <p className="text-sm text-green-700">
                Your password has been reset. You can now log in with your new password.
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
