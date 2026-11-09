import type * as routes from '@wormhole-foundation/sdk-connect/routes';
import type { Network } from '@wormhole-foundation/sdk-base';
import { MayanRouteCrossChain } from './MayanRouteCrossChain';
import { MayanProtocol } from './types';

export class MayanRouteMCTP<N extends Network>
  extends MayanRouteCrossChain<N>
  implements routes.StaticRouteMethods<typeof MayanRouteMCTP>
{
  static meta = {
    name: 'MayanSwapMCTP',
    provider: 'Mayan MCTP',
  };

  override protocols: MayanProtocol[] = [MayanProtocol.MCTP];
}
