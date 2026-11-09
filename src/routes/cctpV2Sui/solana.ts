/**
 * Solana side of the manual CCTP V2 route (burn and receive).
 *
 * Adapted from circlefin/circle-cctp-crosschain-transfer, src/lib/solana-utils.ts
 *   Copyright (c) 2025, Circle Internet Group, Inc. All rights reserved.
 *   SPDX-License-Identifier: Apache-2.0
 *   Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
 *
 * Modified: ported for a browser dApp and mainnet. Returns versioned transactions
 * (with Circle's lookup table) for the SDK signer, sets destinationCaller to zero,
 * creates the recipient token account when needed and adds a used-nonce check.
 */
import type { Connection } from '@solana/web3.js';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { SOLANA_V2 } from './consts';
import { hexToBytes, parseV2Message } from './message';

const MESSAGE_TRANSMITTER = new PublicKey(SOLANA_V2.messageTransmitter);
const TOKEN_MESSENGER_MINTER = new PublicKey(SOLANA_V2.tokenMessengerMinter);

// Anchor instruction discriminators from the on-chain IDLs
const DEPOSIT_FOR_BURN = Uint8Array.from([215, 60, 61, 46, 114, 55, 128, 176]);
const RECEIVE_MESSAGE = Uint8Array.from([38, 144, 127, 225, 31, 225, 238, 25]);

// TokenMessenger account: 8-byte Anchor discriminator + fields; fee_recipient starts here
const FEE_RECIPIENT_OFFSET = 8 + 32 + 32 + 32 + 4 + 1;

type Seed = string | Uint8Array | PublicKey;

const pda = (label: string, program: PublicKey, extra: Seed[] = []) => {
  const seeds = [label, ...extra].map((s) =>
    typeof s === 'string'
      ? new TextEncoder().encode(s)
      : s instanceof PublicKey
      ? s.toBytes()
      : s,
  );
  return PublicKey.findProgramAddressSync(seeds, program)[0];
};

const u32 = (v: number) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, v, true);
  return out;
};

const u64 = (v: bigint) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, v, true);
  return out;
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const withLength = (b: Uint8Array) => concat(u32(b.length), b);

const meta = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({
  pubkey,
  isSigner,
  isWritable,
});

export type SolanaNetwork = 'Mainnet' | 'Testnet';

export interface SolanaTx {
  transaction: VersionedTransaction;
  /** Extra signers that must co-sign before the wallet (burn's event account) */
  signers: Keypair[];
}

async function toVersioned(
  connection: Connection,
  network: SolanaNetwork,
  payer: PublicKey,
  instructions: TransactionInstruction[],
): Promise<VersionedTransaction> {
  // The app replaces the blockhash and adds compute-budget instructions before signing
  const { blockhash } = await connection.getLatestBlockhash();
  const lut = (
    await connection.getAddressLookupTable(
      new PublicKey(SOLANA_V2.lookupTable[network]),
    )
  ).value;
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(lut ? [lut] : []);
  return new VersionedTransaction(message);
}

/** Burn USDC on Solana via CCTP V2 (standard transfer) */
export async function buildSolanaBurn(p: {
  connection: Connection;
  network: SolanaNetwork;
  owner: PublicKey;
  usdcMint: PublicKey;
  amount: bigint;
  destinationDomain: number;
  /** 32 bytes: a Sui address, or an EVM address left-padded to 32 bytes */
  mintRecipient: Uint8Array;
  maxFee: bigint;
  minFinalityThreshold: number;
}): Promise<SolanaTx> {
  const messageSentEvent = Keypair.generate();
  const userTokenAccount = getAssociatedTokenAddressSync(p.usdcMint, p.owner);

  const messageTransmitter = pda('message_transmitter', MESSAGE_TRANSMITTER);
  const tokenMessenger = pda('token_messenger', TOKEN_MESSENGER_MINTER);
  const tokenMinter = pda('token_minter', TOKEN_MESSENGER_MINTER);
  const localToken = pda('local_token', TOKEN_MESSENGER_MINTER, [p.usdcMint]);
  // The seed is the domain as a decimal string, not a number
  const remoteTokenMessenger = pda(
    'remote_token_messenger',
    TOKEN_MESSENGER_MINTER,
    [p.destinationDomain.toString()],
  );
  const senderAuthority = pda('sender_authority', TOKEN_MESSENGER_MINTER);
  const denylist = pda('denylist_account', TOKEN_MESSENGER_MINTER, [p.owner]);
  const eventAuthority = pda('__event_authority', TOKEN_MESSENGER_MINTER);

  const data = concat(
    DEPOSIT_FOR_BURN,
    u64(p.amount),
    u32(p.destinationDomain),
    p.mintRecipient,
    new Uint8Array(32), // destinationCaller: zero, anyone may redeem
    u64(p.maxFee),
    u32(p.minFinalityThreshold),
  );

  const ix = new TransactionInstruction({
    programId: TOKEN_MESSENGER_MINTER,
    keys: [
      meta(p.owner, false, true),
      meta(p.owner, true, true), // pays rent for the message event account
      meta(senderAuthority),
      meta(userTokenAccount, true),
      meta(denylist),
      meta(messageTransmitter, true),
      meta(tokenMessenger),
      meta(remoteTokenMessenger),
      meta(tokenMinter),
      meta(localToken, true),
      meta(p.usdcMint, true),
      meta(messageSentEvent.publicKey, true, true),
      meta(MESSAGE_TRANSMITTER),
      meta(TOKEN_MESSENGER_MINTER),
      meta(TOKEN_PROGRAM_ID),
      meta(SystemProgram.programId),
      meta(eventAuthority),
      meta(TOKEN_MESSENGER_MINTER),
    ],
    data: Buffer.from(data),
  });

  return {
    transaction: await toVersioned(p.connection, p.network, p.owner, [ix]),
    signers: [messageSentEvent],
  };
}

/** Redeem a V2 message on Solana (mints USDC to the message's mintRecipient token account) */
export async function buildSolanaReceive(p: {
  connection: Connection;
  network: SolanaNetwork;
  payer: PublicKey;
  usdcMint: PublicKey;
  messageHex: string;
  attestationHex: string;
}): Promise<SolanaTx> {
  const msg = parseV2Message(p.messageHex);
  const nonce = hexToBytes(msg.nonce);
  const remoteToken = new PublicKey(hexToBytes(msg.burnToken));
  const remoteDomain = msg.sourceDomain.toString();
  // The minted USDC goes to the token account fixed at burn time
  const userTokenAccount = new PublicKey(hexToBytes(msg.mintRecipient));

  const instructions: TransactionInstruction[] = [];
  const claimerAta = getAssociatedTokenAddressSync(p.usdcMint, p.payer);
  if (!(await p.connection.getAccountInfo(userTokenAccount))) {
    // Only the owner's own account can be created here
    if (!userTokenAccount.equals(claimerAta)) {
      throw new Error(
        "The recipient's USDC account does not exist. Claim with the recipient's wallet.",
      );
    }
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        p.payer,
        claimerAta,
        p.payer,
        p.usdcMint,
      ),
    );
  }

  const tokenMessenger = pda('token_messenger', TOKEN_MESSENGER_MINTER);
  const tokenMessengerInfo = await p.connection.getAccountInfo(tokenMessenger);
  if (!tokenMessengerInfo) throw new Error('TokenMessenger account not found');
  const feeRecipient = new PublicKey(
    tokenMessengerInfo.data.subarray(
      FEE_RECIPIENT_OFFSET,
      FEE_RECIPIENT_OFFSET + 32,
    ),
  );

  const messageTransmitter = pda('message_transmitter', MESSAGE_TRANSMITTER);
  const tokenMinter = pda('token_minter', TOKEN_MESSENGER_MINTER);
  const localToken = pda('local_token', TOKEN_MESSENGER_MINTER, [p.usdcMint]);
  const remoteTokenMessenger = pda(
    'remote_token_messenger',
    TOKEN_MESSENGER_MINTER,
    [remoteDomain],
  );
  const tokenPair = pda('token_pair', TOKEN_MESSENGER_MINTER, [
    remoteDomain,
    remoteToken,
  ]);
  const custody = pda('custody', TOKEN_MESSENGER_MINTER, [p.usdcMint]);
  const authority = pda('message_transmitter_authority', MESSAGE_TRANSMITTER, [
    TOKEN_MESSENGER_MINTER,
  ]);
  const tmmEventAuthority = pda('__event_authority', TOKEN_MESSENGER_MINTER);
  const mtEventAuthority = pda('__event_authority', MESSAGE_TRANSMITTER);
  const usedNonce = pda('used_nonce', MESSAGE_TRANSMITTER, [nonce]);
  const feeRecipientAta = getAssociatedTokenAddressSync(
    p.usdcMint,
    feeRecipient,
    true,
  );

  const data = concat(
    RECEIVE_MESSAGE,
    withLength(hexToBytes(p.messageHex)),
    withLength(hexToBytes(p.attestationHex)),
  );

  instructions.push(
    new TransactionInstruction({
      programId: MESSAGE_TRANSMITTER,
      keys: [
        meta(p.payer, true, true),
        meta(p.payer, false, true), // caller
        meta(authority),
        meta(messageTransmitter),
        meta(usedNonce, true),
        meta(TOKEN_MESSENGER_MINTER), // receiver
        meta(SystemProgram.programId),
        meta(mtEventAuthority),
        meta(MESSAGE_TRANSMITTER),
        // remaining accounts, in the order TokenMessengerMinter reads them
        meta(tokenMessenger),
        meta(remoteTokenMessenger),
        meta(tokenMinter, true),
        meta(localToken, true),
        meta(tokenPair),
        meta(feeRecipientAta, true),
        meta(userTokenAccount, true),
        meta(custody, true),
        meta(TOKEN_PROGRAM_ID),
        meta(tmmEventAuthority),
        meta(TOKEN_MESSENGER_MINTER),
      ],
      data: Buffer.from(data),
    }),
  );

  return {
    transaction: await toVersioned(
      p.connection,
      p.network,
      p.payer,
      instructions,
    ),
    signers: [],
  };
}

/** True when the message was already redeemed (its used-nonce account exists) */
export async function isSolanaNonceUsed(
  connection: Connection,
  nonceWord: string,
): Promise<boolean> {
  const usedNonce = pda('used_nonce', MESSAGE_TRANSMITTER, [
    hexToBytes(nonceWord),
  ]);
  return (await connection.getAccountInfo(usedNonce)) !== null;
}
