export const DEFAULT_OPERATOR_INPUTS = ["5", "6", "7", "8"];

export const ALLOWED_OPERATOR_COUNTS = [4, 7, 10, 13] as const;

export const MAX_OPERATOR_COUNT = 13;

const BATCH_LIMITS: Record<number, number> = {
  4: 80,
  7: 40,
  10: 30,
  13: 20,
};

export type OperatorSelectionValidation = {
  parsedIds: number[];
  invalidIndexes: number[];
  duplicateIds: number[];
  hasAllowedCount: boolean;
  isValid: boolean;
  warning: string | null;
};

function parseOperatorId(value: string): number | null {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function validateOperatorInputs(
  operatorInputs: string[],
): OperatorSelectionValidation {
  const parsed: number[] = [];
  const invalidIndexes: number[] = [];
  const seenIds = new Map<number, number>();
  const duplicateIds = new Set<number>();

  operatorInputs.forEach((raw, index) => {
    const parsedId = parseOperatorId(raw);

    if (parsedId === null) {
      invalidIndexes.push(index);
      return;
    }

    if (seenIds.has(parsedId)) {
      duplicateIds.add(parsedId);
    }

    seenIds.set(parsedId, index);
    parsed.push(parsedId);
  });

  const hasAllowedCount = ALLOWED_OPERATOR_COUNTS.includes(
    operatorInputs.length as (typeof ALLOWED_OPERATOR_COUNTS)[number],
  );

  let warning: string | null = null;

  if (!hasAllowedCount) {
    warning = `Current operator set size is ${operatorInputs.length}. Choose 4, 7, 10, or 13 operators.`;
  } else if (invalidIndexes.length > 0) {
    warning = "All operator IDs must be positive integers.";
  } else if (duplicateIds.size > 0) {
    warning = `Duplicate operator IDs are not allowed: ${[...duplicateIds].join(", ")}.`;
  }

  return {
    parsedIds: parsed,
    invalidIndexes,
    duplicateIds: [...duplicateIds],
    hasAllowedCount,
    isValid:
      hasAllowedCount &&
      invalidIndexes.length === 0 &&
      duplicateIds.size === 0 &&
      parsed.length === operatorInputs.length,
    warning,
  };
}

export function getBatchLimitForOperatorCount(operatorCount: number): number {
  return BATCH_LIMITS[operatorCount] ?? 0;
}
