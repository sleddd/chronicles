'use client';

import { create } from 'zustand';
import { deriveKey, deriveLegacyKey, unwrapMasterKey } from '@/lib/crypto/keyDerivation';
import { encrypt, decrypt } from '@/lib/crypto/encryption';

const SESSION_KEY_STORAGE = 'chronicles_session_key';

// Export CryptoKey to storable JWK format
async function exportKey(key: CryptoKey): Promise<string> {
  const jwk = await window.crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(jwk);
}

// Import CryptoKey from JWK format
async function importKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return await window.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

interface EncryptionStore {
  encryptionKey: CryptoKey | null;
  isKeyReady: boolean;
  isLegacyKey: boolean; // Track if using legacy iterations
  deriveAndStoreKey: (password: string, salt: string, useLegacy?: boolean) => Promise<void>;
  unwrapAndStoreMasterKey: (
    password: string,
    salt: string,
    encryptedMasterKey: string,
    masterKeyIv: string
  ) => Promise<void>;
  restoreKeyFromSession: () => Promise<boolean>;
  encryptData: (data: string) => Promise<{ ciphertext: string; iv: string }>;
  decryptData: (ciphertext: string, iv: string) => Promise<string>;
  clearKey: () => void;
}

export const useEncryption = create<EncryptionStore>((set, get) => ({
  encryptionKey: null,
  isKeyReady: false,
  isLegacyKey: false,

  // Legacy method: derive key directly from password (for old users without master key)
  // useLegacy=true uses 100,000 iterations for backward compatibility
  deriveAndStoreKey: async (password: string, salt: string, useLegacy: boolean = false) => {
    try {
      const key = useLegacy
        ? await deriveLegacyKey(password, salt)
        : await deriveKey(password, salt);
      set({ encryptionKey: key, isKeyReady: true, isLegacyKey: useLegacy });

      // Store key in sessionStorage for persistence across refreshes
      try {
        const exportedKey = await exportKey(key);
        sessionStorage.setItem(SESSION_KEY_STORAGE, exportedKey);
      } catch (storageError) {
        console.error('Failed to store key in session:', storageError);
      }
    } catch (error) {
      console.error('Key derivation failed:', error);
      throw new Error('Failed to derive encryption key');
    }
  },

  // New method: unwrap master key using password-derived key
  unwrapAndStoreMasterKey: async (
    password: string,
    salt: string,
    encryptedMasterKey: string,
    masterKeyIv: string
  ) => {
    try {
      // First derive the wrapping key from password
      const wrappingKey = await deriveKey(password, salt);

      // Then unwrap the master key
      const masterKey = await unwrapMasterKey(encryptedMasterKey, masterKeyIv, wrappingKey);
      set({ encryptionKey: masterKey, isKeyReady: true });

      // Store master key in sessionStorage for persistence across refreshes
      try {
        const exportedKey = await exportKey(masterKey);
        sessionStorage.setItem(SESSION_KEY_STORAGE, exportedKey);
      } catch (storageError) {
        console.error('Failed to store key in session:', storageError);
      }
    } catch (error) {
      console.error('Master key unwrap failed:', error);
      throw new Error('Failed to unwrap master key - incorrect password or corrupted key');
    }
  },

  restoreKeyFromSession: async () => {
    try {
      const storedKey = sessionStorage.getItem(SESSION_KEY_STORAGE);
      if (!storedKey) return false;

      const key = await importKey(storedKey);
      set({ encryptionKey: key, isKeyReady: true });
      return true;
    } catch (error) {
      console.error('Failed to restore key from session:', error);
      sessionStorage.removeItem(SESSION_KEY_STORAGE);
      return false;
    }
  },

  encryptData: async (data: string) => {
    const { encryptionKey } = get();
    if (!encryptionKey) {
      throw new Error('Encryption key not available');
    }
    return await encrypt(data, encryptionKey);
  },

  decryptData: async (ciphertext: string, iv: string) => {
    const { encryptionKey } = get();
    if (!encryptionKey) {
      throw new Error('Encryption key not available');
    }
    try {
      return await decrypt(ciphertext, iv, encryptionKey);
    } catch (error) {
      console.error('Decryption failed:', {
        error,
        ciphertextLength: ciphertext?.length,
        ivLength: iv?.length,
        hasKey: !!encryptionKey,
      });
      throw error;
    }
  },

  clearKey: () => {
    set({ encryptionKey: null, isKeyReady: false });
    // Also clear the session storage to prevent key restoration after logout
    try {
      sessionStorage.removeItem(SESSION_KEY_STORAGE);
    } catch {
      // Ignore storage errors
    }
  },
}));
