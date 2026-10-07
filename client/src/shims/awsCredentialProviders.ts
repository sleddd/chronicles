/**
 * Browser stand-in for `@aws-sdk/credential-providers` (Node-only: reads
 * ~/.aws, env vars, instance metadata). The Bedrock SDK only loads it when no
 * credentials are passed; Chronicles always passes the user's key explicitly,
 * so reaching this means the AI settings are incomplete. Aliased in vite.config.ts.
 */
function unavailable(): never {
  throw new Error('Amazon Bedrock credentials are missing — add them in Settings → AI Assistant');
}
export const createCredentialChain = unavailable;
export const fromEnv = unavailable;
export const fromNodeProviderChain = unavailable;
