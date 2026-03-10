import { useRef, useState } from "react";
import { NETWORK_OPTIONS, NetworkOption } from "../model/networks";
import { Address, ActivityLevel, EIP1193Provider } from "../model/types";
import {
  WalletConnectProvider,
  loadViemRuntime,
  loadWalletConnectRuntime,
} from "../services/runtime";
import { ensureProviderChain, normalizeChainId } from "../services/wallet";
import { readErrorMessage } from "../utils/errors";
import { shortenAddress } from "../utils/format";

type UseWalletConnectionArgs = {
  appendActivity: (level: ActivityLevel, message: string) => void;
  onDisconnect?: () => void;
};

export function useWalletConnection(args: UseWalletConnectionArgs) {
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [walletProvider, setWalletProvider] =
    useState<EIP1193Provider | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const providerRef = useRef<WalletConnectProvider | null>(null);
  const listenersAttachedRef = useRef(false);
  const disconnectedByEventRef = useRef(false);

  const clearWalletState = () => {
    setWalletAddress(null);
    setWalletChainId(null);
    setWalletProvider(null);
  };

  const handleAccountsChanged = async (accountsValue: unknown) => {
    if (!Array.isArray(accountsValue) || accountsValue.length === 0) {
      clearWalletState();
      args.onDisconnect?.();
      args.appendActivity("info", "WalletConnect session has no active account.");
      return;
    }

    try {
      const viemRuntime = await loadViemRuntime();
      const nextAddress = viemRuntime.getAddress(String(accountsValue[0]));
      setWalletAddress(nextAddress);
      args.appendActivity(
        "info",
        `Active wallet account changed to ${shortenAddress(nextAddress)}.`,
      );
    } catch (error) {
      args.appendActivity(
        "error",
        `Failed to parse updated wallet account: ${readErrorMessage(error)}`,
      );
    }
  };

  const handleChainChanged = (chainValue: unknown) => {
    const parsedChainId = normalizeChainId(chainValue);

    if (parsedChainId === null) {
      args.appendActivity("error", "Received unsupported chain id from wallet.");
      return;
    }

    setWalletChainId(parsedChainId);
    args.appendActivity("info", `Wallet switched to chain ID ${parsedChainId}.`);
  };

  const handleDisconnect = () => {
    disconnectedByEventRef.current = true;
    clearWalletState();
    args.onDisconnect?.();
    args.appendActivity("info", "WalletConnect session disconnected.");
  };

  const attachProviderListeners = (provider: WalletConnectProvider) => {
    if (!provider.on || listenersAttachedRef.current) {
      return;
    }

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    provider.on("disconnect", handleDisconnect);

    listenersAttachedRef.current = true;
  };

  const initializeWalletConnectProvider = async () => {
    if (providerRef.current) {
      return providerRef.current;
    }

    const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim();

    if (!projectId) {
      throw new Error(
        "Missing WalletConnect Project ID. Set VITE_WALLETCONNECT_PROJECT_ID in your environment.",
      );
    }

    const optionalChains = NETWORK_OPTIONS.map((network) => network.chainId) as [
      number,
      ...number[],
    ];
    const rpcMap = Object.fromEntries(
      NETWORK_OPTIONS.map((network) => [network.chainId, network.rpcUrls[0]]),
    ) as Record<number, string>;

    const { EthereumProvider } = await loadWalletConnectRuntime();
    const provider = await EthereumProvider.init({
      projectId,
      optionalChains,
      showQrModal: true,
      rpcMap,
      metadata: {
        name: "SSV Assistant",
        description: "Desktop console for SSV validator keyshare registration",
        url: "https://tauri.localhost",
        icons: [],
      },
    });

    providerRef.current = provider;
    setWalletProvider(provider);
    attachProviderListeners(provider);

    return provider;
  };

  const connectWallet = async (network: NetworkOption) => {
    setConnectError(null);

    try {
      const viemRuntime = await loadViemRuntime();
      const provider = await initializeWalletConnectProvider();

      if (provider.connect) {
        await provider.connect({ optionalChains: [network.chainId] });
      } else if (provider.enable) {
        await provider.enable();
      }

      await ensureProviderChain(provider, network);

      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new Error("Wallet did not return an account.");
      }

      const connected = viemRuntime.getAddress(accounts[0]);
      setWalletAddress(connected);
      setWalletChainId(network.chainId);
      setWalletProvider(provider);

      args.appendActivity(
        "success",
        `Connected ${shortenAddress(connected)} via WalletConnect on ${network.label}.`,
      );
    } catch (error) {
      const message = readErrorMessage(error);
      setConnectError(message);
      args.appendActivity("error", message);
    }
  };

  const disconnectWallet = async () => {
    disconnectedByEventRef.current = false;
    const provider = providerRef.current;

    if (provider?.disconnect) {
      try {
        await provider.disconnect();
      } catch (error) {
        args.appendActivity(
          "error",
          `Failed to disconnect WalletConnect cleanly: ${readErrorMessage(error)}`,
        );
      }
    }

    if (!disconnectedByEventRef.current) {
      clearWalletState();
      args.onDisconnect?.();
      args.appendActivity("info", "Disconnected WalletConnect session.");
    }

    setConnectError(null);
  };

  const toggleWalletConnection = (network: NetworkOption) => {
    if (walletAddress) {
      void disconnectWallet();
      return;
    }

    void connectWallet(network);
  };

  return {
    walletAddress,
    walletChainId,
    walletProvider,
    connectError,
    setWalletChainId,
    connectWallet,
    disconnectWallet,
    toggleWalletConnection,
  };
}
