import { useRef, useState } from "react";
import { NETWORK_OPTIONS, NetworkOption } from "../model/networks";
import {
  Address,
  ActivityLevel,
  EIP1193Provider,
  WalletActionPrompt,
} from "../model/types";
import {
  WalletConnectProvider,
  loadViemRuntime,
  loadWalletConnectRuntime,
} from "../services/runtime";
import { normalizeChainId, verifyProviderSession } from "../services/wallet";
import { readErrorMessage } from "../utils/errors";
import { shortenAddress } from "../utils/format";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type UseWalletConnectionArgs = {
  appendActivity: (level: ActivityLevel, message: string) => void;
  onDisconnect?: () => void;
  setWalletActionPrompt?: (prompt: WalletActionPrompt | null) => void;
};

export function useWalletConnection(args: UseWalletConnectionArgs) {
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [walletProvider, setWalletProvider] =
    useState<EIP1193Provider | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [walletSessionVerified, setWalletSessionVerified] = useState(false);

  const providerRef = useRef<WalletConnectProvider | null>(null);
  const listenersAttachedRef = useRef(false);
  const disconnectedByEventRef = useRef(false);

  const clearWalletState = () => {
    setWalletAddress(null);
    setWalletChainId(null);
    setWalletProvider(null);
    setWalletSessionVerified(false);
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
      setWalletSessionVerified(true);
      args.appendActivity(
        "info",
        `Active wallet account changed to ${shortenAddress(nextAddress)}.`,
      );
    } catch (error) {
      setWalletSessionVerified(false);
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
      // With optionalChains, ethereum-provider negotiates tx/signing methods
      // from `optionalMethods` (not `methods`).
      methods: [
        "eth_accounts",
        "eth_requestAccounts",
      ],
      optionalMethods: [
        "eth_sendTransaction",
        "wallet_sendTransaction",
        "wallet_sendCalls",
        "wallet_getCapabilities",
        "personal_sign",
        "wallet_switchEthereumChain",
        "wallet_addEthereumChain",
      ],
      events: ["accountsChanged", "chainChanged"],
      optionalEvents: ["disconnect", "message", "connect"],
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
      args.setWalletActionPrompt?.({
        title: "Wallet approval required",
        message:
          "Approve the WalletConnect request in your wallet app on your phone.",
      });

      const viemRuntime = await loadViemRuntime();
      const provider = await initializeWalletConnectProvider();

      if (provider.enable) {
        await provider.enable();
      } else if (provider.connect) {
        await provider.connect();
      }

      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new Error("Wallet did not return an account.");
      }

      const connected = viemRuntime.getAddress(accounts[0]);
      const chainIdRaw = await provider.request({ method: "eth_chainId" });
      const parsedChainId = normalizeChainId(chainIdRaw);
      const { chainId: verifiedChainId } = await verifyProviderSession({
        provider,
        expectedAddress: connected,
      });
      const txMethods = new Set(
        Object.values(
          (
            provider as {
              session?: {
                namespaces?: Record<string, { methods?: string[] }>;
              };
            }
          ).session?.namespaces ?? {},
        ).flatMap((namespace) => namespace.methods ?? []),
      );
      const canSendTransactions =
        txMethods.has("eth_sendTransaction") ||
        txMethods.has("wallet_sendTransaction") ||
        txMethods.has("wallet_sendCalls");

      if (!canSendTransactions) {
        throw new Error(
          "Connected wallet session does not allow transaction methods (eth_sendTransaction/wallet_sendTransaction). Reconnect and approve transaction permissions, or use a different wallet.",
        );
      }

      setWalletAddress(connected);
      setWalletChainId(parsedChainId ?? verifiedChainId);
      setWalletProvider(provider);
      setWalletSessionVerified(true);

      args.appendActivity(
        "success",
        `Connected ${shortenAddress(connected)} via WalletConnect on ${network.label}. Session verified.`,
      );
      args.setWalletActionPrompt?.({
        title: "Wallet connected",
        message: "Session verified and ready for transaction requests.",
        state: "success",
      });
      await wait(700);

      if (parsedChainId !== null && parsedChainId !== network.chainId) {
        args.appendActivity(
          "info",
          `Wallet is currently on chain ${parsedChainId}. Target network is ${network.chainId}; network switch may be required before submitting transactions.`,
        );
      }
    } catch (error) {
      const message = readErrorMessage(error);
      const normalized = message.toLowerCase();
      const isRejectedMethods =
        normalized.includes("rejected methods") ||
        normalized.includes("rejected mehtods") ||
        normalized.includes("user_rejected_methods");

      const connectMessage = isRejectedMethods
        ? "Wallet rejected one or more requested methods during WalletConnect session setup. This usually means the wallet does not support the requested capabilities. Try reconnecting with a different wallet app or update MetaMask mobile."
        : message;

      setWalletSessionVerified(false);
      setConnectError(connectMessage);
      args.appendActivity("error", connectMessage);
    } finally {
      args.setWalletActionPrompt?.(null);
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
    args.setWalletActionPrompt?.(null);
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
    walletSessionVerified,
    connectError,
    setWalletChainId,
    connectWallet,
    disconnectWallet,
    toggleWalletConnection,
  };
}
