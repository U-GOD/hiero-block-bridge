import type { NetworkName } from '../types/config.js';

/**
 * Mirror Node REST API base URLs for each Hedera network.
 */
const MIRROR_NODE_URLS: Record<NetworkName, string> = {
  mainnet: 'https://mainnet.mirrornode.hedera.com',
  testnet: 'https://testnet.mirrornode.hedera.com',
  previewnet: 'https://previewnet.mirrornode.hedera.com',
  local: 'http://localhost:5551',
};

/**
 * Resolves the Mirror Node URL for a given network.
 *
 * @param network - The target network.
 * @param customUrl - Optional custom URL override.
 * @returns The resolved Mirror Node base URL.
 */
export function resolveMirrorNodeUrl(network: NetworkName, customUrl?: string): string {
  return customUrl ?? MIRROR_NODE_URLS[network];
}

/**
 * Resolves operator credentials from config or environment variables.
 *
 * @param operatorId - Explicit operator ID (overrides env var).
 * @param operatorKey - Explicit operator key (overrides env var).
 * @returns Resolved credentials or undefined if not available.
 */
export function resolveOperator(
  operatorId?: string,
  operatorKey?: string,
): { accountId: string; privateKey: string } | undefined {
  const accountId = operatorId ?? process.env.HEDERA_ACCOUNT_ID;
  const privateKey = operatorKey ?? process.env.HEDERA_PRIVATE_KEY;

  if (accountId && privateKey) {
    return { accountId, privateKey };
  }

  return undefined;
}

/**
 * Returns the Hedera network identifier string expected by the SDK.
 *
 * @param network - The NetworkName enum value.
 * @returns The SDK-compatible network string.
 */
export function resolveNetworkForSdk(network: NetworkName): string {
  const mapping: Record<NetworkName, string> = {
    mainnet: 'mainnet',
    testnet: 'testnet',
    previewnet: 'previewnet',
    local: 'local-node',
  };
  return mapping[network];
}
