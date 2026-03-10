import {
  Address,
  EIP1193Provider,
  RuntimeChain,
  RuntimeSdk,
} from "../model/types";

type ViemRuntime = {
  getAddress: (value: string) => Address;
  createPublicClient: (args: { chain: RuntimeChain; transport: unknown }) => unknown;
  createWalletClient: (args: {
    account: Address;
    chain: RuntimeChain;
    transport: unknown;
  }) => unknown;
  custom: (provider: EIP1193Provider) => unknown;
  http: (url?: string) => unknown;
  parseEther: (value: string) => bigint;
};

export type SSVRuntime = {
  SSVSDK: new (args: {
    publicClient: unknown;
    walletClient: unknown;
    extendedConfig?: {
      subgraph?: {
        endpoint?: string;
        apiKey?: string;
      };
    };
  }) => RuntimeSdk;
  chains: {
    mainnet: RuntimeChain;
    hoodi: RuntimeChain;
  };
};

export type WalletConnectProvider = EIP1193Provider;

type WalletConnectRuntime = {
  EthereumProvider: {
    init: (args: {
      projectId: string;
      optionalChains: [number, ...number[]];
      showQrModal: boolean;
      methods?: string[];
      optionalMethods?: string[];
      events?: string[];
      optionalEvents?: string[];
      rpcMap?: Record<number, string>;
      metadata?: {
        name: string;
        description: string;
        url: string;
        icons: string[];
      };
    }) => Promise<WalletConnectProvider>;
  };
};

let viemRuntimePromise: Promise<ViemRuntime> | null = null;
let ssvRuntimePromise: Promise<SSVRuntime> | null = null;
let walletConnectRuntimePromise: Promise<WalletConnectRuntime> | null = null;

export async function loadViemRuntime(): Promise<ViemRuntime> {
  if (!viemRuntimePromise) {
    viemRuntimePromise = import("viem").then((module) => ({
      getAddress: module.getAddress as (value: string) => Address,
      createPublicClient: module.createPublicClient as ViemRuntime["createPublicClient"],
      createWalletClient: module.createWalletClient as ViemRuntime["createWalletClient"],
      custom: module.custom as ViemRuntime["custom"],
      http: module.http as ViemRuntime["http"],
      parseEther: module.parseEther as ViemRuntime["parseEther"],
    }));
  }

  return viemRuntimePromise;
}

export async function loadSSVRuntime(): Promise<SSVRuntime> {
  if (!ssvRuntimePromise) {
    ssvRuntimePromise = import("@ssv-labs/ssv-sdk").then((module) => ({
      SSVSDK: module.SSVSDK as SSVRuntime["SSVSDK"],
      chains: module.chains as SSVRuntime["chains"],
    }));
  }

  return ssvRuntimePromise;
}

export async function loadWalletConnectRuntime(): Promise<WalletConnectRuntime> {
  if (!walletConnectRuntimePromise) {
    walletConnectRuntimePromise = import("@walletconnect/ethereum-provider").then(
      (module) => ({
        EthereumProvider:
          module.EthereumProvider as unknown as WalletConnectRuntime["EthereumProvider"],
      }),
    );
  }

  return walletConnectRuntimePromise;
}
