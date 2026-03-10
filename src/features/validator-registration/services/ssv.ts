import { NetworkOption } from "../model/networks";
import {
  Address,
  EIP1193Provider,
  OperatorDetails,
  RuntimeChain,
  RuntimeSdk,
  SdkContext,
} from "../model/types";
import { loadSSVRuntime, loadViemRuntime } from "./runtime";
import { ensureProviderChain } from "./wallet";

function getRuntimeChain(runtimeChains: {
  mainnet: RuntimeChain;
  hoodi: RuntimeChain;
}, network: NetworkOption): RuntimeChain {
  return network.chainKey === "mainnet" ? runtimeChains.mainnet : runtimeChains.hoodi;
}

export async function buildSdkContext(args: {
  walletAddress: Address;
  provider: EIP1193Provider;
  network: NetworkOption;
  subgraphEndpoint?: string;
  subgraphApiKey?: string;
}): Promise<SdkContext> {
  const [viemRuntime, ssvRuntime] = await Promise.all([
    loadViemRuntime(),
    loadSSVRuntime(),
  ]);

  await ensureProviderChain(args.provider, args.network);

  const chain = getRuntimeChain(ssvRuntime.chains, args.network);

  const walletClient = viemRuntime.createWalletClient({
    account: args.walletAddress,
    chain,
    transport: viemRuntime.custom(args.provider),
  });

  const publicClient = viemRuntime.createPublicClient({
    chain,
    transport: viemRuntime.http(chain.rpcUrls.default.http[0]),
  });

  const hasSubgraphConfig = Boolean(args.subgraphApiKey || args.subgraphEndpoint);

  const sdk = new ssvRuntime.SSVSDK({
    publicClient: publicClient as never,
    walletClient: walletClient as never,
    extendedConfig: hasSubgraphConfig
      ? {
          subgraph: {
            endpoint: args.subgraphEndpoint,
            apiKey: args.subgraphApiKey,
          },
        }
      : undefined,
  }) as RuntimeSdk;

  return {
    sdk,
    chain,
  };
}

export function getPrivateOperatorAccessReport(args: {
  operators: OperatorDetails[];
  walletAddress: Address;
}): {
  blockedOperatorIds: string[];
  privateOperatorIds: string[];
} {
  const normalizedWallet = args.walletAddress.toLowerCase();
  const privateOperators = args.operators.filter((operator) => operator.isPrivate);
  const privateOperatorIds = privateOperators.map((operator) => operator.id);
  const blockedOperatorIds = privateOperators
    .filter((operator) => {
      const whitelist = Array.isArray(operator.whitelisted)
        ? operator.whitelisted
        : [];

      return !whitelist.some(
        (address) => address.toLowerCase() === normalizedWallet,
      );
    })
    .map((operator) => operator.id);

  return {
    privateOperatorIds,
    blockedOperatorIds,
  };
}
