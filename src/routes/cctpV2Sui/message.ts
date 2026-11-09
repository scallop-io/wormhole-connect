// CCTP V2 message layout (all big-endian), see circlefin/sui-cctp messageV2.ts
//  header:  version u32 | srcDomain u32 | dstDomain u32 | nonce 32 | sender 32 |
//           recipient 32 | destinationCaller 32 | minFinality u32 | finalityExecuted u32
//  body:    version u32 | burnToken 32 | mintRecipient 32 | amount u256 |
//           messageSender 32 | maxFee u256 | feeExecuted u256 | expirationBlock u256 | hookData

export const hexToBytes = (hex: string): Uint8Array => {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || /[^0-9a-fA-F]/.test(h)) {
    throw new Error('Invalid hex string');
  }
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

export const bytesToHex = (bytes: Uint8Array): string =>
  `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;

export interface CctpV2Message {
  sourceDomain: number;
  destinationDomain: number;
  /** 32-byte nonce, 0x-prefixed hex */
  nonce: string;
  destinationCaller: string;
  burnToken: string;
  mintRecipient: string;
  amount: bigint;
  messageSender: string;
  maxFee: bigint;
  feeExecuted: bigint;
  expirationBlock: bigint;
}

const HEADER_LEN = 148;
const BODY_MIN_LEN = 228;

const u32 = (b: Uint8Array, o: number) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o, false);

const u256 = (b: Uint8Array, o: number) =>
  BigInt(bytesToHex(b.slice(o, o + 32)));

const word = (b: Uint8Array, o: number) => bytesToHex(b.slice(o, o + 32));

export const parseV2Message = (hex: string): CctpV2Message => {
  const b = hexToBytes(hex);
  if (b.length < HEADER_LEN + BODY_MIN_LEN) {
    throw new Error('CCTP V2 message too short');
  }
  if (u32(b, 0) !== 1) throw new Error('Unsupported CCTP message version');
  const o = HEADER_LEN;
  return {
    sourceDomain: u32(b, 4),
    destinationDomain: u32(b, 8),
    nonce: word(b, 12),
    destinationCaller: word(b, 108),
    burnToken: word(b, o + 4),
    mintRecipient: word(b, o + 36),
    amount: u256(b, o + 68),
    messageSender: word(b, o + 100),
    maxFee: u256(b, o + 132),
    feeExecuted: u256(b, o + 164),
    expirationBlock: u256(b, o + 196),
  };
};

/** Left-pads a 0x address (20 or 32 bytes) to a 32-byte 0x word */
export const toWord = (address: string): string => {
  const h = address.startsWith('0x') ? address.slice(2) : address;
  if (h.length > 64) throw new Error('Address longer than 32 bytes');
  return `0x${h.padStart(64, '0')}`;
};

export const isZeroWord = (w: string): boolean => /^0x0+$/.test(w);

/** True when the word is the given address (compares as left-padded 32 bytes) */
export const wordEquals = (w: string, address: string): boolean =>
  w.toLowerCase() === toWord(address).toLowerCase();

/** Nonce as u256 for Sui's `is_nonce_used` */
export const nonceToU256 = (nonceWord: string): bigint => BigInt(nonceWord);
