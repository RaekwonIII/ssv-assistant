import { describe, expect, it } from "vitest";
import { chunkArray, createBatchPlan } from "./batching";

describe("createBatchPlan", () => {
  it("splits validator keys into sequential batches", () => {
    const batches = createBatchPlan(165, 80);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toMatchObject({
      id: 1,
      start: 1,
      end: 80,
      size: 80,
      status: "ready",
    });
    expect(batches[1]).toMatchObject({
      id: 2,
      start: 81,
      end: 160,
      size: 80,
      status: "queued",
    });
    expect(batches[2]).toMatchObject({
      id: 3,
      start: 161,
      end: 165,
      size: 5,
      status: "queued",
    });
  });

  it("returns empty for invalid inputs", () => {
    expect(createBatchPlan(0, 80)).toEqual([]);
    expect(createBatchPlan(10, 0)).toEqual([]);
  });
});

describe("chunkArray", () => {
  it("chunks arrays by fixed chunk size", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns empty for non-positive chunk size", () => {
    expect(chunkArray([1, 2, 3], 0)).toEqual([]);
  });
});
