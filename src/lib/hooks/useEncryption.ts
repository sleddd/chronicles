'use client';

import { create } from 'zustand';
import { deriveKey } from '@/lib/crypto/keyDerivation';
import { encrypt, decrypt } from '@/lib/crypto/encryption';

interface EncryptionStore {
  encryptionKey: CryptoKey | null;
  isKeyReady: boolean;
  deriveAndStoreKey: (password: string, salt: string) => Promise<void>;
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
    } catch (error) {
      console.error('Key derivation failed:', error);
      throw new Error('Failed to derive encryption key');
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
