import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address } from '../src/types.js';

const mocks = vi.hoisted(() => ({
  split: vi.fn(),
  encryptToPublicKey: vi.fn(),
}));

vi.mock('shamir-secret-sharing', () => ({ split: mocks.split }));
vi.mock('../src/envelope.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/envelope.js')>()),
  encryptToPublicKey: mocks.encryptToPublicKey,
}));

import { runCeremony } from '../src/ceremony.js';

describe('runCeremony secret cleanup', () => {
  let privateJwk: JsonWebKey;
  let secretBytes: Uint8Array | undefined;
  let shareBuffers: Uint8Array[];

  beforeEach(() => {
    privateJwk = { kty: 'EC', crv: 'P-256', d: 'AQIDBA' };
    secretBytes = undefined;
    shareBuffers = [];
    vi.clearAllMocks();
    vi.stubGlobal('crypto', {
      subtle: {
        generateKey: vi.fn(async () => ({
          publicKey: {},
          privateKey: {},
        })),
        exportKey: vi.fn(async (format: string) =>
          format === 'raw' ? new Uint8Array(65).buffer : privateJwk,
        ),
      },
    });
    mocks.split.mockImplementation(
      async (secret: Uint8Array, count: number) => {
        secretBytes = secret;
        shareBuffers = Array.from({ length: count }, (_, index) =>
          Uint8Array.of(...secret, index),
        );
        return shareBuffers;
      },
    );
    mocks.encryptToPublicKey.mockResolvedValue(new Uint8Array([1]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears the private scalar and generated share buffers after success', async () => {
    const result = await runCeremony(input);

    expect(result.commitments).toHaveLength(3);
    expect(result.encryptedShares).toHaveLength(3);
    expect(secretBytes).toEqual(new Uint8Array(4));
    expect(shareBuffers.every((share) => share.every((byte) => byte === 0))).toBe(
      true,
    );
    expect(privateJwk.d).toBeUndefined();
  });

  it('clears the private scalar and generated shares when encryption fails', async () => {
    mocks.encryptToPublicKey.mockRejectedValueOnce(new Error('encryption failed'));

    await expect(runCeremony(input)).rejects.toThrow('encryption failed');

    expect(secretBytes).toEqual(new Uint8Array(4));
    expect(shareBuffers.every((share) => share.every((byte) => byte === 0))).toBe(
      true,
    );
    expect(privateJwk.d).toBeUndefined();
  });
});

const input = {
  examId: 7n,
  holders: [
    { address: '0x0000000000000000000000000000000000000001' as Address, pubKey: new Uint8Array(65) },
    { address: '0x0000000000000000000000000000000000000002' as Address, pubKey: new Uint8Array(65) },
    { address: '0x0000000000000000000000000000000000000003' as Address, pubKey: new Uint8Array(65) },
  ],
  threshold: 2,
};
