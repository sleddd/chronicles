import { describe, it, expect } from 'vitest';
import { presignUrl, presignR2 } from '@/services/r2Signer';

/**
 * Signature correctness is checked against the official AWS SigV4 example
 * ("Example: Presigning an Amazon S3 GET request" in the SigV4 docs):
 * a GET of /test.txt on examplebucket with the documented example credentials
 * at 20130524T000000Z must produce the documented signature.
 */
describe('presignUrl — AWS documentation test vector', () => {
  it('reproduces the documented signature exactly', async () => {
    const url = await presignUrl({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 's3',
      expiresSeconds: 86400,
      date: new Date('2013-05-24T00:00:00Z'),
    });

    const parsed = new URL(url);
    expect(parsed.host).toBe('examplebucket.s3.amazonaws.com');
    expect(parsed.pathname).toBe('/test.txt');
    expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(parsed.searchParams.get('X-Amz-Credential')).toBe('AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request');
    expect(parsed.searchParams.get('X-Amz-Date')).toBe('20130524T000000Z');
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('86400');
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(parsed.searchParams.get('X-Amz-Signature')).toBe(
      'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'
    );
  });
});

describe('presignR2', () => {
  const cfg = {
    accountId: 'a'.repeat(32),
    bucket: 'my-images',
    accessKeyId: 'key-id',
    secretAccessKey: 'secret',
  };

  it('refuses an account id or bucket that is not its real shape (it becomes the host and path)', async () => {
    expect(() => presignR2({ ...cfg, accountId: 'evil.example.com/x' }, 'GET', 'img/k')).toThrow('Invalid R2 account ID');
    expect(() => presignR2({ ...cfg, bucket: '../other' }, 'GET', 'img/k')).toThrow('Invalid R2 bucket name');
  });

  it('targets the account R2 endpoint with a path-style bucket/key', async () => {
    const url = await presignR2(cfg, 'GET', 'img/12345678-1234-1234-1234-123456789abc');
    const parsed = new URL(url);
    expect(parsed.host).toBe(`${'a'.repeat(32)}.r2.cloudflarestorage.com`);
    expect(parsed.pathname).toBe('/my-images/img/12345678-1234-1234-1234-123456789abc');
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.searchParams.get('X-Amz-Credential')).toContain('/auto/s3/aws4_request');
  });

  it('produces different signatures per method', async () => {
    const key = 'img/12345678-1234-1234-1234-123456789abc';
    const get = new URL(await presignR2(cfg, 'GET', key));
    const del = new URL(await presignR2(cfg, 'DELETE', key));
    expect(get.searchParams.get('X-Amz-Signature')).not.toBe(del.searchParams.get('X-Amz-Signature'));
  });

  it('never embeds the secret key in the URL', async () => {
    const url = await presignR2(cfg, 'PUT', 'img/12345678-1234-1234-1234-123456789abc');
    expect(url).not.toContain('secret');
  });
});
