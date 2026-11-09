// @vitest-environment node
import { Keypair, PublicKey } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { describe, expect, it } from 'vitest';
import { SOLANA_V2 } from '../consts';
import { bytesToHex } from '../message';
import {
  buildSolanaBurn,
  buildSolanaReceive,
  isSolanaNonceUsed,
} from '../solana';
import { buildV2Message } from './fixtures';

const MT = new PublicKey(SOLANA_V2.messageTransmitter);
const TMM = new PublicKey(SOLANA_V2.tokenMessengerMinter);
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const enc = (s: string) => new TextEncoder().encode(s);
const find = (seeds: (string | Uint8Array)[], program: PublicKey) =>
  PublicKey.findProgramAddressSync(
    seeds.map((s) => (typeof s === 'string' ? enc(s) : s)),
    program,
  )[0];

// Fake RPC: only what the builders call
const rpc = (accounts: Record<string, Uint8Array | null> = {}) =>
  ({
    getLatestBlockhash: async () => ({
      blockhash: '11111111111111111111111111111111',
    }),
    getAddressLookupTable: async () => ({ value: null }),
    getAccountInfo: async (k: PublicKey) => {
      const d = accounts[k.toBase58()];
      return d ? { data: Buffer.from(d) } : null;
    },
  } as unknown as Connection);

describe('buildSolanaBurn', () => {
  const owner = Keypair.generate().publicKey;
  const suiRecipient = new Uint8Array(32).fill(7);

  const build = () =>
    buildSolanaBurn({
      connection: rpc(),
      network: 'Mainnet',
      owner,
      usdcMint: USDC,
      amount: 1_000_000n,
      destinationDomain: 8,
      mintRecipient: suiRecipient,
      maxFee: 5n,
      minFinalityThreshold: 2000,
    });

  it('encodes the instruction like Circle (discriminator, LE ints, zero caller)', async () => {
    const { transaction } = await build();
    const ix = transaction.message.compiledInstructions[0];
    const d = Buffer.from(ix.data);
    expect([...d.subarray(0, 8)]).toEqual([215, 60, 61, 46, 114, 55, 128, 176]);
    expect(d.readBigUInt64LE(8)).toBe(1_000_000n);
    expect(d.readUInt32LE(16)).toBe(8);
    expect([...d.subarray(20, 52)]).toEqual([...suiRecipient]);
    // destinationCaller zero: anyone can claim (also what resume relies on)
    expect([...d.subarray(52, 84)]).toEqual(new Array(32).fill(0));
    expect(d.readBigUInt64LE(84)).toBe(5n);
    expect(d.readUInt32LE(92)).toBe(2000);
  });

  it('passes 18 accounts and the event account co-signs', async () => {
    const { transaction, signers } = await build();
    const keys = transaction.message.staticAccountKeys;
    const ix = transaction.message.compiledInstructions[0];
    expect(ix.accountKeyIndexes).toHaveLength(18);
    expect(signers).toHaveLength(1);
    // the fresh event account is account #12, a signer, not the wallet
    const eventKey = keys[ix.accountKeyIndexes[11]];
    expect(eventKey.equals(signers[0].publicKey)).toBe(true);
    expect(eventKey.equals(owner)).toBe(false);
  });

  it('derives the remote token messenger from the domain as a decimal string', async () => {
    const { transaction } = await build();
    const keys = transaction.message.staticAccountKeys;
    const ix = transaction.message.compiledInstructions[0];
    const remote = keys[ix.accountKeyIndexes[7]];
    // Circle's program seeds with the text "8"; a u32 seed gives a different address
    expect(remote.equals(find(['remote_token_messenger', '8'], TMM))).toBe(
      true,
    );
    const asU32 = find(
      ['remote_token_messenger', new Uint8Array([8, 0, 0, 0])],
      TMM,
    );
    expect(remote.equals(asU32)).toBe(false);
  });
});

describe('buildSolanaReceive', () => {
  const payer = Keypair.generate().publicKey;
  const payerAta = getAssociatedTokenAddressSync(USDC, payer);
  const nonce = 'ab'.repeat(32);
  const feeRecipient = Keypair.generate().publicKey;
  const tmmState = find(['token_messenger'], TMM);
  // TokenMessenger account with the fee recipient at offset 109
  const tmmData = new Uint8Array(200);
  tmmData.set(feeRecipient.toBytes(), 8 + 32 + 32 + 32 + 4 + 1);

  const message = (recipient: PublicKey) =>
    buildV2Message({
      src: 8,
      dst: 5,
      nonce,
      burnToken: 'cd',
      mintRecipient: bytesToHex(recipient.toBytes()).slice(2),
      sender: 'ee',
      amount: 249_999n,
    });

  const build = (recipient: PublicKey, existing: PublicKey[]) =>
    buildSolanaReceive({
      connection: rpc({
        [tmmState.toBase58()]: tmmData,
        ...Object.fromEntries(
          existing.map((k) => [k.toBase58(), new Uint8Array(165)]),
        ),
      }),
      network: 'Mainnet',
      payer,
      usdcMint: USDC,
      messageHex: message(recipient),
      attestationHex: `0x${'99'.repeat(65)}`,
    });

  it('mints to the message recipient account, in Circle account order', async () => {
    const { transaction } = await build(payerAta, [payerAta]);
    const keys = transaction.message.staticAccountKeys;
    const ixs = transaction.message.compiledInstructions;
    expect(ixs).toHaveLength(1); // account exists: no create instruction
    const k = (i: number) => keys[ixs[0].accountKeyIndexes[i]];

    expect(ixs[0].accountKeyIndexes).toHaveLength(20); // 9 fixed + 11 remaining
    // used-nonce PDA carries the 32-byte nonce: this is what stops double redeem
    expect(
      k(4).equals(find(['used_nonce', new Uint8Array(32).fill(0xab)], MT)),
    ).toBe(true);
    // fee recipient account must come before the receiver token account
    expect(
      k(14).equals(getAssociatedTokenAddressSync(USDC, feeRecipient, true)),
    ).toBe(true);
    expect(k(15).equals(payerAta)).toBe(true);
  });

  it('creates the token account when it is the claimer’s own and missing', async () => {
    const { transaction } = await build(payerAta, []);
    expect(transaction.message.compiledInstructions).toHaveLength(2);
  });

  it('refuses to claim into someone else’s missing token account', async () => {
    const other = getAssociatedTokenAddressSync(
      USDC,
      Keypair.generate().publicKey,
    );
    await expect(build(other, [])).rejects.toThrow(/does not exist/);
  });
});

describe('isSolanaNonceUsed', () => {
  it('reads the used-nonce account', async () => {
    const nonce = `0x${'ab'.repeat(32)}`;
    const used = find(['used_nonce', new Uint8Array(32).fill(0xab)], MT);
    expect(
      await isSolanaNonceUsed(
        rpc({ [used.toBase58()]: new Uint8Array(1) }),
        nonce,
      ),
    ).toBe(true);
    expect(await isSolanaNonceUsed(rpc(), nonce)).toBe(false);
  });
});
