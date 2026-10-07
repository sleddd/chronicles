/**
 * Browser stand-in for Node's `assert`, used by the Bedrock SDK's request
 * signer (`@anthropic-ai/bedrock-sdk` core/aws-auth). Aliased in vite.config.ts.
 */
export default function assert(value: unknown, message?: string): asserts value {
  if (!value) throw new Error(message ?? 'Assertion failed');
}
