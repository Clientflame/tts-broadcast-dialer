import { describe, it, expect } from 'vitest';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * Integration test: validates Cloudflare R2 credentials by uploading,
 * downloading, and deleting a small test file.
 * Requires S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_PUBLIC_URL env vars.
 */
describe('Cloudflare R2 Storage Integration', () => {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  const publicUrl = process.env.S3_PUBLIC_URL;

  const hasCredentials = endpoint && accessKey && secretKey && bucket;

  it('should have R2 credentials configured', () => {
    expect(endpoint).toBeTruthy();
    expect(accessKey).toBeTruthy();
    expect(secretKey).toBeTruthy();
    expect(bucket).toBeTruthy();
    expect(publicUrl).toBeTruthy();
  });

  it.skipIf(!hasCredentials)('should upload a test file to R2', async () => {
    const client = new S3Client({
      region: 'auto',
      endpoint: endpoint!,
      credentials: {
        accessKeyId: accessKey!,
        secretAccessKey: secretKey!,
      },
      forcePathStyle: true,
    });

    const testKey = `_test/r2-validation-${Date.now()}.txt`;
    const testContent = `R2 validation test at ${new Date().toISOString()}`;

    // Upload
    await client.send(new PutObjectCommand({
      Bucket: bucket!,
      Key: testKey,
      Body: Buffer.from(testContent, 'utf-8'),
      ContentType: 'text/plain',
    }));

    // Verify public URL is accessible
    const url = `${publicUrl!.replace(/\/+$/, '')}/${testKey}`;
    const response = await fetch(url);
    expect(response.ok).toBe(true);
    const body = await response.text();
    expect(body).toBe(testContent);

    // Clean up
    await client.send(new DeleteObjectCommand({
      Bucket: bucket!,
      Key: testKey,
    }));
  }, 15000);

  it.skipIf(!hasCredentials)('should upload and retrieve audio-like content', async () => {
    const client = new S3Client({
      region: 'auto',
      endpoint: endpoint!,
      credentials: {
        accessKeyId: accessKey!,
        secretAccessKey: secretKey!,
      },
      forcePathStyle: true,
    });

    const testKey = `_test/audio-validation-${Date.now()}.mp3`;
    // Small fake audio buffer (just bytes, not real MP3)
    const fakeAudio = Buffer.alloc(256, 0xFF);

    // Upload with audio content type
    await client.send(new PutObjectCommand({
      Bucket: bucket!,
      Key: testKey,
      Body: fakeAudio,
      ContentType: 'audio/mpeg',
    }));

    // Verify public URL returns the file
    const url = `${publicUrl!.replace(/\/+$/, '')}/${testKey}`;
    const response = await fetch(url);
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('audio');

    const arrayBuf = await response.arrayBuffer();
    expect(arrayBuf.byteLength).toBe(256);

    // Clean up
    await client.send(new DeleteObjectCommand({
      Bucket: bucket!,
      Key: testKey,
    }));
  }, 15000);
});
