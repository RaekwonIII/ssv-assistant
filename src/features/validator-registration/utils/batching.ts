import { Batch } from "../model/types";

export function createBatchPlan(totalKeys: number, maxPerBatch: number): Batch[] {
  if (totalKeys <= 0 || maxPerBatch <= 0) {
    return [];
  }

  const batches: Batch[] = [];
  let remaining = totalKeys;
  let consumed = 0;

  while (remaining > 0) {
    const size = Math.min(remaining, maxPerBatch);
    const start = consumed + 1;
    const end = consumed + size;

    batches.push({
      id: batches.length + 1,
      start,
      end,
      size,
      status: batches.length === 0 ? "ready" : "queued",
    });

    consumed += size;
    remaining -= size;
  }

  return batches;
}

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    return [];
  }

  const result: T[][] = [];

  for (let start = 0; start < items.length; start += chunkSize) {
    result.push(items.slice(start, start + chunkSize));
  }

  return result;
}
