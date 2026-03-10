import { NetworkOption } from "../model/networks";
import { EIP1193Provider, Eip1193RpcError } from "../model/types";

function chainIdToHex(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

function readErrorMessage(error: unknown): string {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const candidate = error as { message?: unknown };

    if (typeof candidate.message === "string") {
      return candidate.message;
    }
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export function getInjectedProvider(): EIP1193Provider | null {
  if (typeof window === "undefined") {
    return null;
  }

  const provider = (window as { ethereum?: EIP1193Provider }).ethereum;
  return provider ?? null;
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
      throw switchError;
    }

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
  }
}
