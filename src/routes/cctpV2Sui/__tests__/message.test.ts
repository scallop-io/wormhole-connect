import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  isZeroWord,
  nonceToU256,
  parseV2Message,
  toWord,
  wordEquals,
} from '../message';

import { buildV2Message } from './fixtures';

const word = (hexNo0x: string) => hexNo0x.padStart(64, '0');

describe('parseV2Message', () => {
  const msg = buildV2Message({
    src: 8,
    dst: 6,
    nonce: 'ab'.repeat(32),
    burnToken: 'd1',
    mintRecipient: 'c2',
    sender: 'e3',
    amount: 12_345_678n,
    maxFee: 5n,
    feeExecuted: 3n,
    expiration: 0n,
  });

  it('reads domains, amount and fee at Circle offsets', () => {
    const p = parseV2Message(msg);
    expect(p.sourceDomain).toBe(8);
    expect(p.destinationDomain).toBe(6);
    expect(p.amount).toBe(12_345_678n);
    expect(p.maxFee).toBe(5n);
    // the mint pays out amount - feeExecuted, so the UI must read this field
    expect(p.feeExecuted).toBe(3n);
    expect(p.mintRecipient).toBe(`0x${word('c2')}`);
  });

  it('keeps the 32-byte nonce intact (EVM usedNonces takes it as bytes32)', () => {
    expect(parseV2Message(msg).nonce).toBe(`0x${'ab'.repeat(32)}`);
    expect(nonceToU256(`0x${'00'.repeat(31)}07`)).toBe(7n);
  });

  it('rejects a V1-shaped or truncated message instead of misreading it', () => {
    expect(() => parseV2Message('0x1234')).toThrow(/too short/);
    const v1Version = `0x${'00000000'}${msg.slice(10)}`;
    expect(() => parseV2Message(v1Version)).toThrow(/version/);
  });
});

describe('address words', () => {
  it('left-pads a 20-byte EVM address to 32 bytes', () => {
    expect(toWord(`0x${'ab'.repeat(20)}`)).toBe(
      `0x${'0'.repeat(24)}${'ab'.repeat(20)}`,
    );
  });

  it('compares padded and unpadded forms of the same address', () => {
    expect(
      wordEquals(toWord(`0x${'ab'.repeat(20)}`), `0x${'AB'.repeat(20)}`),
    ).toBe(true);
    expect(
      wordEquals(toWord(`0x${'ab'.repeat(20)}`), `0x${'cd'.repeat(20)}`),
    ).toBe(false);
  });

  it('detects the zero destinationCaller (anyone may redeem)', () => {
    expect(isZeroWord(`0x${'0'.repeat(64)}`)).toBe(true);
    expect(isZeroWord(`0x${'0'.repeat(63)}1`)).toBe(false);
  });

  it('round-trips bytes and hex', () => {
    expect(bytesToHex(new Uint8Array([0, 255, 16]))).toBe('0x00ff10');
  });
});
