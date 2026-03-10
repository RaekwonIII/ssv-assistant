import { FileParseReport, KeystoreEntry } from "../model/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEip2335Keystore(value: Record<string, unknown>): boolean {
  const cryptoObject = value.crypto ?? value.Crypto;
  const hasVersion =
    typeof value.version === "number" || typeof value.version === "string";

  return Boolean(
    hasVersion && typeof value.uuid === "string" && isRecord(cryptoObject),
  );
}

function extractKeystoreCandidates(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (isRecord(value) && Array.isArray(value.keystores)) {
    return value.keystores.filter(isRecord);
  }

  if (isRecord(value)) {
    return [value];
  }

  return [];
}

function readErrorMessage(error: unknown): string {
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

export async function parseKeystoreFiles(
  files: File[],
): Promise<{
  entries: KeystoreEntry[];
  reports: FileParseReport[];
}> {
  const entries: KeystoreEntry[] = [];
  const reports: FileParseReport[] = [];

  for (const file of files) {
    const report: FileParseReport = {
      fileName: file.name,
      entryCount: 0,
      errors: [],
    };

    try {
      const text = await file.text();
      const parsedJson = JSON.parse(text) as unknown;
      const candidates = extractKeystoreCandidates(parsedJson);

      if (candidates.length === 0) {
        report.errors.push("No keystore entries found in this file.");
      }

      candidates.forEach((candidate, candidateIndex) => {
        if (!isEip2335Keystore(candidate)) {
          report.errors.push(
            `Entry ${candidateIndex + 1} is missing EIP-2335 fields (uuid/version/crypto).`,
          );
          return;
        }

        const pubkeyField = candidate.pubkey;
        const pubkey =
          typeof pubkeyField === "string"
            ? pubkeyField.startsWith("0x")
              ? pubkeyField
              : `0x${pubkeyField}`
            : undefined;

        entries.push({
          id: `${file.name}-${candidateIndex}-${entries.length}`,
          fileName: file.name,
          serialized: JSON.stringify(candidate),
          pubkey,
        });

        report.entryCount += 1;
      });
    } catch (error) {
      report.errors.push(readErrorMessage(error));
    }

    reports.push(report);
  }

  return {
    entries,
    reports,
  };
}
