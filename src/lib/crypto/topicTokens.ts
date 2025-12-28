/**
 * Generate HMAC-SHA256 token for topic name lookup
 */
export async function generateTopicToken(
  topicName: string,
  key: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(topicName.toLowerCase().trim());

  const hmacKey = await window.crypto.subtle.importKey(
    'raw',
    await window.crypto.subtle.exportKey('raw', key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await window.crypto.subtle.sign('HMAC', hmacKey, data);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
