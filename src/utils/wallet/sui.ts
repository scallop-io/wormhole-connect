import type { Transaction } from '@mysten/sui/transactions';
import type { SuiWallet } from '@wormhole-labs/wallet-aggregator-sui';
import { getWallets } from '@wormhole-labs/wallet-aggregator-sui';
import type { Wallet } from '@wormhole-labs/wallet-aggregator-core';

import type { Network } from '@wormhole-foundation/sdk';
import { getWormholeContextV2 } from 'config';
import type {
  SuiUnsignedTransaction,
  SuiChains,
} from '@wormhole-foundation/sdk-sui';

export async function fetchOptions() {
  const suiWallets = await getWallets({ timeout: 0 });
  return suiWallets.reduce((obj: { [key: string]: SuiWallet }, value) => {
    obj[value.getName()] = value;
    return obj;
  }, {});
}

export const signAndSendTransaction = async (
  request: SuiUnsignedTransaction<Network, SuiChains>,
  wallet: Wallet,
) => {
  if (!wallet || !wallet.signAndSendTransaction) {
    throw new Error('wallet.signAndSendTransaction is undefined');
  }

  const tx = await wallet.signAndSendTransaction({
    transaction: request.transaction as Transaction,
  });

  // The wallet executes through its own node, so our fullnode may not have
  // indexed the transaction yet. Wait so later lookups don't get NOT_FOUND.
  try {
    const wh = await getWormholeContextV2();
    const rpc = wh.getPlatform('Sui').getRpc(request.chain);
    await rpc.waitForTransaction({ digest: tx.id });
  } catch (e) {
    // The transaction is already submitted, so don't fail the transfer
    console.warn('Timed out waiting for Sui transaction to be indexed', e);
  }

  return tx;
};
