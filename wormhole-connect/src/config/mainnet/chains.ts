import { CONFIG } from 'sdklegacy';
import { ChainsConfig, Icon } from '../types';

const { chains } = CONFIG.MAINNET;

export const MAINNET_CHAINS: ChainsConfig = {
  Ethereum: {
    ...chains.Ethereum!,
    displayName: 'Ethereum',
    explorerUrl: 'https://etherscan.io/',
    explorerName: 'Etherscan',
    gasToken: 'ETH',
    chainId: 1,
    icon: Icon.ETH,
    automaticRelayer: true,
    maxBlockSearch: 2000,
  },
  Bsc: {
    ...chains.Bsc!,
    displayName: 'BSC',
    explorerUrl: 'https://bscscan.com/',
    explorerName: 'BscScan',
    gasToken: 'BNB',
    chainId: 56,
    icon: Icon.BSC,
    automaticRelayer: true,
    maxBlockSearch: 2000,
  },
  Polygon: {
    ...chains.Polygon!,
    displayName: 'Polygon',
    explorerUrl: 'https://polygonscan.com/',
    explorerName: 'PolygonScan',
    gasToken: 'MATIC',
    chainId: 137,
    icon: Icon.POLYGON,
    automaticRelayer: true,
    maxBlockSearch: 1000,
  },
  Avalanche: {
    ...chains.Avalanche!,
    displayName: 'Avalanche',
    explorerUrl: 'https://avascan.info/blockchain/c/',
    explorerName: 'Avascan',
    gasToken: 'AVAX',
    chainId: 43114,
    icon: Icon.AVAX,
    automaticRelayer: true,
    maxBlockSearch: 2000,
  },
  Fantom: {
    ...chains.Fantom!,
    displayName: 'Fantom',
    explorerUrl: 'https://ftmscan.com/',
    explorerName: 'FTMscan',
    gasToken: 'FTM',
    chainId: 250,
    icon: Icon.FANTOM,
    automaticRelayer: true,
    maxBlockSearch: 2000,
  },
  Celo: {
    ...chains.Celo!,
    displayName: 'Celo',
    explorerUrl: 'https://explorer.celo.org/mainnet/',
    explorerName: 'Celo Explorer',
    gasToken: 'CELO',
    chainId: 42220,
    icon: Icon.CELO,
    automaticRelayer: true,
    maxBlockSearch: 2000,
  },
  Moonbeam: {
    ...chains.Moonbeam!,
    displayName: 'Moonbeam',
    explorerUrl: 'https://moonscan.io/',
    explorerName: 'Moonscan',
    gasToken: 'GLMR',
    chainId: 1284,
    icon: Icon.GLMR,
    automaticRelayer: true,
    maxBlockSearch: 2000,
  },
  Solana: {
    ...chains.Solana!,
    displayName: 'Solana',
    explorerUrl: 'https://explorer.solana.com/',
    explorerName: 'Solana Explorer',
    gasToken: 'SOL',
    chainId: 0,
    icon: Icon.SOLANA,
    automaticRelayer: true,
    maxBlockSearch: 2000,
  },
  Sui: {
    ...chains.Sui!,
    displayName: 'Sui',
    explorerUrl: 'https://explorer.sui.io/',
    explorerName: 'Sui Explorer',
    gasToken: 'SUI',
    chainId: 0,
    icon: Icon.SUI,
    automaticRelayer: true,
    maxBlockSearch: 0,
  },
  Aptos: {
    ...chains.Aptos!,
    displayName: 'Aptos',
    explorerUrl: 'https://explorer.aptoslabs.com/',
    explorerName: 'Aptos Explorer',
    gasToken: 'APT',
    chainId: 0,
    icon: Icon.APT,
    automaticRelayer: false,
    maxBlockSearch: 0,
  },
  Base: {
    ...chains.Base!,
    displayName: 'Base',
    explorerUrl: 'https://basescan.org/',
    explorerName: 'BaseScan',
    gasToken: 'ETHbase',
    chainId: 8453,
    icon: Icon.BASE,
    automaticRelayer: true,
    maxBlockSearch: 2000,
  },
  // TODO: SDKV2 - re-enable cosmos chains once cosmos gateway route is implemented
  //Osmosis: {
  //  ...chains.Osmosis!,
  //  displayName: 'Osmosis',
  //  explorerUrl: 'https://mintscan.io/osmosis/',
  //  explorerName: 'MintScan',
  //  gasToken: 'OSMO',
  //  chainId: 'osmosis-1',
  //  icon: Icon.OSMO,
  //  automaticRelayer: false,
  //  maxBlockSearch: 0,
  //},
  //Wormchain: {
  //  ...chains.Wormchain!,
  //  displayName: 'Wormchain',
  //  explorerUrl: '',
  //  explorerName: '',
  //  gasToken: 'WORM',
  //  chainId: '',
  //  icon: Icon.OSMO,
  //  automaticRelayer: false,
  //  maxBlockSearch: 0,
  //},
  Arbitrum: {
    ...chains.Arbitrum!,
    displayName: 'Arbitrum',
    explorerUrl: 'https://arbiscan.io/',
    explorerName: 'Arbitrum Explorer',
    gasToken: 'ETHarbitrum',
    chainId: 42161,
    icon: Icon.ARBITRUM,
    maxBlockSearch: 2000,
  },
  Optimism: {
    ...chains.Optimism!,
    displayName: 'Optimism',
    explorerUrl: 'https://optimistic.etherscan.io/',
    explorerName: 'Optimistic Etherscan',
    gasToken: 'ETHoptimism',
    chainId: 10,
    icon: Icon.OPTIMISM,
    maxBlockSearch: 2000,
  },
  Klaytn: {
    ...chains.Klaytn!,
    displayName: 'Klaytn',
    explorerUrl: 'https://klaytnscope.com/',
    explorerName: 'Klaytn Scope',
    gasToken: 'KLAY',
    chainId: 8217,
    icon: Icon.KLAY,
    maxBlockSearch: 2000,
  },
  //Evmos: {
  //  ...chains.Evmos!,
  //  displayName: 'Evmos',
  //  explorerUrl: 'https://www.mintscan.io/evmos/',
  //  explorerName: 'MintScan',
  //  gasToken: 'EVMOS',
  //  chainId: 'evmos_9001-2',
  //  icon: Icon.EVMOS,
  //  automaticRelayer: false,
  //  maxBlockSearch: 0,
  //},
  //Kujira: {
  //  ...chains.Kujira!,
  //  displayName: 'Kujira',
  //  explorerUrl: 'https://finder.kujira.app/kaiyo-1/',
  //  explorerName: 'Kujira Finder',
  //  gasToken: 'KUJI',
  //  chainId: 'kaiyo-1',
  //  icon: Icon.KUJI,
  //  automaticRelayer: false,
  //  maxBlockSearch: 0,
  //},
  //Injective: {
  //  ...chains.Injective!,
  //  displayName: 'Injective',
  //  explorerUrl: 'https://explorer.injective.network/',
  //  explorerName: 'Injective Explorer',
  //  gasToken: 'INJ',
  //  chainId: 'injective-1',
  //  icon: Icon.INJ,
  //  automaticRelayer: false,
  //  maxBlockSearch: 0,
  //},
  Scroll: {
    ...chains.Scroll!,
    displayName: 'Scroll',
    explorerUrl: 'https://scrollscan.com/',
    explorerName: 'Scrollscan',
    gasToken: 'ETHscroll',
    chainId: 534352,
    icon: Icon.SCROLL,
    automaticRelayer: false,
    maxBlockSearch: 2000,
  },
  Blast: {
    ...chains.Blast!,
    displayName: 'Blast',
    explorerUrl: 'https://blastscan.io/',
    explorerName: 'Blastscan',
    gasToken: 'ETHblast',
    chainId: 81457,
    icon: Icon.BLAST,
    automaticRelayer: false,
    maxBlockSearch: 2000,
  },
  Xlayer: {
    ...chains.Xlayer!,
    displayName: 'X Layer',
    explorerUrl: 'https://www.okx.com/web3/explorer/xlayer/',
    explorerName: 'OKX Explorer',
    gasToken: 'OKB',
    chainId: 196,
    icon: Icon.XLAYER,
    automaticRelayer: false,
    maxBlockSearch: 2000,
  },
};
