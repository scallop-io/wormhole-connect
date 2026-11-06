import type { SDKClient } from '@lifi/sdk';

let lifiClient: SDKClient | undefined;

export function setLiFiClient(client: SDKClient): void {
  lifiClient = client;
}

export function getLiFiClient(): SDKClient {
  if (!lifiClient) {
    throw new Error('LiFi client not initialized');
  }
  return lifiClient;
}
