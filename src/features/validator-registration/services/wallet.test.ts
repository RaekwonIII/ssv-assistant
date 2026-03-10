import { describe, expect, it, vi } from "vitest";
import { NETWORK_OPTIONS } from "../model/networks";
import { EIP1193Provider } from "../model/types";
import { ensureProviderChain, normalizeChainId } from "./wallet";

const mainnet = NETWORK_OPTIONS[0];

describe("normalizeChainId", () => {
  it("parses decimal and hex chain IDs", () => {
    expect(normalizeChainId(1)).toBe(1);
    expect(normalizeChainId("1")).toBe(1);
    expect(normalizeChainId("0x1")).toBe(1);
  });

  it("returns null for invalid values", () => {
    expect(normalizeChainId("")).toBeNull();
    expect(normalizeChainId("abc")).toBeNull();
    expect(normalizeChainId(null)).toBeNull();
  });
});

describe("ensureProviderChain", () => {
  it("does nothing when chain already matches", async () => {
    const request = vi.fn().mockResolvedValue("0x1");
    const provider: EIP1193Provider = { request };

    await ensureProviderChain(provider, mainnet);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ method: "eth_chainId" });
  });

  it("switches chain directly when supported", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce("0x2")
      .mockResolvedValueOnce(undefined);
    const provider: EIP1193Provider = { request };

    await ensureProviderChain(provider, mainnet);

    expect(request).toHaveBeenNthCalledWith(2, {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1" }],
    });
  });

  it("adds chain when wallet reports unknown chain", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce("0x2")
      .mockRejectedValueOnce({ code: 4902, message: "Unknown chain" })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const provider: EIP1193Provider = { request };

    await ensureProviderChain(provider, mainnet);

    expect(request).toHaveBeenCalledWith({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x1",
          chainName: mainnet.chainName,
          nativeCurrency: mainnet.nativeCurrency,
          rpcUrls: [...mainnet.rpcUrls],
          blockExplorerUrls: [mainnet.explorerUrl],
        },
      ],
    });
  });

  it("throws helpful message when switch fails unexpectedly", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce("0x2")
      .mockRejectedValueOnce(new Error("user rejected"));
    const provider: EIP1193Provider = { request };

    await expect(ensureProviderChain(provider, mainnet)).rejects.toThrow(
      "Unable to switch wallet",
    );
  });
});
