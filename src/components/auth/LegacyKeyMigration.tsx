'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import {
  generateMasterKey,
  generateRecoveryKey,
  generateSalt,
  wrapMasterKey,
  deriveKeyFromRecoveryKey,
  formatRecoveryKeyForDisplay,
} from '@/lib/crypto/keyDerivation';
import { encrypt, decrypt } from '@/lib/crypto/encryption';

type MigrationStep = 'checking' | 'prompt' | 'migrating' | 'showRecoveryKey' | 'complete' | 'none';

export function LegacyKeyMigration() {
  const { status } = useSession();
  const { isKeyReady, encryptionKey } = useEncryption();
  const [step, setStep] = useState<MigrationStep>('checking');
  const [recoveryKeyDisplay, setRecoveryKeyDisplay] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Track if this is a partial migration (has master key but no recovery)
  const [isPartialMigration, setIsPartialMigration] = useState(false);

  // Check if user needs migration
  useEffect(() => {
    if (status !== 'authenticated' || !isKeyReady) {
      return;
    }

    const checkMigrationNeeded = async () => {
      try {
        const response = await fetch('/api/user/setup-keys');
        if (!response.ok) {
          setStep('none');
          return;
        }

        const { hasEncryptedMasterKey, hasRecoveryKey } = await response.json();

        if (hasEncryptedMasterKey && hasRecoveryKey) {
          // Fully migrated, nothing to do
          setStep('none');
        } else if (hasEncryptedMasterKey && !hasRecoveryKey) {
          // Has master key but no recovery key - just need to add recovery key
          setIsPartialMigration(true);
          setStep('prompt');
        } else if (!hasEncryptedMasterKey) {
          // Truly legacy - need full migration
          setIsPartialMigration(false);
          setStep('prompt');
        } else {
          setStep('none');
        }
      } catch {
        setStep('none');
      }
    };

    checkMigrationNeeded();
  }, [status, isKeyReady]);

  const handleMigrate = async () => {
    if (!encryptionKey) {
      setError('Encryption key not available');
      return;
    }

    setStep('migrating');
    setError('');

    try {
      // Generate recovery key
      setProgress('Generating recovery key...');
      const recoveryKey = generateRecoveryKey();
      const recoveryKeySalt = generateSalt();

      if (isPartialMigration) {
        // Partial migration: User already has master key, just add recovery key
        // The encryptionKey in Zustand IS the master key (unwrapped during login)
        setProgress('Setting up recovery key...');
        console.log('[Migration] Starting partial migration, key extractable:', encryptionKey.extractable);

        const recoveryDerivedKey = await deriveKeyFromRecoveryKey(recoveryKey, recoveryKeySalt);
        console.log('[Migration] Recovery key derived, usages:', recoveryDerivedKey.usages);

        const wrappedWithRecovery = await wrapMasterKey(encryptionKey, recoveryDerivedKey);
        console.log('[Migration] Master key wrapped successfully');

        // Save just the recovery key to server
        const response = await fetch('/api/user/setup-recovery-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encryptedMasterKeyWithRecovery: wrappedWithRecovery.encryptedKey,
            recoveryKeyIv: wrappedWithRecovery.iv,
            recoveryKeySalt,
          }),
        });
        console.log('[Migration] Server response status:', response.status);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to set up recovery key');
        }
        console.log('[Migration] Partial migration complete');
      } else {
        // Full migration: Legacy user needs new master key and re-encryption
        setProgress('Generating new encryption keys...');
        const newMasterKey = await generateMasterKey();

        // Get user's salt
        const saltResponse = await fetch('/api/user/salt');
        if (!saltResponse.ok) {
          throw new Error('Failed to get user salt');
        }
        await saltResponse.json(); // We don't need salt for this migration

        // Fetch all encrypted data
        setProgress('Fetching encrypted data...');
        const dataResponse = await fetch('/api/user/reencrypt');
        if (!dataResponse.ok) {
          throw new Error('Failed to fetch encrypted data');
        }
        const { entries, topics, customFields } = await dataResponse.json();

        // Re-encrypt all data with new master key
        setProgress(`Re-encrypting ${entries.length} entries...`);
        const reencryptedEntries = await Promise.all(
          entries.map(async (entry: { id: string; encryptedContent: string; iv: string }) => {
            const decrypted = await decrypt(entry.encryptedContent, entry.iv, encryptionKey);
            const { ciphertext, iv } = await encrypt(decrypted, newMasterKey);
            return { id: entry.id, encryptedContent: ciphertext, iv };
          })
        );

        setProgress(`Re-encrypting ${topics.length} topics...`);
        const reencryptedTopics = await Promise.all(
          topics.map(async (topic: { id: string; encryptedName: string; iv: string }) => {
            const decrypted = await decrypt(topic.encryptedName, topic.iv, encryptionKey);
            const { ciphertext, iv } = await encrypt(decrypted, newMasterKey);
            return { id: topic.id, encryptedName: ciphertext, iv };
          })
        );

        setProgress(`Re-encrypting ${customFields.length} custom fields...`);
        const reencryptedCustomFields = await Promise.all(
          customFields.map(async (cf: { id: string; encryptedData: string; iv: string }) => {
            const decrypted = await decrypt(cf.encryptedData, cf.iv, encryptionKey);
            const { ciphertext, iv } = await encrypt(decrypted, newMasterKey);
            return { id: cf.id, encryptedData: ciphertext, iv };
          })
        );

        // Wrap master key with current password-derived key AND recovery key
        setProgress('Wrapping master key...');
        const wrappedWithPassword = await wrapMasterKey(newMasterKey, encryptionKey);
        const recoveryDerivedKey = await deriveKeyFromRecoveryKey(recoveryKey, recoveryKeySalt);
        const wrappedWithRecovery = await wrapMasterKey(newMasterKey, recoveryDerivedKey);

        // Save everything to server
        setProgress('Saving encrypted data...');
        const migrateResponse = await fetch('/api/user/migrate-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entries: reencryptedEntries,
            topics: reencryptedTopics,
            customFields: reencryptedCustomFields,
            encryptedMasterKey: wrappedWithPassword.encryptedKey,
            masterKeyIv: wrappedWithPassword.iv,
            encryptedMasterKeyWithRecovery: wrappedWithRecovery.encryptedKey,
            recoveryKeyIv: wrappedWithRecovery.iv,
            recoveryKeySalt,
          }),
        });

        if (!migrateResponse.ok) {
          const data = await migrateResponse.json();
          throw new Error(data.error || 'Migration failed');
        }

        // Update local encryption key to use new master key
        useEncryption.setState({ encryptionKey: newMasterKey });
      }

      // Show recovery key
      setRecoveryKeyDisplay(formatRecoveryKeyForDisplay(recoveryKey));
      setStep('showRecoveryKey');
    } catch (err) {
      console.error('Migration failed:', err);
      setError(err instanceof Error ? err.message : 'Migration failed');
      setStep('prompt');
    }
  };

  const handleCopyRecoveryKey = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKeyDisplay);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = recoveryKeyDisplay;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  const handleComplete = () => {
    setStep('complete');
    // Reload the page to ensure everything is fresh
    window.location.reload();
  };

  // Don't render anything if not needed
  if (step === 'none' || step === 'checking' || step === 'complete') {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10 p-4">
      <div className="backdrop-blur-sm bg-white/30 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {step === 'prompt' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Security Upgrade Required</h2>
                <p className="text-sm text-gray-500">One-time migration to enhanced encryption</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-medium mb-2">What this upgrade does:</p>
              <ul className="list-disc pl-5 space-y-1">
                {isPartialMigration ? (
                  <>
                    <li>Generates a <strong>recovery key</strong> for your account</li>
                    <li>Enables password recovery (previously not possible)</li>
                  </>
                ) : (
                  <>
                    <li>Creates a new master encryption key for your data</li>
                    <li>Generates a <strong>recovery key</strong> you can use to recover your account</li>
                    <li>Re-encrypts all your existing entries with the new key</li>
                    <li>Enables password recovery (previously not possible)</li>
                  </>
                )}
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <p className="font-medium">Important:</p>
              <p>After migration, you will receive a recovery key. <strong>Save it securely</strong> - it&apos;s the only way to recover your account if you forget your password.</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleMigrate}
                className="flex-1 px-4 py-2 text-white rounded-md text-sm font-medium"
                style={{ backgroundColor: '#1aaeae' }}
              >
                Upgrade Now
              </button>
            </div>
          </div>
        )}

        {step === 'migrating' && (
          <div className="p-6 text-center space-y-4">
            <div className="inline-block w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <h2 className="text-lg font-semibold text-gray-900">Upgrading Your Account</h2>
            <p className="text-sm text-gray-600">{progress}</p>
            <p className="text-xs text-gray-400">Please don&apos;t close this window...</p>
          </div>
        )}

        {step === 'showRecoveryKey' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Upgrade Complete!</h2>
                <p className="text-sm text-gray-500">Save your recovery key below</p>
              </div>
            </div>

            <div className="bg-amber-50 border-2 border-amber-500 rounded-lg p-4">
              <p className="text-sm font-bold text-amber-800 mb-2">SAVE THIS RECOVERY KEY NOW</p>
              <p className="text-sm text-amber-700">
                This key is the <strong>ONLY WAY</strong> to recover your account if you forget your password.
                You will <strong>NOT</strong> see this key again.
              </p>
            </div>

            <div className="backdrop-blur-sm bg-white/40 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-2 text-center">Your Recovery Key:</p>
              <div className="font-mono text-sm text-center backdrop-blur-sm bg-white/30 border border-border rounded p-3 break-all select-all">
                {recoveryKeyDisplay}
              </div>
              <button
                onClick={handleCopyRecoveryKey}
                className="mt-3 w-full px-4 py-2 text-sm text-white rounded-md"
                style={{ backgroundColor: '#1aaeae' }}
              >
                Copy to Clipboard
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
                  I have saved my recovery key in a secure location
                </span>
              </label>
            </div>

            <button
              onClick={handleComplete}
              disabled={!confirmed}
              className="w-full px-4 py-2 text-sm font-medium text-white rounded-md disabled:bg-gray-400"
              style={{ backgroundColor: confirmed ? '#1aaeae' : undefined }}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
