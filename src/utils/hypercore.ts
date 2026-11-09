import * as routes from '@wormhole-foundation/sdk-connect/routes';
import type { Chain, Network } from '@wormhole-foundation/sdk-connect';
import type { TransferParams, ValidationResult } from '../routes/mayan/types';
import { isEvmChain } from './evm';

// Note: Hyperliquid bridge = Arbitrum bridge + custom payload for USDC deposit to Hyperliquid

export function isHyperCoreChain(chain: Chain): boolean {
  return chain === 'HyperCore';
}

/**
 * Enforces HyperCore routing rules: only EVM -> HyperCore flows with USDC
 * inbound, and disallow HyperCore-originated USDC.
 */
export function validateHyperCoreTransfer<N extends Network>(
  request: routes.RouteTransferRequest<N>,
  params: TransferParams,
): ValidationResult | null {
  const { fromChain, toChain } = request;

  if (isHyperCoreChain(fromChain.chain)) {
    return {
      valid: false,
      params,
      error: new routes.UnavailableError(
        new Error('HyperCore cannot be used as a source chain'),
      ),
    };
  }

  if (!isHyperCoreChain(toChain.chain)) {
    return null;
  }

  if (toChain.network !== 'Mainnet') {
    return {
      valid: false,
      params,
      error: new routes.UnavailableError(
        new Error('HyperCore is only available on Mainnet'),
      ),
    };
  }

  if (!(isEvmChain(fromChain.chain) || fromChain.chain === 'Solana')) {
    return {
      valid: false,
      params,
      error: new routes.UnavailableError(
        new Error('HyperCore only supports EVM or Solana source chains'),
      ),
    };
  }

  return null;
}
