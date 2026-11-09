import type { Chain, Network } from '@wormhole-foundation/sdk';

export const SUI_DOMAIN = 8;

// Source: https://developers.circle.com/cctp/references/sui-packages.md
// Mainnet packages and states checked on-chain: version 1, never upgraded,
// so these IDs are both the original and the callable ones.
export interface SuiV2Objects {
  messageTransmitterPackage: string;
  messageTransmitterState: string;
  tokenMessengerPackage: string;
  tokenMessengerState: string;
  handlerPackage: string;
  handlerState: string;
  usdcTreasury: string;
}

export const SUI_V2_OBJECTS: Record<'Mainnet' | 'Testnet', SuiV2Objects> = {
  Mainnet: {
    messageTransmitterPackage:
      '0x16bcfcfc465f96281663a344641c017de84529370e11aa3879d0dce43ad6db87',
    messageTransmitterState:
      '0x0c067f7d325e5b60e3179712e7783534ba1556cbb3d359d8161497e37689230c',
    tokenMessengerPackage:
      '0xeb14978abfe93a37c5d5bf86a0623b923553a5f0e794daac7724f1e2fdbfb830',
    tokenMessengerState:
      '0x06fb166941cd7bc095edc019d054a753ec3f1e4c25f28f2ecc4a6cfa0a9b1167',
    handlerPackage:
      '0x185ed207c4d64fc594882ab927f9f3c6ff957aad03df8a731ba64378faeeb2bf',
    handlerState:
      '0xa32de8a6dd0178fb05f662929d55cddb69a25c26bde4b83f89e36d17ead94c41',
    usdcTreasury:
      '0x57d6725e7a8b49a7b2a612f6bd66ab5f39fc95332ca48be421c3229d514a6de7',
  },
  Testnet: {
    messageTransmitterPackage:
      '0xe9678cd42a81886e18e21361088071f275105636a4d3751e1d7f255211f73bbe',
    messageTransmitterState:
      '0xfee3a2b47f9ef2de2405fc63d79194307945f8ea768815cfc46083bc20fbe6ed',
    tokenMessengerPackage:
      '0x267d3c0cb776eace2840f27e4d33da9c6d952f9749403f1fe6579f4962ed3c64',
    tokenMessengerState:
      '0x72cb55cd14d01e6361386d6ea93eecda9fa1efc3c202b8dd69c1e4683e4c0ca0',
    handlerPackage:
      '0xbe8479044396a45e07de2c7f14789c35b8338406eebc53b2527da56839a91561',
    handlerState:
      '0xfbd9c0517c4f0e1817445ee2be598806e3c392a465d7e3d773d1055f3f0eed32',
    usdcTreasury:
      '0x7170137d4a6431bf83351ac025baf462909bffe2877d87716374fb42b9629ebe',
  },
};

export const IRIS_API: Record<'Mainnet' | 'Testnet', string> = {
  Mainnet: 'https://iris-api.circle.com',
  Testnet: 'https://iris-api-sandbox.circle.com',
};

// Circle CCTP V2 EVM contracts (same address on every listed chain)
export const EVM_V2_CONTRACTS: Record<
  'Mainnet' | 'Testnet',
  { tokenMessenger: string; messageTransmitter: string }
> = {
  Mainnet: {
    tokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
  },
  Testnet: {
    tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  },
};

// Circle CCTP V2 Solana programs (same on mainnet and devnet) and the lookup
// table that keeps the receive transaction under the size limit.
export const SOLANA_V2 = {
  tokenMessengerMinter: 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe',
  messageTransmitter: 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
  lookupTable: {
    Mainnet: 'Ec9XVcN6YqFhqNFTYQD3985jmGFEDa7tHEQK8bbQi5xD',
    Testnet: '8ZHaV5NQ218fLR85VtC9oK3Axyvj8uxGpnKdaswxsxe4',
  },
} as const;

// Circle V2 domains: Sui, Solana and EVM chains.
export const V2_DOMAINS: Record<
  'Mainnet' | 'Testnet',
  Partial<Record<Chain, number>>
> = {
  Mainnet: {
    Ethereum: 0,
    Avalanche: 1,
    Optimism: 2,
    Arbitrum: 3,
    Solana: 5,
    Base: 6,
    Polygon: 7,
    Sui: SUI_DOMAIN,
    Unichain: 10,
    Linea: 11,
    Sonic: 13,
    Worldchain: 14,
    Monad: 15,
    Seievm: 16,
    HyperEVM: 19,
    Ink: 21,
    Plume: 22,
    Arc: 26,
  },
  Testnet: {
    Sepolia: 0,
    Avalanche: 1,
    ArbitrumSepolia: 3,
    Solana: 5,
    BaseSepolia: 6,
    Sui: SUI_DOMAIN,
    Linea: 11,
    Sonic: 13,
    Arc: 26,
  },
};

// Standard transfer finality (Fast transfer is not offered on Sui)
export const FINALITY_STANDARD = 2000;

export const isTestOrMainnet = (n: Network): n is 'Mainnet' | 'Testnet' =>
  n === 'Mainnet' || n === 'Testnet';

export const getV2Domain = (network: Network, chain: Chain): number => {
  if (!isTestOrMainnet(network)) throw new Error(`Unsupported ${network}`);
  const d = V2_DOMAINS[network][chain];
  if (d === undefined) throw new Error(`No CCTP V2 domain for ${chain}`);
  return d;
};

export const getV2Chain = (network: Network, domain: number): Chain => {
  if (!isTestOrMainnet(network)) throw new Error(`Unsupported ${network}`);
  const hit = Object.entries(V2_DOMAINS[network]).find(([, d]) => d === domain);
  if (!hit) throw new Error(`No CCTP V2 chain for domain ${domain}`);
  return hit[0] as Chain;
};
