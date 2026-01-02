'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { RecoveryKeyDisplay } from '@/components/auth/RecoveryKeyDisplay';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { seedDefaultTopics } from '@/lib/topics/seedDefaultTopics';
import {
  generateMasterKey,
  generateRecoveryKey,
  generateSalt,
  deriveKey,
  deriveKeyFromRecoveryKey,
  wrapMasterKey,
  formatRecoveryKeyForDisplay,
} from '@/lib/crypto/keyDerivation';
import {
  validatePasswordStrength,
  getStrengthColor,
  getStrengthPercentage,
} from '@/lib/passwordStrength';

type RegistrationStep = 'form' | 'settingUp' | 'showRecoveryKey';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedWarning, setAcceptedWarning] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<RegistrationStep>('form');
  const [recoveryKeyDisplay, setRecoveryKeyDisplay] = useState('');

  // Password strength calculation
  const passwordStrength = useMemo(() => validatePasswordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Check password strength
    if (!passwordStrength.valid) {
      setError(passwordStrength.message || 'Password is too weak');
      return;
    }

    if (!acceptedWarning) {
      setError('You must accept the password recovery warning');
      return;
    }

    if (!acceptedTerms) {
      setError('You must agree to the Terms of Service');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Register the user
      const response = await fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed');
        setLoading(false);
        return;
      }

      // Step 2: Sign in to get a session (needed to store keys)
      setStep('settingUp');
      const signInResult = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (!signInResult?.ok) {
        setError('Registration succeeded but login failed. Please try logging in.');
        setLoading(false);
        return;
      }

      // Step 3: Generate master key and recovery key (client-side)
      const masterKey = await generateMasterKey();
      const recoveryKey = generateRecoveryKey();
      const recoveryKeySalt = generateSalt();

      // Step 4: Get the user's salt from the registration response or fetch it
      const saltResponse = await fetch('/api/user/salt');
      const saltData = await saltResponse.json();

      if (!saltResponse.ok) {
        setError('Failed to retrieve encryption salt');
        setLoading(false);
        return;
      }

      // Step 5: Derive wrapping keys from password and recovery key
      const passwordKey = await deriveKey(password, saltData.salt);
      const recoveryDerivedKey = await deriveKeyFromRecoveryKey(recoveryKey, recoveryKeySalt);

      // Step 6: Wrap master key with both keys
      const wrappedWithPassword = await wrapMasterKey(masterKey, passwordKey);
      const wrappedWithRecovery = await wrapMasterKey(masterKey, recoveryDerivedKey);

      // Step 7: Store wrapped keys on server
      const setupResponse = await fetch('/api/user/setup-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedMasterKey: wrappedWithPassword.encryptedKey,
          masterKeyIv: wrappedWithPassword.iv,
          encryptedMasterKeyWithRecovery: wrappedWithRecovery.encryptedKey,
          recoveryKeyIv: wrappedWithRecovery.iv,
          recoveryKeySalt: recoveryKeySalt,
        }),
      });

      if (!setupResponse.ok) {
        setError('Failed to set up encryption keys');
        setLoading(false);
        return;
      }

      // Step 8: Store master key in Zustand and sessionStorage for immediate use
      useEncryption.setState({ encryptionKey: masterKey, isKeyReady: true });
      try {
        const jwk = await window.crypto.subtle.exportKey('jwk', masterKey);
        sessionStorage.setItem('chronicles_session_key', JSON.stringify(jwk));
      } catch (storageErr) {
        console.error('Failed to store key in session:', storageErr);
      }

      // Step 9: Seed default topics for new user
      await seedDefaultTopics(masterKey);

      // Step 10: Show recovery key to user
      setRecoveryKeyDisplay(formatRecoveryKeyForDisplay(recoveryKey));
      setStep('showRecoveryKey');
      setLoading(false);
    } catch (err) {
      console.error('Registration error:', err);
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  const handleRecoveryKeyConfirmed = () => {
    router.push('/');
  };

  // Show recovery key after successful registration
  if (step === 'showRecoveryKey') {
    return (
      <RecoveryKeyDisplay
        recoveryKey={recoveryKeyDisplay}
        onConfirmed={handleRecoveryKeyConfirmed}
      />
    );
  }

  // Show setting up screen
  if (step === 'settingUp') {
    return (
      <div className="min-h-screen flex items-center justify-center backdrop-blur-sm bg-white/30">
        <div className="max-w-md w-full space-y-8 p-8 backdrop-blur-sm bg-white/30 rounded-lg shadow-md text-center">
          <div className="flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/chronicles-logo.png"
              alt="Chronicles"
              className="h-20 w-auto mb-0"
            />
          </div>
          <div className="animate-pulse">
            <div className="inline-block w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <h2 className="text-lg font-medium text-gray-900">Setting up your secure account...</h2>
            <p className="text-sm text-gray-500 mt-2">Generating encryption keys</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center backdrop-blur-sm bg-white/30">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/chronicles-logo.png"
            alt="Chronicles"
            className="h-20 w-auto mb-0"
          />
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 backdrop-blur-sm bg-white/30"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password (min 12 characters)
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 backdrop-blur-sm bg-white/30"
              />
              {/* Password strength indicator */}
              {password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600">Password strength:</span>
                    <span
                      className="font-medium capitalize"
                      style={{ color: getStrengthColor(passwordStrength.strength) }}
                    >
                      {passwordStrength.strength}
                    </span>
                  </div>
                  <div className="h-1.5 backdrop-blur-sm bg-white/50 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${getStrengthPercentage(passwordStrength.entropy)}%`,
                        backgroundColor: getStrengthColor(passwordStrength.strength),
                      }}
                    />
                  </div>
                  {passwordStrength.suggestions.length > 0 && (
                    <ul className="mt-1 text-xs text-gray-500 list-disc pl-4">
                      {passwordStrength.suggestions.slice(0, 2).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
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

          <div className="bg-amber-50 border-2 border-amber-500 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-bold text-amber-800">IMPORTANT: Recovery Key Required</h3>
                <div className="mt-2 text-sm text-amber-700">
                  <p>
                    After registration, you will receive a <strong>recovery key</strong>.
                    This key is the <strong>ONLY WAY</strong> to recover your account if you forget your password.
                  </p>
                  <p className="mt-2">
                    You must save this key securely. Without it and your password, your data cannot be recovered.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={acceptedWarning}
                  onChange={(e) => setAcceptedWarning(e.target.checked)}
                  className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-border rounded"
                />
                <span className="ml-2 text-sm text-amber-900 font-medium">
                  I understand I must save my recovery key
                </span>
              </label>
            </div>
          </div>

          {/* Terms of Service */}
          <div className="backdrop-blur-sm bg-white/30 border border-border rounded-lg p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-2">Terms of Service Agreement</h3>
            <p className="text-xs text-gray-600 mb-3">
              By creating an account, you acknowledge and agree to our terms regarding data security and limitation of liability.
            </p>
            <button
              type="button"
              onClick={() => setShowTerms(!showTerms)}
              className="text-xs font-medium mb-3 flex items-center gap-1"
              style={{ color: '#1aaeae' }}
            >
              {showTerms ? 'Hide' : 'Read'} full Terms of Service
              <svg
                className={`w-3 h-3 transition-transform ${showTerms ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showTerms && (
              <div className="text-xs text-gray-700 backdrop-blur-sm bg-white/30 border border-border rounded p-3 mb-3 max-h-48 overflow-y-auto space-y-2">
                <p className="font-semibold">Data Security & Limitation of Liability</p>
                <p>
                  While we implement encryption and reasonable security measures to protect your data, we cannot guarantee absolute security. You understand and accept that:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong>No Warranty:</strong> This service is provided &quot;as is&quot; without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.
                  </li>
                  <li>
                    <strong>Data Risk:</strong> We are not responsible for any data that is lost, corrupted, stolen, accessed by unauthorized parties, or otherwise compromised, regardless of cause.
                  </li>
                  <li>
                    <strong>Sensitive Information:</strong> You assume all risk associated with storing sensitive personal information, including but not limited to medical records, medication schedules, health data, financial information, or other private content.
                  </li>
                  <li>
                    <strong>Limitation of Liability:</strong> Under no circumstances shall Chronicles, its owners, operators, developers, or affiliates be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from your use of this service or any loss of data.
                  </li>
                  <li>
                    <strong>Waiver of Claims:</strong> You agree to waive any and all claims, actions, or demands against Chronicles and its affiliates related to data loss, security breaches, or service interruptions.
                  </li>
                  <li>
                    <strong>Indemnification:</strong> You agree to indemnify and hold harmless Chronicles and its affiliates from any claims, damages, or expenses arising from your use of the service.
                  </li>
                </ul>
              </div>
            )}

            <label className="flex items-start">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="h-4 w-4 mt-0.5 text-teal-600 focus:ring-teal-500 border-border rounded"
              />
              <span className="ml-2 text-sm text-gray-900 font-medium">
                I agree to the Terms of Service
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !acceptedWarning || !acceptedTerms}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            style={{ backgroundColor: (loading || !acceptedWarning || !acceptedTerms) ? undefined : '#2d2c2a' }}
            onMouseOver={(e) => { if (!loading && acceptedWarning && acceptedTerms) e.currentTarget.style.backgroundColor = '#000000'; }}
            onMouseOut={(e) => { if (!loading && acceptedWarning && acceptedTerms) e.currentTarget.style.backgroundColor = '#000000'; }}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

          <div className="text-center">
            <Link href="/login" className="text-sm hover:underline" style={{ color: '#2d2c2a' }}>
              Already have an account? Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
