import * as routes from '@wormhole-foundation/sdk-connect/routes';
import type { ChainContext, Network, TokenId } from '@wormhole-foundation/sdk';

export { ManualCCTPv2SuiRoute } from './route';
export type { CctpV2SuiReceipt } from './route';

/**
 * The SDK's V1 route, minus Sui. Circle is retiring CCTP V1 (Dec 1, 2026), so new
 * Sui transfers go through ManualCCTPv2Sui. The route keeps its name
 * ('ManualCCTP') so in-flight V1 Sui transfers can still be resumed and claimed.
 */
export class LegacyCCTPRoute<N extends Network>
  extends routes.CCTPRoute<N>
  implements routes.StaticRouteMethods<typeof LegacyCCTPRoute>
{
  static override async supportedDestinationTokens<N extends Network>(
    sourceToken: TokenId,
    fromChain: ChainContext<N>,
    toChain: ChainContext<N>,
  ): Promise<TokenId[]> {
    if (fromChain.chain === 'Sui' || toChain.chain === 'Sui') return [];
    return super.supportedDestinationTokens(sourceToken, fromChain, toChain);
  }
}
