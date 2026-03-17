export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function shortenPublicKey(publicKey: string): string {
  if (publicKey.length <= 24) {
    return publicKey;
  }

  return `${publicKey.slice(0, 12)}...${publicKey.slice(-10)}`;
}
