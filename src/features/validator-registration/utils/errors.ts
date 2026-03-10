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
