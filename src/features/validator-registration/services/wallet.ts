import { NetworkOption } from "../model/networks";
import { Address, EIP1193Provider, Eip1193RpcError } from "../model/types";
import { readErrorMessage } from "../utils/errors";

function chainIdToHex(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

export function normalizeChainId(chainId: unknown): number | null {
  if (typeof chainId === "number" && Number.isFinite(chainId)) {
    return chainId;
  }

  if (typeof chainId === "string") {
    const trimmed = chainId.trim();

    if (trimmed.length === 0) {
      return null;
    }

    const parsed = trimmed.startsWith("0x")
      ? Number.parseInt(trimmed, 16)
      : Number.parseInt(trimmed, 10);

    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

export async function verifyProviderSession(args: {
  provider: EIP1193Provider;
  expectedAddress?: Address;
}): Promise<{ accounts: Address[]; chainId: number }> {
  const accountsRaw = await args.provider.request({ method: "eth_accounts" });

  if (!Array.isArray(accountsRaw) || accountsRaw.length === 0) {
    throw new Error(
      "Wallet session is not active. Reconnect your wallet and approve account access.",
    );
  }

  const accounts = accountsRaw.map((value) => String(value)) as Address[];
  const chainIdRaw = await args.provider.request({ method: "eth_chainId" });
  const chainId = normalizeChainId(chainIdRaw);

  if (chainId === null) {
    throw new Error("Wallet returned an unsupported chain id.");
  }

  if (args.expectedAddress) {
    const expected = args.expectedAddress.toLowerCase();
    const hasExpected = accounts.some(
      (account) => account.toLowerCase() === expected,
    );

    if (!hasExpected) {
      throw new Error(
        "Connected wallet session account does not match the selected account. Reconnect your wallet.",
      );
    }
  }

  return {
    accounts,
    chainId,
  };
}

export async function ensureProviderChain(
  provider: EIP1193Provider,
  network: NetworkOption,
): Promise<void> {
  const targetChainIdHex = chainIdToHex(network.chainId);
  const currentChainIdRaw = await provider.request({
    method: "eth_chainId",
  });
  const currentChainId = normalizeChainId(currentChainIdRaw);

  if (currentChainId === network.chainId) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetChainIdHex }],
    });
  } catch (switchError) {
    const rpcError = switchError as Eip1193RpcError;
    const switchReadable = readErrorMessage(switchError);
    const switchMessage = switchReadable.toLowerCase();
    const unknownChain =
      rpcError.code === 4902 ||
      switchMessage.includes("unrecognized") ||
      switchMessage.includes("unknown chain") ||
      switchMessage.includes("4902");

    if (!unknownChain) {
      const rejectedMethods =
        switchMessage.includes("rejected methods") ||
        switchMessage.includes("rejected mehtods") ||
        switchMessage.includes("user_rejected_methods");

      if (rejectedMethods) {
        throw new Error(
          `The connected wallet did not approve chain-switch methods for this WalletConnect session. Please switch to ${network.label} in your wallet app manually, then reconnect.`,
        );
      }

      throw new Error(
        `Unable to switch wallet to ${network.label}. The connected wallet may not support this network. ${switchReadable}`,
      );
    }

    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: targetChainIdHex,
            chainName: network.chainName,
            nativeCurrency: network.nativeCurrency,
            rpcUrls: [...network.rpcUrls],
            blockExplorerUrls: network.explorerUrl ? [network.explorerUrl] : [],
          },
        ],
      });

      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainIdHex }],
      });
    } catch (addOrSwitchError) {
      const message = readErrorMessage(addOrSwitchError);
      throw new Error(
        `Unable to activate ${network.label} on the connected wallet. This wallet may not support custom/test networks. ${message}`,
      );
    }
  }
}
