import type * as routes from '@wormhole-foundation/sdk-connect/routes';
import type { Network } from '@wormhole-foundation/sdk';

export type QuoteMetadata = {
  quote: routes.QuoteResult<routes.Options>;
  request: routes.RouteTransferRequest<Network>;
  routeInstance: routes.Route<Network>;
};
