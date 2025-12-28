'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { seedDefaultTopics } from '@/lib/topics/seedDefaultTopics';

export function PasswordReentryModal() {
  const { data: session, status } = useSession();
  const { deriveAndStoreKey, isKeyReady } = useEncryption();

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Show modal when authenticated but key is not ready
  if (status !== 'authenticated' || isKeyReady || !session) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const saltResponse = await fetch('/api/user/salt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: session.user.email }),
      });

      if (!saltResponse.ok) {
        throw new Error('Failed to retrieve salt');
      }

      const { salt } = await saltResponse.json();

      await deriveAndStoreKey(password, salt);

      // Seed default topics if needed
      const { encryptionKey } = useEncryption.getState();
      if (encryptionKey) {
        await seedDefaultTopics(encryptionKey);
      }

      setPassword('');
      sessionStorage.setItem('recent_login', 'true');
    } catch {
      setError('Invalid password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Re-enter Password</h2>
        <p className="text-gray-600 mb-4">
          Your encryption key was lost when the page refreshed. Please re-enter your password to decrypt your entries.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              autoFocus
            />
          </div>

          {error && (
            <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Unlocking...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}
