/**
 * The AI provider declined a request: Anthropic's stop_reason "refusal",
 * Bedrock's guardrail or content filter, OpenAI's refusal or content filter.
 * One error for all three, so the request code can count it once
 * (services/aiAccess.ts) whichever provider answered.
 */
export class AiDeclinedError extends Error {
  constructor() {
    super('The model declined this request');
    this.name = 'AiDeclinedError';
  }
}
