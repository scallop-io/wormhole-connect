import { Contract } from 'ethers';
import type { Provider } from 'ethers';
import {
  EvmPlatform,
  EvmUnsignedTransaction,
  addChainId,
  addFrom,
} from '@wormhole-foundation/sdk-evm';
import { circle, nativeChainIds } from '@wormhole-foundation/sdk-base';
import type { Chain, Network } from '@wormhole-foundation/sdk';
import { EVM_V2_CONTRACTS, isTestOrMainnet } from './consts';
import { hexToBytes, bytesToHex } from './message';

const TOKEN_MESSENGER_ABI = [
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)',
];
const MESSAGE_TRANSMITTER_ABI = [
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
  'function usedNonces(bytes32 nonce) view returns (uint256)',
];

const contracts = (network: Network) => {
  if (!isTestOrMainnet(network)) throw new Error(`Unsupported ${network}`);
  return EVM_V2_CONTRACTS[network];
};

const unsigned = (
  network: Network,
  chain: Chain,
  // biome-ignore lint/suspicious/noExplicitAny: ethers tx request
  txReq: any,
  description: string,
  parallelizable = false,
) => {
  const chainId = nativeChainIds.networkChainToNativeChainId.get(
    network,
    chain,
  ) as bigint;
  return new EvmUnsignedTransaction(
    addChainId(txReq, chainId),
    network,
    chain as never,
    description,
    parallelizable,
  );
};

/** Burn USDC on an EVM chain via CCTP V2 (standard transfer), approving first if needed */
export async function* evmBurn(
  network: Network,
  chain: Chain,
  provider: Provider,
  sender: string,
  amount: bigint,
  destinationDomain: number,
  mintRecipientWord: string,
  maxFee: bigint,
  minFinalityThreshold: number,
) {
  const { tokenMessenger } = contracts(network);
  const usdc = circle.usdcContract.get(network, chain);
  if (!usdc) throw new Error(`No USDC configured for ${chain}`);

  const token = EvmPlatform.getTokenImplementation(provider, usdc);
  const allowance = await token.allowance(sender, tokenMessenger);
  if (allowance < amount) {
    const approveReq = await token.approve.populateTransaction(
      tokenMessenger,
      amount,
    );
    yield unsigned(
      network,
      chain,
      addFrom(approveReq, sender),
      'ERC20.approve of CCTP V2',
    );
  }

  const messenger = new Contract(tokenMessenger, TOKEN_MESSENGER_ABI, provider);
  const burnReq = await messenger.depositForBurn.populateTransaction(
    amount,
    destinationDomain,
    mintRecipientWord,
    usdc,
    `0x${'0'.repeat(64)}`, // destinationCaller: anyone can redeem
    maxFee,
    minFinalityThreshold,
  );
  yield unsigned(
    network,
    chain,
    addFrom(burnReq, sender),
    'CCTP V2 depositForBurn',
  );
}

/** Redeem a V2 message on an EVM chain */
export async function* evmReceive(
  network: Network,
  chain: Chain,
  provider: Provider,
  sender: string,
  messageHex: string,
  attestationHex: string,
) {
  const { messageTransmitter } = contracts(network);
  const mt = new Contract(
    messageTransmitter,
    MESSAGE_TRANSMITTER_ABI,
    provider,
  );
  const req = await mt.receiveMessage.populateTransaction(
    bytesToHex(hexToBytes(messageHex)),
    bytesToHex(hexToBytes(attestationHex)),
  );
  yield unsigned(
    network,
    chain,
    addFrom(req, sender),
    'CCTP V2 receiveMessage',
  );
}

/** True when the V2 message nonce was already redeemed on this EVM chain */
export async function evmIsNonceUsed(
  network: Network,
  provider: Provider,
  nonceWord: string,
): Promise<boolean> {
  const { messageTransmitter } = contracts(network);
  const mt = new Contract(
    messageTransmitter,
    MESSAGE_TRANSMITTER_ABI,
    provider,
  );
  return (await mt.usedNonces(nonceWord)) === 1n;
}
