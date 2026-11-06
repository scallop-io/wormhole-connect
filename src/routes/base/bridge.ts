import type * as routes from '@wormhole-foundation/sdk-connect/routes';
import type { BaseBridgeExecutorRoute } from '@wormhole-labs/base-bridge-executor-route';
import {
  baseBridgeRoute,
  type TokenConfiguration,
} from '@wormhole-labs/base-bridge-executor-route';

export type { BaseBridgeExecutorRoute, TokenConfiguration };

export function createBaseBridgeRoute(
  tokens: TokenConfiguration[],
  config?: BaseBridgeExecutorRoute.Config,
): routes.RouteConstructor {
  config = config || { referrerFeeDbps: 0n };
  return baseBridgeRoute(config, tokens);
}
