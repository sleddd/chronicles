'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { seedDefaultTopics } from '@/lib/topics/seedDefaultTopics';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get('registered');

  const { deriveAndStoreKey, unwrapAndStoreMasterKey } = useEncryption();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
        return;
      }

      // Get salt and encrypted master key before setting up encryption
      try {
        const saltResponse = await fetch('/api/user/salt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        if (saltResponse.ok) {
          const { salt, encryptedMasterKey, masterKeyIv } = await saltResponse.json();

          console.log('[Login Debug] Salt response:', {
            hasSalt: !!salt,
            hasEncryptedMasterKey: !!encryptedMasterKey,
            hasMasterKeyIv: !!masterKeyIv,
          });

          // Check if user has master key system (new users) or legacy (old users)
          if (encryptedMasterKey && masterKeyIv) {
            // New system: unwrap master key
            console.log('[Login Debug] Using NEW master key system');
            await unwrapAndStoreMasterKey(password, salt, encryptedMasterKey, masterKeyIv);
          } else {
            // Legacy system: derive key directly from password
            // Use legacy iterations (100,000) for backward compatibility
            console.log('[Login Debug] Using LEGACY key derivation (100k iterations)');
            await deriveAndStoreKey(password, salt, true);
          }

          sessionStorage.setItem('recent_login', 'true');

          // Seed default topics for new users (only runs if no topics exist)
          const { encryptionKey } = useEncryption.getState();
          if (encryptionKey) {
            await seedDefaultTopics(encryptionKey);
          }
        }
      } catch (keyError) {
        console.error('Failed to set up encryption key:', keyError);
        // Still proceed - user can re-enter password via modal
      }

      router.push('/');
      router.refresh();
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
            className="h-20 w-auto mb-0"
          />
        </div>

        {registered && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            Account created successfully! You can now sign in.
          </div>
        )}

        <form className="mt-4 space-y-6" onSubmit={handleSubmit}>
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
                Password
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
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            style={{ backgroundColor: loading ? undefined : '#1aaeae' }}
            onMouseOver={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#158f8f'; }}
            onMouseOut={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#1aaeae'; }}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>

          <div className="text-center space-y-2">
            <div>
              <Link href="/forgot-password" className="text-sm hover:underline" style={{ color: '#1aaeae' }}>
                Forgot your password?
              </Link>
            </div>
            <div>
              <Link href="/register" className="text-sm hover:underline" style={{ color: '#1aaeae' }}>
                Don&apos;t have an account? Create one
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
