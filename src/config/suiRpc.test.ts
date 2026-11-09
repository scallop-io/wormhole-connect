import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GrpcWebFetchTransport } from '@mysten/sui/grpc';
import { SharedReadTransport } from './suiRpc';

const fakeMethod = (name: string) =>
  ({
    name,
    I: { toBinary: (i: { id: string }) => new TextEncoder().encode(i.id) },
  } as any);

// Stand-in for a protobuf-ts UnaryCall: only `then` is used by the wrapper
const fakeCall = () => {
  const p = Promise.resolve({ response: {} });
  return p as any;
};

describe('SharedReadTransport', () => {
  let upstream: any;
  let transport: SharedReadTransport;

  beforeEach(() => {
    vi.useFakeTimers();
    upstream = vi
      .spyOn(GrpcWebFetchTransport.prototype, 'unary')
      .mockImplementation(() => fakeCall());
    transport = new SharedReadTransport({ baseUrl: 'http://localhost' });
  });

  afterEach(() => {
    vi.useRealTimers();
    upstream.mockRestore();
  });

  it('shares one request between identical object reads', async () => {
    const m = fakeMethod('BatchGetObjects');
    const a = transport.unary(m, { id: 'x' } as any, {} as any);
    const b = transport.unary(m, { id: 'x' } as any, {} as any);
    await a;
    expect(a).toBe(b);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('does not share reads of different objects', () => {
    const m = fakeMethod('BatchGetObjects');
    transport.unary(m, { id: 'x' } as any, {} as any);
    transport.unary(m, { id: 'y' } as any, {} as any);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('refetches objects after the short cache expires', async () => {
    const m = fakeMethod('BatchGetObjects');
    await transport.unary(m, { id: 'x' } as any, {} as any);
    await vi.advanceTimersByTimeAsync(6_000);
    transport.unary(m, { id: 'x' } as any, {} as any);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('never serves balances from cache once the request finished', async () => {
    // Stale balances would show wrong amounts after a transfer
    const m = fakeMethod('ListBalances');
    const a = transport.unary(m, { id: 'x' } as any, {} as any);
    const b = transport.unary(m, { id: 'x' } as any, {} as any);
    expect(a).toBe(b);
    await a;
    await Promise.resolve();
    transport.unary(m, { id: 'x' } as any, {} as any);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('never shares transaction execution', () => {
    const m = fakeMethod('ExecuteTransaction');
    transport.unary(m, { id: 'x' } as any, {} as any);
    transport.unary(m, { id: 'x' } as any, {} as any);
    expect(upstream).toHaveBeenCalledTimes(2);
  });
});
