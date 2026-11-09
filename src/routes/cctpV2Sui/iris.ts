import {
  FINALITY_STANDARD,
  IRIS_API,
  SUI_DOMAIN,
  isTestOrMainnet,
} from './consts';
import type { Network } from '@wormhole-foundation/sdk';

export interface V2Attestation {
  /** 0x-prefixed message bytes */
  message: string;
  /** 0x-prefixed attestation bytes */
  attestation: string;
}

const apiBase = (network: Network): string => {
  if (!isTestOrMainnet(network)) throw new Error(`Unsupported ${network}`);
  return IRIS_API[network];
};

/**
 * Looks up the V2 message + attestation for a burn transaction.
 * Returns null while Circle has not indexed or attested it yet.
 * Sui digests are base58 and must NOT have a 0x prefix.
 */
export async function fetchV2Attestation(
  network: Network,
  sourceDomain: number,
  txHash: string,
): Promise<V2Attestation | null> {
  const hash = sourceDomain === SUI_DOMAIN ? txHash.replace(/^0x/, '') : txHash;
  const res = await fetch(
    `${apiBase(
      network,
    )}/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(hash)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Circle attestation API error ${res.status}`);

  const body = (await res.json()) as {
    messages?: {
      message: string;
      attestation: string;
      status: string;
      cctpVersion?: number;
    }[];
  };
  const m = body.messages?.[0];
  if (!m) return null;
  if (m.cctpVersion !== undefined && m.cctpVersion !== 2) {
    throw new Error('Transaction is not a CCTP V2 burn');
  }
  if (
    m.status !== 'complete' ||
    !m.attestation ||
    m.attestation === 'PENDING' ||
    m.message === '0x'
  ) {
    return null;
  }
  return { message: m.message, attestation: m.attestation };
}

/**
 * Minimum fee for a standard transfer, in USDC base units (rounded up).
 * The API returns basis points (may be fractional).
 */
export async function fetchStandardMaxFee(
  network: Network,
  sourceDomain: number,
  destinationDomain: number,
  amount: bigint,
): Promise<bigint> {
  const res = await fetch(
    `${apiBase(
      network,
    )}/v2/burn/USDC/fees/${sourceDomain}/${destinationDomain}`,
  );
  if (!res.ok) throw new Error(`Circle fee API error ${res.status}`);
  const fees = (await res.json()) as {
    finalityThreshold: number;
    minimumFee: number;
  }[];
  const std = fees.find((f) => f.finalityThreshold === FINALITY_STANDARD);
  if (!std) throw new Error('No standard transfer fee from Circle');

  // bps with 3 decimals of precision: fee = amount * bps / 10_000
  const bpsMilli = BigInt(Math.round(std.minimumFee * 1000));
  const denom = 10_000_000n;
  return (amount * bpsMilli + denom - 1n) / denom;
}
