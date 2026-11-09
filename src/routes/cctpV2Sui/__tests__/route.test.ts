import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransferState } from '@wormhole-foundation/sdk';
import type { ChainContext, Network } from '@wormhole-foundation/sdk';
import { circle, Wormhole } from '@wormhole-foundation/sdk';
import { ManualCCTPv2SuiRoute, LegacyCCTPRoute } from '..';
import type { CctpV2SuiReceipt } from '..';
import { buildV2Message } from './fixtures';

vi.mock('../iris', () => ({
  fetchV2Attestation: vi.fn(),
  fetchStandardMaxFee: vi.fn(),
}));
vi.mock('../evm', async (orig) => ({
  ...(await orig<typeof import('../evm')>()),
  evmIsNonceUsed: vi.fn(),
}));
vi.mock('../sui', async (orig) => ({
  ...(await orig<typeof import('../sui')>()),
  isSuiNonceUsed: vi.fn().mockResolvedValue(false),
}));

import { fetchV2Attestation } from '../iris';
import { evmIsNonceUsed } from '../evm';
import { isSuiNonceUsed } from '../sui';

const ctx = (chain: string, network: Network = 'Mainnet') =>
  ({ chain, network } as unknown as ChainContext<Network>);
const usdc = (chain: 'Sui' | 'Base' | 'Ethereum' | 'Solana') =>
  Wormhole.tokenId(chain, circle.usdcContract.get('Mainnet', chain)!);

describe('supported chains / tokens', () => {
  it('lists Sui, Solana and V2 EVM chains', () => {
    const chains = ManualCCTPv2SuiRoute.supportedChains('Mainnet');
    expect(chains).toContain('Sui');
    expect(chains).toContain('Solana');
    expect(chains).toContain('Base');
  });

  it('only routes pairs with exactly one Sui side', async () => {
    const fn = ManualCCTPv2SuiRoute.supportedDestinationTokens;
    // EVM <-> EVM and EVM <-> Solana belong to the executor routes; two routes must not race
    expect(await fn(usdc('Base'), ctx('Base'), ctx('Ethereum'))).toEqual([]);
    expect(await fn(usdc('Base'), ctx('Base'), ctx('Solana'))).toEqual([]);
    expect(await fn(usdc('Solana'), ctx('Solana'), ctx('Base'))).toEqual([]);
    expect(await fn(usdc('Base'), ctx('Base'), ctx('Sui'))).toHaveLength(1);
    expect(await fn(usdc('Sui'), ctx('Sui'), ctx('Base'))).toHaveLength(1);
  });

  it('routes Sui <-> Solana (no other CCTP route covers it once V1 is retired)', async () => {
    const fn = ManualCCTPv2SuiRoute.supportedDestinationTokens;
    expect(await fn(usdc('Sui'), ctx('Sui'), ctx('Solana'))).toHaveLength(1);
    expect(await fn(usdc('Solana'), ctx('Solana'), ctx('Sui'))).toHaveLength(1);
  });

  it('rejects non-USDC source tokens', async () => {
    const notUsdc = Wormhole.tokenId('Base', `0x${'1'.repeat(40)}`);
    expect(
      await ManualCCTPv2SuiRoute.supportedDestinationTokens(
        notUsdc,
        ctx('Base'),
        ctx('Sui'),
      ),
    ).toEqual([]);
  });

  it('route name keeps "CCTP" (burn-limit error text) and is not an executor name', () => {
    const { name } = ManualCCTPv2SuiRoute.meta;
    expect(name).toContain('CCTP');
    expect(name.endsWith('ExecutorRoute')).toBe(false);
  });
});

describe('LegacyCCTPRoute', () => {
  it('keeps the V1 route name so in-flight V1 Sui transfers still resume', () => {
    expect(LegacyCCTPRoute.meta.name).toBe('ManualCCTP');
  });

  it('no longer offers new Sui transfers (V1 is being retired)', async () => {
    const fn = LegacyCCTPRoute.supportedDestinationTokens;
    expect(await fn(usdc('Base'), ctx('Base'), ctx('Sui'))).toEqual([]);
    expect(await fn(usdc('Sui'), ctx('Sui'), ctx('Base'))).toEqual([]);
    expect(await fn(usdc('Base'), ctx('Base'), ctx('Ethereum'))).toHaveLength(
      1,
    );
  });
});

describe('receipts survive localStorage JSON', () => {
  const NONCE = '11'.repeat(32);
  const message = buildV2Message({
    src: 6,
    dst: 8,
    nonce: NONCE,
    burnToken: 'aa',
    mintRecipient: 'bb',
    sender: 'cc',
    amount: 5_000_000n,
  });

  const makeRoute = () => {
    const wh = {
      network: 'Mainnet',
      getChain: () => ({ getRpc: async () => ({}) }),
    } as never;
    return new ManualCCTPv2SuiRoute(wh);
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isSuiNonceUsed).mockResolvedValue(false);
  });

  it('track attests a stored receipt from the origin tx hash alone', async () => {
    vi.mocked(fetchV2Attestation).mockResolvedValue({
      message,
      attestation: '0x99',
    });
    // Receipts are stored via JSON.stringify: no class instances, only the tx id
    const stored = JSON.parse(
      JSON.stringify({
        from: 'Base',
        to: 'Sui',
        state: TransferState.SourceInitiated,
        originTxs: [{ chain: 'Base', txid: '0xabc' }],
      }),
    );
    const out: CctpV2SuiReceipt[] = [];
    for await (const r of makeRoute().track(stored, 5_000)) out.push(r);

    expect(vi.mocked(fetchV2Attestation)).toHaveBeenCalledWith(
      'Mainnet',
      6,
      '0xabc',
    );
    expect(out[0].state).toBe(TransferState.Attested);
    expect(out[0]).toMatchObject({ attestation: { attestation: { message } } });
  });

  it('track reports DestinationFinalized once the nonce is used', async () => {
    vi.mocked(evmIsNonceUsed).mockResolvedValue(true);
    const receipt = {
      from: 'Sui',
      to: 'Base',
      state: TransferState.Attested,
      originTxs: [{ chain: 'Sui', txid: 'digest' }],
      attestation: {
        id: { hash: 'digest' },
        attestation: { message, attestation: '0x99' },
      },
    };
    const out: CctpV2SuiReceipt[] = [];
    for await (const r of makeRoute().track(receipt as never, 5_000))
      out.push(r);
    expect(out.at(-1)?.state).toBe(TransferState.DestinationFinalized);
    expect(vi.mocked(evmIsNonceUsed)).toHaveBeenCalledWith(
      'Mainnet',
      {},
      `0x${NONCE}`,
    );
  });

  it('resume maps a Solana-bound burn to the Solana destination', async () => {
    const toSolana = buildV2Message({
      src: 8,
      dst: 5,
      nonce: NONCE,
      burnToken: 'aa',
      mintRecipient: 'bb',
      sender: 'cc',
      amount: 1n,
    });
    vi.mocked(fetchV2Attestation).mockResolvedValue({
      message: toSolana,
      attestation: '0x99',
    });
    const r = await makeRoute().resume({
      chain: 'Sui',
      txid: 'digest',
    } as never);
    expect(r.to).toBe('Solana');
  });

  it('resume only claims Sui transfers', async () => {
    vi.mocked(fetchV2Attestation).mockResolvedValue({
      message,
      attestation: '0x99',
    });
    const r = await makeRoute().resume({
      chain: 'Base',
      txid: '0xabc',
    } as never);
    expect(r.to).toBe('Sui');

    // Base -> Ethereum V2 message: executor routes own it
    const evmToEvm = buildV2Message({
      src: 6,
      dst: 0,
      nonce: NONCE,
      burnToken: 'aa',
      mintRecipient: 'bb',
      sender: 'cc',
      amount: 1n,
    });
    vi.mocked(fetchV2Attestation).mockResolvedValue({
      message: evmToEvm,
      attestation: '0x99',
    });
    await expect(
      makeRoute().resume({ chain: 'Base', txid: '0xdef' } as never),
    ).rejects.toThrow('Not a Sui CCTP V2 transfer');
  });

  it('complete refuses an unattested receipt', async () => {
    await expect(
      makeRoute().complete(
        {} as never,
        {
          from: 'Base',
          to: 'Sui',
          state: TransferState.SourceInitiated,
          originTxs: [],
        } as never,
      ),
    ).rejects.toThrow('attested');
  });
});
