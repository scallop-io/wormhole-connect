import type * as routes from '@wormhole-foundation/sdk-connect/routes';
import type { Network } from '@wormhole-foundation/sdk-base';
import { MayanRouteCrossChain } from './MayanRouteCrossChain';
import { MayanProtocol } from './types';

export class MayanRouteWH<N extends Network>
  extends MayanRouteCrossChain<N>
  implements routes.StaticRouteMethods<typeof MayanRouteWH>
{
  static meta = {
    name: 'MayanSwapWH',
    provider: 'Mayan WH',
  };

  override protocols: MayanProtocol[] = [MayanProtocol.WH];
}
