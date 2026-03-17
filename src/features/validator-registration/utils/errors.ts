import { shortenAddress } from "./format";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readErrorMessage(error: unknown): string {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function stripViemVerboseDetails(message: string): string {
  const markers = [
    "Request Arguments:",
    "Contract Call:",
    "Docs:",
    "Details:",
    "Version: viem@",
  ];

  const cutIndex = markers.reduce<number>((currentCut, marker) => {
    const markerIndex = message.indexOf(marker);

    if (markerIndex === -1) {
      return currentCut;
    }

    return currentCut === -1 ? markerIndex : Math.min(currentCut, markerIndex);
  }, -1);

  return (cutIndex === -1 ? message : message.slice(0, cutIndex))
    .trim()
    .replace(/\s+/g, " ");
}

function extractValidatorPublicKey(message: string): string | null {
  const match = message.match(
    /ValidatorAlreadyExistsWithData\(bytes publicKey\)\s*\((0x[a-fA-F0-9]+)\)/,
  );

  return match?.[1] ?? null;
}

export function formatRegistrationQueueError(error: unknown): string {
  const rawMessage = readErrorMessage(error);
  const cleanedMessage = stripViemVerboseDetails(rawMessage);

  if (cleanedMessage.includes("ValidatorAlreadyExistsWithData")) {
    const publicKey = extractValidatorPublicKey(cleanedMessage);
    const keySuffix = publicKey
      ? ` (${shortenAddress(publicKey)})`
      : "";

    return `A validator in this batch is already registered on SSV${keySuffix}. Remove already-registered validators from this run and try again.`;
  }

  if (
    cleanedMessage.includes(
      'The method "eth_sendTransaction" does not exist / is not available.',
    )
  ) {
    return "Your connected wallet/provider cannot submit transactions on this network. Reconnect the wallet and make sure WalletConnect is authorized for transaction signing.";
  }

  if (
    cleanedMessage.toLowerCase().includes("user rejected") ||
    cleanedMessage.toLowerCase().includes("user denied")
  ) {
    return "Transaction was rejected in wallet confirmation. No transaction was submitted.";
  }

  return cleanedMessage;
}
