'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
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
      const response = await fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      router.push('/login?registered=true');
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
            className="h-20 w-auto mb-6"
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
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white"
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
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white"
              />
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
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white"
              />
            </div>
          </div>

          <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-bold text-red-800">CRITICAL WARNING</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p className="font-bold">There is NO PASSWORD RECOVERY.</p>
                  <p className="mt-1">
                    If you forget your password, all your data will be PERMANENTLY LOST.
                    No one can recover it, not even our support team.
                  </p>
                  <p className="mt-2">
                    Please write down your password and store it securely.
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
                  className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-red-900 font-medium">
                  I understand and accept this risk
                </span>
              </label>
            </div>
          </div>

          {/* Terms of Service */}
          <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
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
              <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-3 mb-3 max-h-48 overflow-y-auto space-y-2">
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
                className="h-4 w-4 mt-0.5 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
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
            style={{ backgroundColor: (loading || !acceptedWarning || !acceptedTerms) ? undefined : '#1aaeae' }}
            onMouseOver={(e) => { if (!loading && acceptedWarning && acceptedTerms) e.currentTarget.style.backgroundColor = '#158f8f'; }}
            onMouseOut={(e) => { if (!loading && acceptedWarning && acceptedTerms) e.currentTarget.style.backgroundColor = '#1aaeae'; }}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

          <div className="text-center">
            <Link href="/login" className="text-sm hover:underline" style={{ color: '#1aaeae' }}>
              Already have an account? Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
