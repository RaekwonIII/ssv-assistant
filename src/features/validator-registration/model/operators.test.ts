import { describe, expect, it } from "vitest";
import {
  getBatchLimitForOperatorCount,
  validateOperatorInputs,
} from "./operators";

describe("validateOperatorInputs", () => {
  it("accepts a valid 4-operator set", () => {
    const result = validateOperatorInputs(["5", "6", "7", "8"]);

    expect(result.isValid).toBe(true);
    expect(result.hasAllowedCount).toBe(true);
    expect(result.parsedIds).toEqual([5, 6, 7, 8]);
    expect(result.warning).toBeNull();
  });

  it("rejects unsupported operator count", () => {
    const result = validateOperatorInputs(["1", "2", "3", "4", "5"]);

    expect(result.isValid).toBe(false);
    expect(result.hasAllowedCount).toBe(false);
    expect(result.warning).toContain("Choose 4, 7, 10, or 13 operators");
  });

  it("rejects invalid operator IDs", () => {
    const result = validateOperatorInputs(["5", "abc", "0", "8"]);

    expect(result.isValid).toBe(false);
    expect(result.invalidIndexes).toEqual([1, 2]);
    expect(result.warning).toBe("All operator IDs must be positive integers.");
  });

  it("rejects duplicate operator IDs", () => {
    const result = validateOperatorInputs(["5", "6", "6", "8"]);

    expect(result.isValid).toBe(false);
    expect(result.duplicateIds).toEqual([6]);
    expect(result.warning).toContain("Duplicate operator IDs are not allowed");
  });
});

describe("getBatchLimitForOperatorCount", () => {
  it("returns the expected limits", () => {
    expect(getBatchLimitForOperatorCount(4)).toBe(80);
    expect(getBatchLimitForOperatorCount(7)).toBe(40);
    expect(getBatchLimitForOperatorCount(10)).toBe(30);
    expect(getBatchLimitForOperatorCount(13)).toBe(20);
  });

  it("returns 0 for unsupported counts", () => {
    expect(getBatchLimitForOperatorCount(6)).toBe(0);
  });
});
