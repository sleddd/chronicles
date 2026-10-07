import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  bedrockConverse,
  listBedrockTextModels,
  fallbackBedrockModels,
  type BedrockCredentials,
} from '../../services/bedrock.js';

const apiKeyCreds: BedrockCredentials = {
  region: 'us-west-2', auth: 'apiKey', apiKey: 'bedrock-key', accessKeyId: '', secretAccessKey: '', sessionToken: '',
};
const iamCreds: BedrockCredentials = {
  region: 'us-west-2', auth: 'iam', apiKey: '', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret/key', sessionToken: 'session-token',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => { vi.restoreAllMocks(); });

describe('bedrockConverse', () => {
  it('calls the Converse API with a bearer key and returns only the text blocks', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      stopReason: 'end_turn',
      output: { message: { content: [{ reasoningContent: { reasoningText: { text: 'thinking…' } } }, { text: '{"calories": 95}' }] } },
    }));
    const text = await bedrockConverse(apiKeyCreds, 'us.amazon.nova-pro-v1:0', 'sys', 'one apple');
    expect(text).toBe('{"calories": 95}');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://bedrock-runtime.us-west-2.amazonaws.com/model/us.amazon.nova-pro-v1%3A0/converse');
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer bedrock-key');
    expect(headers.host).toBeUndefined();
    const body = JSON.parse(String(init?.body));
    expect(body.system).toEqual([{ text: 'sys' }]);
    expect(body.messages).toEqual([{ role: 'user', content: [{ text: 'one apple' }] }]);
  });

  it('signs IAM requests with SigV4 for the bedrock service', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ output: { message: { content: [{ text: '1' }] } } }));
    await bedrockConverse(iamCreds, 'meta.llama3-3-70b-instruct-v1:0', 'sys', 'x');
    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-west-2\/bedrock\/aws4_request, SignedHeaders=.*host.*, Signature=[0-9a-f]{64}$/);
    expect(headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
    expect(headers['x-amz-security-token']).toBe('session-token');
    expect(headers.host).toBeUndefined();
  });

  it('explains model-access and inference-profile errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ message: "You don't have access to the model with the specified model ID." }, 403));
    await expect(bedrockConverse(apiKeyCreds, 'm', 's', 'p')).rejects.toThrow(/Model access/);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ message: "Invocation of model ID x with on-demand throughput isn't supported." }, 400));
    await expect(bedrockConverse(apiKeyCreds, 'm', 's', 'p')).rejects.toThrow(/cross-region/);
  });

  it('reports an unreachable region instead of a bare TypeError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(bedrockConverse(apiKeyCreds, 'm', 's', 'p')).rejects.toThrow(/Could not reach Amazon Bedrock in us-west-2/);
  });
});

describe('listBedrockTextModels', () => {
  it('lists on-demand text models and cross-region profiles from every provider', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/foundation-models')) {
        return json({ modelSummaries: [
          { modelId: 'amazon.nova-pro-v1:0', modelName: 'Nova Pro', providerName: 'Amazon', inputModalities: ['TEXT', 'IMAGE'], outputModalities: ['TEXT'], inferenceTypesSupported: ['ON_DEMAND', 'INFERENCE_PROFILE'], modelLifecycle: { status: 'ACTIVE' } },
          { modelId: 'meta.llama4-scout-17b-instruct-v1:0', modelName: 'Llama 4 Scout', providerName: 'Meta', inputModalities: ['TEXT'], outputModalities: ['TEXT'], inferenceTypesSupported: ['INFERENCE_PROFILE'], modelLifecycle: { status: 'ACTIVE' } },
          { modelId: 'cohere.command-r-v1:0', modelName: 'Command R', providerName: 'Cohere', inputModalities: ['TEXT'], outputModalities: ['TEXT'], inferenceTypesSupported: ['ON_DEMAND'], modelLifecycle: { status: 'LEGACY' } },
          { modelId: 'stability.sd3', modelName: 'SD3', providerName: 'Stability AI', inputModalities: ['TEXT'], outputModalities: ['IMAGE'], inferenceTypesSupported: ['ON_DEMAND'] },
        ] });
      }
      if (url.includes('nextToken=page2')) {
        return json({ inferenceProfileSummaries: [
          { inferenceProfileId: 'us.amazon.nova-pro-v1:0', status: 'ACTIVE', models: [{ modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0' }] },
        ] });
      }
      return json({ nextToken: 'page2', inferenceProfileSummaries: [
        { inferenceProfileId: 'us.meta.llama4-scout-17b-instruct-v1:0', status: 'ACTIVE', models: [{ modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/meta.llama4-scout-17b-instruct-v1:0' }] },
        { inferenceProfileId: 'us.stability.sd3', status: 'ACTIVE', models: [{ modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/stability.sd3' }] },
      ] });
    });

    const models = await listBedrockTextModels(apiKeyCreds);
    expect(models.map(m => m.id)).toEqual([
      'amazon.nova-pro-v1:0',
      'us.amazon.nova-pro-v1:0',
      'us.meta.llama4-scout-17b-instruct-v1:0',
    ]);
    expect(models[2]).toMatchObject({ provider: 'Meta', label: 'Llama 4 Scout (cross-region: us)' });
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://bedrock.us-west-2.amazonaws.com/foundation-models?byOutputModality=TEXT');
  });

  it('still returns on-demand models when inference profiles cannot be listed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input).includes('/foundation-models')
      ? json({ modelSummaries: [{ modelId: 'mistral.mistral-large-2407-v1:0', modelName: 'Mistral Large', providerName: 'Mistral AI', inputModalities: ['TEXT'], outputModalities: ['TEXT'], inferenceTypesSupported: ['ON_DEMAND'] }] })
      : json({ message: 'not authorized' }, 403));
    const models = await listBedrockTextModels(apiKeyCreds);
    expect(models.map(m => m.id)).toEqual(['mistral.mistral-large-2407-v1:0']);
  });
});

describe('fallbackBedrockModels', () => {
  it('covers several model providers and uses the region\'s profile prefix', () => {
    const eu = fallbackBedrockModels('eu-central-1');
    expect(new Set(eu.map(m => m.provider)).size).toBeGreaterThan(5);
    expect(eu.some(m => m.id.startsWith('eu.'))).toBe(true);
    expect(eu.some(m => m.id.startsWith('us.'))).toBe(false);
  });
});
