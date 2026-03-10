import { NetworkOption } from "../model/networks";
import { EIP1193Provider, Eip1193RpcError } from "../model/types";
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

export async function ensureProviderChain(
  provider: EIP1193Provider,
  network: NetworkOption,
): Promise<void> {
  const targetChainIdHex = chainIdToHex(network.chainId);
  const currentChainIdHex = (await provider.request({
    method: "eth_chainId",
  })) as string;

  if (currentChainIdHex.toLowerCase() === targetChainIdHex.toLowerCase()) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetChainIdHex }],
    });
  } catch (switchError) {
    const rpcError = switchError as Eip1193RpcError;
    const switchMessage = readErrorMessage(switchError).toLowerCase();
    const unknownChain =
      rpcError.code === 4902 ||
      switchMessage.includes("unrecognized") ||
      switchMessage.includes("unknown chain") ||
      switchMessage.includes("4902");

    if (!unknownChain) {
      const message = readErrorMessage(switchError);
      throw new Error(
        `Unable to switch wallet to ${network.label}. The connected wallet may not support this network. ${message}`,
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
