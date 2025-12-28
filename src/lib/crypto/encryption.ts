/**
 * Encrypt plaintext using AES-GCM
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const plaintextBuffer = encoder.encode(plaintext);

  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128,
    },
    key,
    plaintextBuffer
  );

  const ciphertext = btoa(
    String.fromCharCode(...new Uint8Array(ciphertextBuffer))
  );
  const ivBase64 = btoa(String.fromCharCode(...iv));

  return {
    ciphertext,
    iv: ivBase64,
  };
}

/**
 * Decrypt ciphertext using AES-GCM
 */
export async function decrypt(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const ciphertextBuffer = Uint8Array.from(atob(ciphertext), (c) =>
    c.charCodeAt(0)
  );
  const ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

  const plaintextBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer,
      tagLength: 128,
    },
    key,
    ciphertextBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(plaintextBuffer);
}
