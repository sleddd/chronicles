/**
 * Tokenize text into searchable keywords
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .filter((word, index, arr) => arr.indexOf(word) === index);
}

/**
 * Generate HMAC-SHA256 tokens for each keyword
 */
export async function generateSearchTokens(
  content: string,
  key: CryptoKey
): Promise<string[]> {
  const keywords = tokenize(content);
  const tokens: string[] = [];

  const hmacKey = await window.crypto.subtle.importKey(
    'raw',
    await window.crypto.subtle.exportKey('raw', key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  for (const keyword of keywords) {
    const encoder = new TextEncoder();
    const data = encoder.encode(keyword);
    const signature = await window.crypto.subtle.sign('HMAC', hmacKey, data);
    tokens.push(btoa(String.fromCharCode(...new Uint8Array(signature))));
  }

  return tokens;
}

/**
 * Generate search token for a single search term
 */
export async function generateSearchToken(
  searchTerm: string,
  key: CryptoKey
): Promise<string> {
  const hmacKey = await window.crypto.subtle.importKey(
    'raw',
    await window.crypto.subtle.exportKey('raw', key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const data = encoder.encode(searchTerm.toLowerCase().trim());
  const signature = await window.crypto.subtle.sign('HMAC', hmacKey, data);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
