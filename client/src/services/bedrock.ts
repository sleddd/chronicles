/**
 * Amazon Bedrock from the browser — any text model, not just Claude.
 *
 * Inference uses the model-agnostic Converse API on `bedrock-runtime`; the
 * model picker lists the account's text models (ListFoundationModels) plus
 * the cross-region inference profiles newer models require
 * (ListInferenceProfiles). Requests are authorized with a Bedrock API key
 * (Bearer) or IAM access keys (SigV4, signed in the browser).
 */

import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

export type BedrockAuth = 'apiKey' | 'iam';

export interface BedrockCredentials {
  region: string;
  auth: BedrockAuth;
  apiKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

export interface BedrockModelOption {
  /** Model ID or inference profile ID — what Converse takes as `modelId` */
  id: string;
  label: string;
  provider: string;
}

/** Sign (IAM) or attach the bearer key to a Bedrock request, then send it. */
async function bedrockFetch(
  creds: BedrockCredentials,
  service: 'runtime' | 'control',
  method: 'GET' | 'POST',
  path: string,
  query: Record<string, string> = {},
  body?: unknown,
): Promise<unknown> {
  const region = creds.region.trim();
  const hostname = service === 'runtime'
    ? `bedrock-runtime.${region}.amazonaws.com`
    : `bedrock.${region}.amazonaws.com`;
  const bodyText = body === undefined ? undefined : JSON.stringify(body);
  const headers: Record<string, string> = { host: hostname, accept: 'application/json' };
  if (bodyText !== undefined) headers['content-type'] = 'application/json';

  let finalHeaders: Record<string, string>;
  if (creds.auth === 'apiKey') {
    finalHeaders = { ...headers, authorization: `Bearer ${creds.apiKey.trim()}` };
  } else {
    const signer = new SignatureV4({
      service: 'bedrock',
      region,
      sha256: Sha256,
      // Match the AWS SDK: no x-amz-content-sha256 header for Bedrock — one
      // less custom header for the browser's CORS preflight
      applyChecksum: false,
      credentials: {
        accessKeyId: creds.accessKeyId.trim(),
        secretAccessKey: creds.secretAccessKey.trim(),
        ...(creds.sessionToken.trim() ? { sessionToken: creds.sessionToken.trim() } : {}),
      },
    });
    const signed = await signer.sign({ method, protocol: 'https:', hostname, path, query, headers, body: bodyText });
    finalHeaders = signed.headers as Record<string, string>;
  }
  // Browsers set Host themselves and refuse to let scripts send it
  delete finalHeaders.host;

  const qs = new URLSearchParams(query).toString();
  let res: Response;
  try {
    res = await fetch(`https://${hostname}${path}${qs ? `?${qs}` : ''}`, { method, headers: finalHeaders, body: bodyText });
  } catch {
    throw new Error(`Could not reach Amazon Bedrock in ${region} — check the region and your connection`);
  }
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(bedrockErrorMessage(res.status, data));
  return data;
}

/** Turn a Bedrock error response into a message the user can act on. */
function bedrockErrorMessage(status: number, data: Record<string, unknown>): string {
  const msg = String(data.message ?? data.Message ?? '').trim();
  if (status === 401 || status === 403) {
    if (/model/i.test(msg) && /access/i.test(msg)) {
      return `No access to this model — enable it under Model access in the Bedrock console. (${msg})`;
    }
    return `Bedrock rejected the credentials${msg ? `: ${msg}` : ''}`;
  }
  if (/on-demand throughput/i.test(msg) || /inference profile/i.test(msg)) {
    return 'This model needs a cross-region inference profile — pick the entry marked "cross-region" in the model list';
  }
  if (status === 404) return `Model not found in this region${msg ? `: ${msg}` : ''}`;
  if (status === 429) return 'Bedrock rate limit reached — try again shortly';
  return `Bedrock error ${status}${msg ? `: ${msg}` : ''}`;
}

/** One-turn completion through the Converse API (works for every Bedrock text model). */
export async function bedrockConverse(
  creds: BedrockCredentials, modelId: string, system: string, prompt: string,
): Promise<string> {
  const data = await bedrockFetch(creds, 'runtime', 'POST', `/model/${encodeURIComponent(modelId.trim())}/converse`, {}, {
    system: [{ text: system }],
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 2048 },
  }) as {
    stopReason?: string;
    output?: { message?: { content?: { text?: string }[] } };
  };
  if (data.stopReason === 'guardrail_intervened' || data.stopReason === 'content_filtered') {
    throw new Error('The model declined this request');
  }
  // Reasoning models return reasoning blocks alongside the answer — keep text only
  return (data.output?.message?.content ?? []).map(b => b.text ?? '').join('');
}

interface FoundationModelSummary {
  modelId: string;
  modelName?: string;
  providerName?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  inferenceTypesSupported?: string[];
  modelLifecycle?: { status?: string };
}

interface InferenceProfileSummary {
  inferenceProfileId: string;
  inferenceProfileName?: string;
  status?: string;
  models?: { modelArn?: string }[];
}

/**
 * Every text model this account can call in the region: on-demand models by
 * ID, plus system inference profiles (us./eu./apac./global.) for models that
 * only run cross-region. Sorted by provider, then name.
 */
export async function listBedrockTextModels(creds: BedrockCredentials): Promise<BedrockModelOption[]> {
  const fm = await bedrockFetch(creds, 'control', 'GET', '/foundation-models', { byOutputModality: 'TEXT' }) as {
    modelSummaries?: FoundationModelSummary[];
  };
  const textModels = (fm.modelSummaries ?? []).filter(m =>
    (m.inputModalities ?? []).includes('TEXT')
    && (m.outputModalities ?? []).includes('TEXT')
    && (m.modelLifecycle?.status ?? 'ACTIVE') === 'ACTIVE');
  const byId = new Map(textModels.map(m => [m.modelId, m]));

  const options: BedrockModelOption[] = [];
  for (const m of textModels) {
    if ((m.inferenceTypesSupported ?? []).includes('ON_DEMAND')) {
      options.push({ id: m.modelId, label: m.modelName || m.modelId, provider: m.providerName || 'Other' });
    }
  }

  // Inference profiles are paginated; a failure here still leaves the on-demand list
  try {
    let nextToken: string | undefined;
    do {
      const page = await bedrockFetch(creds, 'control', 'GET', '/inference-profiles', {
        typeEquals: 'SYSTEM_DEFINED', maxResults: '1000', ...(nextToken ? { nextToken } : {}),
      }) as { inferenceProfileSummaries?: InferenceProfileSummary[]; nextToken?: string };
      for (const p of page.inferenceProfileSummaries ?? []) {
        if (p.status && p.status !== 'ACTIVE') continue;
        const baseId = p.models?.[0]?.modelArn?.split('/').pop() ?? '';
        const base = byId.get(baseId);
        if (!base) continue; // not a text model
        const scope = p.inferenceProfileId.split('.')[0];
        options.push({
          id: p.inferenceProfileId,
          label: `${base.modelName || baseId} (cross-region: ${scope})`,
          provider: base.providerName || 'Other',
        });
      }
      nextToken = page.nextToken;
    } while (nextToken);
  } catch (err) {
    console.warn('Could not list Bedrock inference profiles:', err);
  }

  return options.sort((a, b) => a.provider.localeCompare(b.provider) || a.label.localeCompare(b.label));
}

/** Cross-region profile prefix for a region (us-east-1 → us, eu-west-1 → eu). */
function profilePrefix(region: string): string {
  if (region.startsWith('eu-')) return 'eu';
  if (region.startsWith('ap-')) return 'apac';
  if (region.startsWith('us-gov-')) return 'us-gov';
  return 'us';
}

/**
 * Starter list shown until the live list loads (or if listing is not allowed).
 * Availability varies by region and account — the live list is authoritative.
 */
export function fallbackBedrockModels(region: string): BedrockModelOption[] {
  const p = profilePrefix(region.trim());
  return [
    { id: `${p}.amazon.nova-premier-v1:0`, label: 'Nova Premier (cross-region)', provider: 'Amazon' },
    { id: 'amazon.nova-pro-v1:0', label: 'Nova Pro', provider: 'Amazon' },
    { id: 'amazon.nova-lite-v1:0', label: 'Nova Lite', provider: 'Amazon' },
    { id: 'amazon.nova-micro-v1:0', label: 'Nova Micro', provider: 'Amazon' },
    { id: `${p}.anthropic.claude-haiku-4-5-20251001-v1:0`, label: 'Claude Haiku 4.5 (cross-region)', provider: 'Anthropic' },
    { id: `${p}.anthropic.claude-sonnet-4-5-20250929-v1:0`, label: 'Claude Sonnet 4.5 (cross-region)', provider: 'Anthropic' },
    { id: 'ai21.jamba-1-5-large-v1:0', label: 'Jamba 1.5 Large', provider: 'AI21 Labs' },
    { id: 'cohere.command-r-plus-v1:0', label: 'Command R+', provider: 'Cohere' },
    { id: `${p}.deepseek.r1-v1:0`, label: 'DeepSeek-R1 (cross-region)', provider: 'DeepSeek' },
    { id: `${p}.meta.llama3-3-70b-instruct-v1:0`, label: 'Llama 3.3 70B Instruct (cross-region)', provider: 'Meta' },
    { id: `${p}.meta.llama4-maverick-17b-instruct-v1:0`, label: 'Llama 4 Maverick 17B (cross-region)', provider: 'Meta' },
    { id: `${p}.meta.llama4-scout-17b-instruct-v1:0`, label: 'Llama 4 Scout 17B (cross-region)', provider: 'Meta' },
    { id: 'mistral.mistral-large-2407-v1:0', label: 'Mistral Large (24.07)', provider: 'Mistral AI' },
    { id: `${p}.mistral.pixtral-large-2502-v1:0`, label: 'Pixtral Large (cross-region)', provider: 'Mistral AI' },
    { id: 'openai.gpt-oss-120b-1:0', label: 'gpt-oss-120b', provider: 'OpenAI' },
    { id: 'openai.gpt-oss-20b-1:0', label: 'gpt-oss-20b', provider: 'OpenAI' },
  ];
}
