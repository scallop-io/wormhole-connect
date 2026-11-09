import { Transaction } from '@mysten/sui/transactions';
import type { SuiGrpcClient } from '@mysten/sui/grpc';
import { SuiPlatform } from '@wormhole-foundation/sdk-sui';
import { circle } from '@wormhole-foundation/sdk-base';
import type { Network } from '@wormhole-foundation/sdk';
import { SUI_V2_OBJECTS, isTestOrMainnet } from './consts';
import type { SuiV2Objects } from './consts';
import { hexToBytes } from './message';

const DENY_LIST = '0x403';
const CLOCK = '0x6';

const objects = (network: Network): SuiV2Objects => {
  if (!isTestOrMainnet(network)) throw new Error(`Unsupported ${network}`);
  return SUI_V2_OBJECTS[network];
};

export const suiUsdcType = (network: Network): string => {
  const t = circle.usdcContract.get(network, 'Sui');
  if (!t) throw new Error('No USDC configured for Sui');
  return t;
};

/**
 * Burn USDC on Sui via CCTP V2 (standard transfer).
 * deposit_for_burn -> handler::burn -> complete_burn, all in one transaction.
 */
export async function buildSuiBurn(
  network: Network,
  rpc: SuiGrpcClient,
  sender: string,
  amount: bigint,
  destinationDomain: number,
  mintRecipientWord: string,
  maxFee: bigint,
  minFinalityThreshold: number,
): Promise<Transaction> {
  const o = objects(network);
  const usdc = suiUsdcType(network);

  // USDC can sit in Coin objects, in the SIP-58 address balance, or both
  const { balance } = await rpc.getBalance({ owner: sender, coinType: usdc });
  const coinBalance = BigInt(balance.coinBalance);
  const addressBalance = BigInt(balance.addressBalance);
  if (coinBalance + addressBalance === 0n) throw new Error('No USDC in wallet');
  if (coinBalance + addressBalance < amount) {
    throw new Error('Insufficient USDC balance');
  }
  // Coin objects are used first. The address balance only covers what is left,
  // so wallets without address-balance support still work for coin-only users.
  const fromAddressBalance = amount > coinBalance ? amount - coinBalance : 0n;
  const coins =
    coinBalance > 0n ? await SuiPlatform.getCoins(rpc, sender, usdc) : [];

  const tx = new Transaction();
  const redeem = (value: bigint) =>
    tx.moveCall({
      target: '0x2::coin::redeem_funds',
      typeArguments: [usdc],
      arguments: [tx.withdrawal({ amount: value, type: usdc })],
    })[0];

  let coin: ReturnType<typeof redeem>;
  if (coins.length === 0) {
    coin = redeem(amount);
  } else {
    const [primary, ...rest] = coins;
    const primaryInput = tx.object(primary.coinObjectId);
    if (rest.length > 0) {
      tx.mergeCoins(
        primaryInput,
        rest.map((c) => tx.object(c.coinObjectId)),
      );
    }
    if (fromAddressBalance > 0n) {
      tx.mergeCoins(primaryInput, [redeem(fromAddressBalance)]);
    }
    [coin] = tx.splitCoins(primaryInput, [amount]);
  }

  const [burnReceipt, returnedCoin] = tx.moveCall({
    target: `${o.tokenMessengerPackage}::deposit_for_burn::deposit_for_burn`,
    arguments: [
      coin,
      tx.pure.u32(destinationDomain),
      tx.pure.address(mintRecipientWord),
      tx.pure.address('0x0'), // destination_caller: anyone can redeem
      tx.pure.u256(maxFee),
      tx.pure.u32(minFinalityThreshold),
      tx.pure.vector('u8', []), // hook_data
      tx.object(o.tokenMessengerState),
    ],
    typeArguments: [usdc],
  });

  const [ticket] = tx.moveCall({
    target: `${o.handlerPackage}::handler::burn`,
    arguments: [
      tx.object(o.handlerState),
      burnReceipt,
      returnedCoin,
      tx.object(DENY_LIST),
      tx.object(o.usdcTreasury),
    ],
  });

  tx.moveCall({
    target: `${o.tokenMessengerPackage}::deposit_for_burn::complete_burn`,
    arguments: [
      ticket,
      tx.object(o.tokenMessengerState),
      tx.object(o.messageTransmitterState),
    ],
    typeArguments: [usdc, `${o.handlerPackage}::handler::Auth`],
  });

  return tx;
}

/**
 * Mint USDC on Sui from a V2 message + attestation.
 * receive_message -> prepare_mint -> handler::mint -> complete_mint.
 */
export function buildSuiMint(
  network: Network,
  messageHex: string,
  attestationHex: string,
): Transaction {
  const o = objects(network);
  const usdc = suiUsdcType(network);
  const tx = new Transaction();

  const [receipt] = tx.moveCall({
    target: `${o.messageTransmitterPackage}::receive_message::receive_message`,
    arguments: [
      tx.pure.vector('u8', Array.from(hexToBytes(messageHex))),
      tx.pure.vector('u8', Array.from(hexToBytes(attestationHex))),
      tx.object(o.messageTransmitterState),
    ],
  });

  const [mintReceipt] = tx.moveCall({
    target: `${o.tokenMessengerPackage}::handle_receive_message::prepare_mint`,
    arguments: [receipt, tx.object(o.tokenMessengerState), tx.object(CLOCK)],
    typeArguments: [usdc],
  });

  const [ticket] = tx.moveCall({
    target: `${o.handlerPackage}::handler::mint`,
    arguments: [
      tx.object(o.handlerState),
      mintReceipt,
      tx.object(o.tokenMessengerState),
      tx.object(o.usdcTreasury), // note: treasury before deny list here
      tx.object(DENY_LIST),
    ],
  });

  tx.moveCall({
    target: `${o.tokenMessengerPackage}::handle_receive_message::complete_mint`,
    arguments: [
      ticket,
      tx.object(o.tokenMessengerState),
      tx.object(o.messageTransmitterState),
    ],
    typeArguments: [usdc, `${o.handlerPackage}::handler::Auth`],
  });

  // No fixed gas budget: the wallet estimates it. A hard-coded 1 SUI (Circle's
  // script default) rejects any wallet holding less than 1 SUI coin (even though the coin + address balance is more than 1).
  return tx;
}

/** True when the V2 message nonce was already redeemed on Sui */
export async function isSuiNonceUsed(
  network: Network,
  rpc: SuiGrpcClient,
  nonce: bigint,
): Promise<boolean> {
  const o = objects(network);
  const tx = new Transaction();
  tx.moveCall({
    target: `${o.messageTransmitterPackage}::state::is_nonce_used`,
    arguments: [tx.object(o.messageTransmitterState), tx.pure.u256(nonce)],
  });
  tx.setSenderIfNotSet(
    '0x0000000000000000000000000000000000000000000000000000000000000000',
  );
  const result = await rpc.simulateTransaction({
    transaction: tx,
    checksEnabled: false,
    include: { commandResults: true },
  });
  const bcs = result.commandResults?.[0]?.returnValues?.[0]?.bcs;
  if (!bcs) throw new Error('Could not read nonce state on Sui');
  return Boolean(bcs[0]);
}
