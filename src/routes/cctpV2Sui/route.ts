import * as routes from '@wormhole-foundation/sdk-connect/routes';
import { checkCircleGeoblock } from '@wormhole-foundation/sdk-connect/circle-api';
import type {
  Chain,
  ChainAddress,
  ChainContext,
  Network,
  Signer,
  TokenId,
  TransactionId,
} from '@wormhole-foundation/sdk';
import {
  Wormhole,
  amount as sdkAmount,
  chainToPlatform,
  circle,
  finality,
  isSameToken,
  signSendWait,
  time,
  TransferState,
} from '@wormhole-foundation/sdk';
import type { TransferReceipt } from '@wormhole-foundation/sdk';
import { SuiUnsignedTransaction } from '@wormhole-foundation/sdk-sui';
import { SolanaUnsignedTransaction } from '@wormhole-foundation/sdk-solana';
import type { Connection } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import type { SuiGrpcClient } from '@mysten/sui/grpc';
import type { Provider } from 'ethers';
import type { Transaction } from '@mysten/sui/transactions';

import {
  FINALITY_STANDARD,
  V2_DOMAINS,
  getV2Chain,
  getV2Domain,
  isTestOrMainnet,
} from './consts';
import { evmBurn, evmIsNonceUsed, evmReceive } from './evm';
import { fetchStandardMaxFee, fetchV2Attestation } from './iris';
import type { V2Attestation } from './iris';
import {
  bytesToHex,
  hexToBytes,
  nonceToU256,
  parseV2Message,
  toWord,
} from './message';
import {
  buildSolanaBurn,
  buildSolanaReceive,
  isSolanaNonceUsed,
} from './solana';
import type { SolanaTx } from './solana';
import { buildSuiBurn, buildSuiMint, isSuiNonceUsed } from './sui';

// Namespace merges with the class below, as in the SDK's own routes
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ManualCCTPv2SuiRoute {
  export type Options = Record<string, never>;
  export type NormalizedParams = { amount: sdkAmount.Amount };
  export interface ValidatedParams
    extends routes.ValidatedTransferParams<Options> {
    normalizedParams: NormalizedParams;
  }
  /** Plain data only: receipts are saved to localStorage as JSON */
  export type AttestationReceipt = {
    id: { hash: string };
    attestation?: V2Attestation;
  };
}

type Op = ManualCCTPv2SuiRoute.Options;
type Vp = ManualCCTPv2SuiRoute.ValidatedParams;
type Tp = routes.TransferParams<Op>;
type Vr = routes.ValidationResult<Op>;
type Q = routes.Quote<Op, Vp>;
type QR = routes.QuoteResult<Op, Vp>;
export type CctpV2SuiReceipt =
  TransferReceipt<ManualCCTPv2SuiRoute.AttestationReceipt>;
type R = CctpV2SuiReceipt;

const POLL_MS = 2_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function* single(tx: Transaction, network: Network, desc: string) {
  yield new SuiUnsignedTransaction(tx, network, 'Sui', desc);
}

async function* solanaSingle(tx: SolanaTx, network: Network, desc: string) {
  yield new SolanaUnsignedTransaction(tx, network, 'Solana', desc);
}

const isSolana = (chain: Chain) => chainToPlatform(chain) === 'Solana';

export class ManualCCTPv2SuiRoute<N extends Network>
  extends routes.ManualRoute<N, Op, Vp, R>
  implements routes.StaticRouteMethods<typeof ManualCCTPv2SuiRoute>
{
  static meta = {
    name: 'ManualCCTPv2Sui',
    provider: 'Circle',
  };

  static supportedNetworks(): Network[] {
    return ['Mainnet', 'Testnet'];
  }

  static supportedChains(network: Network): Chain[] {
    if (!isTestOrMainnet(network)) return [];
    return Object.keys(V2_DOMAINS[network]) as Chain[];
  }

  static async supportedDestinationTokens<N extends Network>(
    sourceToken: TokenId,
    fromChain: ChainContext<N>,
    toChain: ChainContext<N>,
  ): Promise<TokenId[]> {
    // Exactly one side must be Sui, the other a CCTP V2 EVM or Solana chain
    if ((fromChain.chain === 'Sui') === (toChain.chain === 'Sui')) return [];
    const supported = ManualCCTPv2SuiRoute.supportedChains(fromChain.network);
    if (!supported.includes(fromChain.chain)) return [];
    if (!supported.includes(toChain.chain)) return [];

    const srcUsdc = circle.usdcContract.get(fromChain.network, fromChain.chain);
    if (!srcUsdc) return [];
    if (!isSameToken(sourceToken, Wormhole.tokenId(fromChain.chain, srcUsdc))) {
      return [];
    }
    const dstUsdc = circle.usdcContract.get(toChain.network, toChain.chain);
    if (!dstUsdc) return [];
    return [Wormhole.chainAddress(toChain.chain, dstUsdc)];
  }

  getDefaultOptions(): Op {
    return {};
  }

  async validate(
    request: routes.RouteTransferRequest<N>,
    params: Tp,
  ): Promise<Vr> {
    const { fromChain, toChain } = request;
    if (fromChain.chain === toChain.chain) {
      return {
        valid: false,
        params,
        error: new Error('Source and destination chains cannot be the same'),
      };
    }
    if ((fromChain.chain === 'Sui') === (toChain.chain === 'Sui')) {
      return {
        valid: false,
        params,
        error: new Error('One side of the transfer must be Sui'),
      };
    }
    const amount = request.parseAmount(params.amount);
    const validatedParams: Vp = {
      normalizedParams: { amount },
      options: params.options ?? this.getDefaultOptions(),
      ...params,
    };
    return { valid: true, params: validatedParams };
  }

  async quote(
    request: routes.RouteTransferRequest<N>,
    params: Vp,
  ): Promise<QR> {
    try {
      const geoBlockError = await checkCircleGeoblock();
      if (geoBlockError) return geoBlockError;

      const { fromChain, toChain } = request;
      const network = fromChain.network;
      const units = sdkAmount.units(params.normalizedParams.amount);
      const maxFee = await fetchStandardMaxFee(
        network,
        getV2Domain(network, fromChain.chain),
        getV2Domain(network, toChain.chain),
        units,
      );
      if (maxFee >= units) {
        return {
          success: false,
          error: new Error('Amount is too small to cover the Circle fee'),
        };
      }

      const srcUsdc = circle.usdcContract.get(network, fromChain.chain)!;
      const dstUsdc = circle.usdcContract.get(network, toChain.chain)!;
      return request.displayQuote(
        {
          sourceToken: {
            token: Wormhole.chainAddress(fromChain.chain, srcUsdc),
            amount: units,
          },
          destinationToken: {
            token: Wormhole.chainAddress(toChain.chain, dstUsdc),
            amount: units - maxFee,
          },
          eta: finality.estimateFinalityTime(fromChain.chain) + 30_000,
          expires: time.expiration(0, 5, 0),
        },
        params,
      );
    } catch (e) {
      return { success: false, error: e as Error };
    }
  }

  async initiate(
    request: routes.RouteTransferRequest<N>,
    signer: Signer,
    quote: Q,
    to: ChainAddress,
  ): Promise<R> {
    const { fromChain, toChain } = request;
    const network = fromChain.network;
    const units = sdkAmount.units(quote.params.normalizedParams.amount);
    const srcDomain = getV2Domain(network, fromChain.chain);
    const dstDomain = getV2Domain(network, toChain.chain);

    // Fee is re-read now: it must be at least Circle's current minimum
    const maxFee = await fetchStandardMaxFee(
      network,
      srcDomain,
      dstDomain,
      units,
    );
    if (maxFee >= units) {
      throw new Error('Amount is too small to cover the Circle fee');
    }
    const quotedFee = units - sdkAmount.units(quote.destinationToken.amount);
    if (maxFee > quotedFee) {
      throw new Error('Circle fee has increased. Please request a new quote.');
    }

    const sender = signer.address();

    // On Solana the USDC lands in the recipient's token account, not the wallet
    let recipient = to;
    if (isSolana(toChain.chain)) {
      const usdc = circle.usdcContract.get(network, toChain.chain)!;
      recipient = await (
        toChain as unknown as {
          getTokenAccount(
            a: ChainAddress['address'],
            t: unknown,
          ): Promise<ChainAddress>;
        }
      ).getTokenAccount(to.address, Wormhole.parseAddress(toChain.chain, usdc));
    }
    const recipientWord = toWord(
      bytesToHex(recipient.address.toUniversalAddress().toUint8Array()),
    );

    let xfer: AsyncGenerator<never>;
    if (isSolana(fromChain.chain)) {
      const solanaTx = await buildSolanaBurn({
        connection: (await fromChain.getRpc()) as Connection,
        network: network as 'Mainnet' | 'Testnet',
        owner: new PublicKey(sender),
        usdcMint: new PublicKey(circle.usdcContract.get(network, 'Solana')!),
        amount: units,
        destinationDomain: dstDomain,
        mintRecipient: hexToBytes(recipientWord),
        maxFee,
        minFinalityThreshold: FINALITY_STANDARD,
      });
      xfer = solanaSingle(
        solanaTx,
        network,
        'CCTP V2 burn',
      ) as AsyncGenerator<never>;
    } else if (fromChain.chain === 'Sui') {
      const rpc = (await fromChain.getRpc()) as SuiGrpcClient;
      const tx = await buildSuiBurn(
        network,
        rpc,
        sender,
        units,
        dstDomain,
        recipientWord,
        maxFee,
        FINALITY_STANDARD,
      );
      xfer = single(tx, network, 'CCTP V2 burn') as AsyncGenerator<never>;
    } else {
      const provider = (await fromChain.getRpc()) as Provider;
      xfer = evmBurn(
        network,
        fromChain.chain,
        provider,
        sender,
        units,
        dstDomain,
        recipientWord,
        maxFee,
        FINALITY_STANDARD,
      ) as AsyncGenerator<never>;
    }

    const txids = await signSendWait(fromChain, xfer, signer);
    return {
      from: fromChain.chain,
      to: toChain.chain,
      state: TransferState.SourceInitiated,
      originTxs: txids,
    };
  }

  async complete(signer: Signer, receipt: R): Promise<R> {
    const att =
      receipt.state >= TransferState.Attested && 'attestation' in receipt
        ? receipt.attestation?.attestation
        : undefined;
    if (!att) {
      throw new Error('The transfer must be attested before it can be claimed');
    }
    const { message, attestation } = att;
    const network = this.wh.network;
    const toChain = this.wh.getChain(receipt.to);

    let xfer: AsyncGenerator<never>;
    if (receipt.to === 'Sui') {
      xfer = single(
        buildSuiMint(network, message, attestation),
        network,
        'CCTP V2 mint',
      ) as AsyncGenerator<never>;
    } else if (isSolana(receipt.to)) {
      const solanaTx = await buildSolanaReceive({
        connection: (await toChain.getRpc()) as Connection,
        network: network as 'Mainnet' | 'Testnet',
        payer: new PublicKey(signer.address()),
        usdcMint: new PublicKey(circle.usdcContract.get(network, 'Solana')!),
        messageHex: message,
        attestationHex: attestation,
      });
      xfer = solanaSingle(
        solanaTx,
        network,
        'CCTP V2 mint',
      ) as AsyncGenerator<never>;
    } else {
      const provider = (await toChain.getRpc()) as Provider;
      xfer = evmReceive(
        network,
        receipt.to,
        provider,
        signer.address(),
        message,
        attestation,
      ) as AsyncGenerator<never>;
    }

    const destinationTxs = await signSendWait(toChain, xfer, signer);
    return {
      ...receipt,
      state: TransferState.DestinationInitiated,
      destinationTxs,
    } as R;
  }

  async resume(tx: TransactionId): Promise<R> {
    const network = this.wh.network;
    const srcDomain = getV2Domain(network, tx.chain); // throws if not a V2 chain
    const att = await fetchV2Attestation(network, srcDomain, tx.txid);
    if (!att)
      throw new Error('No attested CCTP V2 message for this transaction');

    const msg = parseV2Message(att.message);
    const from = tx.chain;
    const to = getV2Chain(network, msg.destinationDomain);
    // Only claim Sui transfers; EVM <-> EVM belongs to the executor routes
    if ((from === 'Sui') === (to === 'Sui')) {
      throw new Error('Not a Sui CCTP V2 transfer');
    }
    return {
      from,
      to,
      state: TransferState.Attested,
      originTxs: [tx],
      attestation: { id: { hash: tx.txid }, attestation: att },
    } as R;
  }

  async *track(receipt: R, timeout = 120_000): AsyncGenerator<R> {
    const network = this.wh.network;
    const deadline = Date.now() + timeout;
    let current = receipt;

    if (
      current.state === TransferState.SourceInitiated ||
      current.state === TransferState.SourceFinalized
    ) {
      const origin = current.originTxs[current.originTxs.length - 1];
      const srcDomain = getV2Domain(network, current.from);
      while (Date.now() < deadline) {
        const att = await fetchV2Attestation(network, srcDomain, origin.txid);
        if (att) {
          current = {
            from: current.from,
            to: current.to,
            state: TransferState.Attested,
            originTxs: current.originTxs,
            attestation: { id: { hash: origin.txid }, attestation: att },
          } as R;
          yield current;
          break;
        }
        await sleep(POLL_MS);
      }
      if (current.state !== TransferState.Attested) return;
    }

    if (
      (current.state === TransferState.Attested ||
        current.state === TransferState.DestinationInitiated) &&
      'attestation' in current &&
      current.attestation.attestation
    ) {
      const { nonce } = parseV2Message(current.attestation.attestation.message);
      while (Date.now() < deadline) {
        if (await this.isNonceUsed(current.to, nonce)) {
          yield { ...current, state: TransferState.DestinationFinalized } as R;
          return;
        }
        // Only a claim in progress needs waiting; otherwise the user claims later
        if (current.state === TransferState.Attested) return;
        await sleep(POLL_MS);
      }
    }
  }

  private async isNonceUsed(chain: Chain, nonceWord: string): Promise<boolean> {
    const network = this.wh.network;
    const rpc = await this.wh.getChain(chain).getRpc();
    if (chain === 'Sui') {
      return isSuiNonceUsed(
        network,
        rpc as SuiGrpcClient,
        nonceToU256(nonceWord),
      );
    }
    if (isSolana(chain)) {
      return isSolanaNonceUsed(rpc as Connection, nonceWord);
    }
    return evmIsNonceUsed(network, rpc as Provider, nonceWord);
  }
}
