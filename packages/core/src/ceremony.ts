import { split } from "shamir-secret-sharing";
import type { Address, Hex } from "./types.js";
import { encryptToPublicKey, aadFor } from "./envelope.js";
import { shareCommitment } from "./shares.js";

export interface CeremonyInput {
  examId: bigint;
  holders: ReadonlyArray<{ address: Address; pubKey: Uint8Array }>;
  threshold: number;
}

export interface CeremonyResult {
  examPublicKey: Uint8Array;
  commitments: readonly Hex[];
  encryptedShares: ReadonlyArray<{ holder: Address; envelope: Uint8Array }>;
}

function cryptoOrThrow(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto is unavailable");
  return c;
}

export async function runCeremony(input: CeremonyInput): Promise<CeremonyResult> {
  const n = input.holders.length;
  if (n < 3 || n > 20) throw new Error("Holder count must be between 3 and 20");
  if (input.threshold <= n / 2 || input.threshold > n) throw new Error("Threshold must be a strict majority and at most n");
  const addresses = new Set(input.holders.map((h) => h.address.toLowerCase()));
  if (addresses.size !== n) throw new Error("Duplicate holder address");
  const crypto = cryptoOrThrow();
  let pair: CryptoKeyPair | null = null;
  let privateJwk: JsonWebKey | null = null;
  let secretBytes: Uint8Array | null = null;
  let encodedScalar: string | null = null;
  let binaryScalar: string | null = null;
  let shares: Uint8Array[] = [];

  try {
    pair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );
    const publicKey = new Uint8Array(
      await crypto.subtle.exportKey("raw", pair.publicKey)
    );
    privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    pair = null;
    if (!privateJwk.d) throw new Error("Ceremony failed to export private scalar");
    encodedScalar = privateJwk.d.replace(/-/g, "+").replace(/_/g, "/");
    binaryScalar = atob(
      encodedScalar + "=".repeat((4 - (encodedScalar.length % 4)) % 4)
    );
    secretBytes = Uint8Array.from(binaryScalar, (c) => c.charCodeAt(0));
    shares = await split(secretBytes, n, input.threshold);

    const commitments: Hex[] = [];
    const encryptedShares: Array<{ holder: Address; envelope: Uint8Array }> = [];
    for (let i = 0; i < input.holders.length; i++) {
      const holder = input.holders[i]!;
      const share = shares[i]!;
      commitments.push(shareCommitment(input.examId, holder.address, share));
      const envelope = await encryptToPublicKey(
        holder.pubKey,
        share,
        aadFor(input.examId, "share", holder.address.toLowerCase())
      );
      encryptedShares.push({ holder: holder.address, envelope });
    }

    return { examPublicKey: publicKey, commitments, encryptedShares };
  } finally {
    secretBytes?.fill(0);
    for (const share of shares) share.fill(0);
    if (privateJwk) delete privateJwk.d;
    privateJwk = null;
    encodedScalar = null;
    binaryScalar = null;
    pair = null;
  }
}
