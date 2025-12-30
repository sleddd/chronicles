'use client';

import { create } from 'zustand';
import { deriveKey } from '@/lib/crypto/keyDerivation';
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
  deriveAndStoreKey: (password: string, salt: string) => Promise<void>;
  restoreKeyFromSession: () => Promise<boolean>;
  encryptData: (data: string) => Promise<{ ciphertext: string; iv: string }>;
  decryptData: (ciphertext: string, iv: string) => Promise<string>;
  clearKey: () => void;
}

export const useEncryption = create<EncryptionStore>((set, get) => ({
  encryptionKey: null,
  isKeyReady: false,

  deriveAndStoreKey: async (password: string, salt: string) => {
    try {
      const key = await deriveKey(password, salt);
      set({ encryptionKey: key, isKeyReady: true });

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
  },
}));
