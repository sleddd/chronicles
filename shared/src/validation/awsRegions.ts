/**
 * AWS regions the In-App AI can call Amazon Bedrock in. The server's CSP
 * allows exactly these regions' `bedrock` and `bedrock-runtime` hosts
 * (instead of `*.amazonaws.com`, which would let injected script send data to
 * any S3 bucket), and the AI settings reject a region not on this list.
 * Add a region here when AWS launches Bedrock somewhere new.
 */
export const BEDROCK_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'us-gov-east-1', 'us-gov-west-1',
  'ca-central-1', 'ca-west-1', 'mx-central-1', 'sa-east-1',
  'eu-central-1', 'eu-central-2', 'eu-west-1', 'eu-west-2', 'eu-west-3',
  'eu-north-1', 'eu-south-1', 'eu-south-2',
  'ap-east-1', 'ap-east-2', 'ap-south-1', 'ap-south-2',
  'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
  'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-3', 'ap-southeast-4',
  'ap-southeast-5', 'ap-southeast-7',
  'me-central-1', 'me-south-1', 'il-central-1', 'af-south-1',
] as const;

export function isBedrockRegion(region: string): boolean {
  return (BEDROCK_REGIONS as readonly string[]).includes(region);
}

/** The Bedrock control-plane and runtime origins for every listed region. */
export function bedrockOrigins(): string[] {
  return BEDROCK_REGIONS.flatMap(r => [
    `https://bedrock.${r}.amazonaws.com`,
    `https://bedrock-runtime.${r}.amazonaws.com`,
  ]);
}
