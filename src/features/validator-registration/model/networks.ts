export const NETWORK_OPTIONS = [
  {
    value: "mainnet",
    label: "Ethereum Mainnet",
    chainKey: "mainnet",
    chainId: 1,
    chainName: "Ethereum Mainnet",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: ["https://eth.merkle.io"],
    explorerUrl: "https://etherscan.io",
  },
  {
    value: "hoodi",
    label: "Hoodi",
    chainKey: "hoodi",
    chainId: 560048,
    chainName: "Hoodi",
    nativeCurrency: {
      name: "Hoodi Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: ["https://rpc.hoodi.ethpandaops.io"],
    explorerUrl: "https://hoodi.etherscan.io",
  },
] as const;

export type NetworkValue = (typeof NETWORK_OPTIONS)[number]["value"];
export type NetworkOption = (typeof NETWORK_OPTIONS)[number];

export function getNetworkOption(network: NetworkValue): NetworkOption {
  return NETWORK_OPTIONS.find((option) => option.value === network)!;
}

export function getTxExplorerUrl(
  network: NetworkOption,
  txHash: `0x${string}`,
): string | null {
  return network.explorerUrl ? `${network.explorerUrl}/tx/${txHash}` : null;
}
