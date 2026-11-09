import { GrpcWebFetchTransport, SuiGrpcClient } from '@mysten/sui/grpc';
import { SuiPlatform } from '@wormhole-foundation/sdk-sui';
import type {
  MethodInfo,
  RpcOptions,
  UnaryCall,
} from '@protobuf-ts/runtime-rpc';

// The SDK builds a new Sui gRPC client on every getRpc() call and caches
// nothing, so the same bridge objects get re-read many times. Here we reuse one
// client per endpoint and share identical read requests.

// Reads of on-chain objects: shared in flight, then kept briefly
const CACHED_METHODS = new Set(['BatchGetObjects', 'GetObject', 'GetCoinInfo']);
// Reads of data that changes often: shared only while in flight
const IN_FLIGHT_ONLY_METHODS = new Set(['ListBalances', 'ListOwnedObjects']);
const CACHE_TTL_MS = 5_000;

type Entry = { call: UnaryCall<any, any>; expires: number };

export class SharedReadTransport extends GrpcWebFetchTransport {
  private entries = new Map<string, Entry>();

  override unary<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    input: I,
    options: RpcOptions,
  ): UnaryCall<I, O> {
    const cached = CACHED_METHODS.has(method.name);
    if (
      !(cached || IN_FLIGHT_ONLY_METHODS.has(method.name)) ||
      options?.abort
    ) {
      return super.unary(method, input, options);
    }

    const key = `${method.name}:${Array.from(method.I.toBinary(input)).join(
      ',',
    )}`;
    const hit = this.entries.get(key);
    if (hit && hit.expires > Date.now()) {
      return hit.call as UnaryCall<I, O>;
    }

    const entry: Entry = {
      call: super.unary(method, input, options),
      expires: Infinity,
    };
    this.entries.set(key, entry);
    entry.call.then(
      () => {
        if (cached) {
          entry.expires = Date.now() + CACHE_TTL_MS;
        } else {
          this.entries.delete(key);
        }
      },
      () => this.entries.delete(key),
    );
    return entry.call as UnaryCall<I, O>;
  }
}

const clients = new Map<string, SuiGrpcClient>();

SuiPlatform.prototype.getRpc = function (this: any, chain: string) {
  const chainConfig = this.config[chain];
  if (!chainConfig) {
    throw new Error('No configuration available for chain: ' + chain);
  }
  const network = this.network.toLowerCase();
  const key = `${network}|${chainConfig.rpc}|${JSON.stringify(
    chainConfig.httpHeaders ?? {},
  )}`;

  let client = clients.get(key);
  if (!client) {
    client = new SuiGrpcClient({
      network,
      transport: new SharedReadTransport({
        baseUrl: chainConfig.rpc,
        meta: chainConfig.httpHeaders,
      }),
    });
    clients.set(key, client);
  }
  return client;
} as any;
