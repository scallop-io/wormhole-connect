import type * as routes from '@wormhole-foundation/sdk-connect/routes';
import type { Network } from '@wormhole-foundation/sdk-base';
import { MayanRouteCrossChain } from './MayanRouteCrossChain';
import { MayanProtocol } from './types';

export class MayanRouteSWIFT<N extends Network>
  extends MayanRouteCrossChain<N>
  implements routes.StaticRouteMethods<typeof MayanRouteSWIFT>
{
  static meta = {
    name: 'MayanSwapSWIFT',
    provider: 'Mayan Swift',
  };

  override protocols: MayanProtocol[] = [MayanProtocol.SWIFT];
}
