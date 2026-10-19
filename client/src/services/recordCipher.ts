import type { encryptionService } from '@shared/crypto/encryptionService.js';

type EncryptionService = typeof encryptionService;

/* The record encrypt/decrypt pair for data the API layer seals itself (topic
   names and icons, medication dose records). Installed by EncryptionContext
   when the master key is unlocked and cleared on lock, like the AI and R2
   credentials — so services/api.ts can encrypt without React context. */

export interface RecordCipher {
  encrypt: (kind: string, id: string, record: unknown) => Promise<{ payload: string; iv: string }>;
  decrypt: <T = unknown>(kind: string, id: string, payload: string, iv: string) => Promise<T>;
  /** For sealing a setting (the API layer's seal markers) */
  encryptBytes: (data: ArrayBuffer, aad?: string) => Promise<{ ciphertext: ArrayBuffer; iv: string }>;
}

let cipher: RecordCipher | null = null;

export function installRecordCipher(service: Pick<EncryptionService, 'encryptRecord' | 'decryptRecord' | 'encryptFile'>, key: CryptoKey): void {
  cipher = {
    encrypt: (kind, id, record) => service.encryptRecord(key, kind, id, record),
    decrypt: (kind, id, payload, iv) => service.decryptRecord(key, kind, id, payload, iv),
    encryptBytes: (data, aad) => service.encryptFile(key, data, aad),
  };
}

export function clearRecordCipher(): void {
  cipher = null;
}

/** The installed cipher; throws while Chronicles is locked. */
export function recordCipher(): RecordCipher {
  if (!cipher) throw new Error('Chronicles is locked');
  return cipher;
}

/** Tests only. */
export function setRecordCipherForTests(c: RecordCipher | null): void {
  cipher = c;
}
