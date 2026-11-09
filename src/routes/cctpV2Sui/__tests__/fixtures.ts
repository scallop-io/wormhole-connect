const word = (hexNo0x: string) => hexNo0x.padStart(64, '0');

// Builds a V2 burn message the way Circle lays it out (big-endian, 148B header)
export function buildV2Message(o: {
  src: number;
  dst: number;
  nonce: string;
  burnToken: string;
  mintRecipient: string;
  sender: string;
  amount: bigint;
  maxFee?: bigint;
  feeExecuted?: bigint;
  expiration?: bigint;
  destinationCaller?: string;
}): string {
  const u32 = (n: number) => n.toString(16).padStart(8, '0');
  const u256 = (n: bigint) => n.toString(16).padStart(64, '0');
  const hex =
    u32(1) +
    u32(o.src) +
    u32(o.dst) +
    word(o.nonce) +
    word(o.sender) + // header sender: TokenMessenger
    word(o.sender) + // header recipient: remote TokenMessenger
    word(o.destinationCaller ?? '0') +
    u32(2000) +
    u32(2000) +
    // body
    u32(1) +
    word(o.burnToken) +
    word(o.mintRecipient) +
    u256(o.amount) +
    word(o.sender) + // messageSender
    u256(o.maxFee ?? 0n) +
    u256(o.feeExecuted ?? 0n) +
    u256(o.expiration ?? 0n);
  return `0x${hex}`;
}
