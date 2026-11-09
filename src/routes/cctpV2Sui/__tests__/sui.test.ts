import { afterEach, describe, expect, it, vi } from 'vitest';
import { SuiPlatform } from '@wormhole-foundation/sdk-sui';
import type { SuiGrpcClient } from '@mysten/sui/grpc';
import { SUI_V2_OBJECTS } from '../consts';
import { buildSuiBurn, buildSuiMint } from '../sui';

const o = SUI_V2_OBJECTS.Mainnet;
const USDC =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

// biome-ignore lint/suspicious/noExplicitAny: PTB command shapes
type Cmd = any;
const moveCalls = (tx: { getData(): { commands: Cmd[] } }) =>
  tx
    .getData()
    .commands.filter((c) => c.$kind === 'MoveCall')
    .map((c) => c.MoveCall);

afterEach(() => vi.restoreAllMocks());

describe('buildSuiBurn', () => {
  const rpcWith = (coinBalance: bigint, addressBalance: bigint) =>
    ({
      getBalance: async () => ({
        balance: {
          coinType: USDC,
          balance: String(coinBalance + addressBalance),
          coinBalance: String(coinBalance),
          addressBalance: String(addressBalance),
        },
      }),
    } as unknown as SuiGrpcClient);
  const rpc = rpcWith(5_000_000n, 0n);
  const twoCoins = [
    { coinType: USDC, coinObjectId: `0x${'1'.repeat(64)}` },
    { coinType: USDC, coinObjectId: `0x${'2'.repeat(64)}` },
  ];
  const burn = (client: SuiGrpcClient, amount: bigint) =>
    buildSuiBurn(
      'Mainnet',
      client,
      '0xabc',
      amount,
      6,
      `0x${'a'.repeat(64)}`,
      0n,
      2000,
    );
  const redeemCalls = (tx: Parameters<typeof moveCalls>[0]) =>
    moveCalls(tx).filter((c) => c.function === 'redeem_funds');

  it('chains deposit_for_burn -> handler::burn -> complete_burn', async () => {
    vi.spyOn(SuiPlatform, 'getCoins').mockResolvedValue(twoCoins);
    const tx = await burn(rpc, 1_000_000n);
    const calls = moveCalls(tx).filter((c) => c.function !== 'redeem_funds');

    // The BurnReceipt / CompleteBurnTicket are hot potatoes: a missing or
    // reordered step makes the whole transaction abort on Sui
    expect(calls.map((c) => `${c.module}::${c.function}`)).toEqual([
      'deposit_for_burn::deposit_for_burn',
      'handler::burn',
      'deposit_for_burn::complete_burn',
    ]);
    expect(calls[0].package).toBe(o.tokenMessengerPackage);
    expect(calls[1].package).toBe(o.handlerPackage);
    expect(calls[0].typeArguments).toEqual([USDC]);
    expect(calls[2].typeArguments).toEqual([
      USDC,
      `${o.handlerPackage}::handler::Auth`,
    ]);
    // all wallet USDC is merged into one coin so the split can cover the amount
    const kinds = tx.getData().commands.map((c: Cmd) => c.$kind);
    expect(kinds).toContain('MergeCoins');
    expect(kinds).toContain('SplitCoins');
  });

  it('coin-only wallets never touch the address balance', async () => {
    // wallets without address-balance support must keep working for coin holders
    vi.spyOn(SuiPlatform, 'getCoins').mockResolvedValue(twoCoins);
    expect(
      redeemCalls(await burn(rpcWith(5_000_000n, 0n), 1_000_000n)),
    ).toHaveLength(0);
    // an address balance that is not needed is left alone too
    expect(
      redeemCalls(await burn(rpcWith(5_000_000n, 9_000_000n), 1_000_000n)),
    ).toHaveLength(0);
  });

  it('spends address balance only when coin objects fall short (mixed wallet)', async () => {
    vi.spyOn(SuiPlatform, 'getCoins').mockResolvedValue(twoCoins);
    // 0.4 in coins + 0.9 in address balance, burning 1.0: withdraw only the 0.6 shortfall
    const tx = await burn(rpcWith(400_000n, 900_000n), 1_000_000n);
    expect(redeemCalls(tx)).toHaveLength(1);
    const withdrawals = (tx.getData().inputs as Cmd[]).filter(
      (i) => i.FundsWithdrawal,
    );
    expect(withdrawals).toHaveLength(1);
    expect(
      BigInt(withdrawals[0].FundsWithdrawal.reservation.MaxAmountU64),
    ).toBe(600_000n);
  });

  it('burns from the address balance alone when there are no coin objects', async () => {
    const spy = vi.spyOn(SuiPlatform, 'getCoins');
    const tx = await burn(rpcWith(0n, 2_000_000n), 1_000_000n);
    expect(spy).not.toHaveBeenCalled();
    expect(redeemCalls(tx)).toHaveLength(1);
    const kinds = tx.getData().commands.map((c: Cmd) => c.$kind);
    expect(kinds).not.toContain('SplitCoins'); // redeemed exactly the burn amount
  });

  it('fails clearly when the wallet holds no USDC', async () => {
    await expect(burn(rpcWith(0n, 0n), 1n)).rejects.toThrow(
      'No USDC in wallet',
    );
  });

  it('fails clearly when coins plus address balance cannot cover the amount', async () => {
    await expect(burn(rpcWith(100n, 200n), 1_000n)).rejects.toThrow(
      'Insufficient USDC balance',
    );
  });
});

describe('buildSuiMint', () => {
  const tx = buildSuiMint(
    'Mainnet',
    `0x${'ab'.repeat(300)}`,
    `0x${'cd'.repeat(65)}`,
  );
  const calls = moveCalls(tx);

  it('chains receive_message -> prepare_mint -> handler::mint -> complete_mint', () => {
    expect(calls.map((c) => `${c.module}::${c.function}`)).toEqual([
      'receive_message::receive_message',
      'handle_receive_message::prepare_mint',
      'handler::mint',
      'handle_receive_message::complete_mint',
    ]);
    expect(calls[0].package).toBe(o.messageTransmitterPackage);
  });

  it('passes treasury before deny list in mint (the reverse of burn)', () => {
    // Circle's handler::mint takes (.., tmm_state, treasury, deny_list). Swapping
    // them aborts on-chain with a type mismatch, so lock the order in.
    const inputs = tx.getData().inputs as Cmd[];
    const objId = (a: Cmd) => inputs[a.Input]?.UnresolvedObject?.objectId;
    const args = calls[2].arguments as Cmd[];
    expect(objId(args[3])).toBe(o.usdcTreasury);
    // Sui normalizes object IDs to 32 bytes
    expect(objId(args[4])).toBe(`0x${'0'.repeat(61)}403`);
  });
});
