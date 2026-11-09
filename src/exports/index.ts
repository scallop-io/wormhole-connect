import * as routes from '@wormhole-foundation/sdk-connect/routes';
import WormholeConnect from '../WormholeConnect';

import { type WormholeConnectTheme } from '../theme';

import MAINNET from 'config/mainnet';
import TESTNET from 'config/testnet';
import { buildConfig } from 'config';
export * as config from 'config/types';

// Routes
import { DEFAULT_ROUTES } from 'routes/operator';
import { ManualCCTPv2SuiRoute } from 'routes/cctpV2Sui';
export {
  cctpV2FastExecutorRoute,
  cctpV2StandardExecutorRoute,
} from '@wormhole-labs/cctp-executor-route';

import type { Chain, Network } from '@wormhole-foundation/sdk';

import { Token } from 'config/tokens';
import { TransferWallet } from 'utils/wallet';
import type {
  Wallet,
  WalletConnectedHandler,
  WalletEvents,
  WalletProviderEvents,
  WormholeConnectWalletProvider,
} from 'utils/wallet/types';

const { CCTPRoute, TBTCRoute, executorTokenBridgeRoute } = routes;

export default WormholeConnect;

export {
  // Config related exports
  MAINNET,
  TESTNET,
  buildConfig,

  // Types
  Chain,
  Network,
  WormholeConnectTheme,
  Token,

  // Wallet related exports
  TransferWallet,
  Wallet,
  WalletEvents,
  WormholeConnectWalletProvider,
  WalletProviderEvents,
  WalletConnectedHandler,

  // Routes
  DEFAULT_ROUTES,
  CCTPRoute,
  ManualCCTPv2SuiRoute,
  TBTCRoute,
  executorTokenBridgeRoute,
};

export * from 'telemetry';
