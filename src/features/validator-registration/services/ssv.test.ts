import { describe, expect, it } from "vitest";
import { getPrivateOperatorAccessReport } from "./ssv";

describe("getPrivateOperatorAccessReport", () => {
  it("returns blocked private operators when wallet is not whitelisted", () => {
    const report = getPrivateOperatorAccessReport({
      walletAddress: "0x1111111111111111111111111111111111111111",
      operators: [
        {
          id: "5",
          publicKey: "pk-5",
          validatorCount: "0",
          isPrivate: false,
          whitelisted: [],
        },
        {
          id: "6",
          publicKey: "pk-6",
          validatorCount: "0",
          isPrivate: true,
          whitelisted: ["0x2222222222222222222222222222222222222222"],
        },
        {
          id: "7",
          publicKey: "pk-7",
          validatorCount: "0",
          isPrivate: true,
          whitelisted: ["0x1111111111111111111111111111111111111111"],
        },
      ],
    });

    expect(report.privateOperatorIds).toEqual(["6", "7"]);
    expect(report.blockedOperatorIds).toEqual(["6"]);
  });

  it("matches whitelist entries case-insensitively", () => {
    const report = getPrivateOperatorAccessReport({
      walletAddress: "0xAbCd000000000000000000000000000000000000",
      operators: [
        {
          id: "8",
          publicKey: "pk-8",
          validatorCount: "0",
          isPrivate: true,
          whitelisted: ["0xabcd000000000000000000000000000000000000"],
        },
      ],
    });

    expect(report.privateOperatorIds).toEqual(["8"]);
    expect(report.blockedOperatorIds).toEqual([]);
  });

  it("returns empty arrays when no private operators exist", () => {
    const report = getPrivateOperatorAccessReport({
      walletAddress: "0x1111111111111111111111111111111111111111",
      operators: [
        {
          id: "5",
          publicKey: "pk-5",
          validatorCount: "0",
          isPrivate: false,
          whitelisted: [],
        },
      ],
    });

    expect(report.privateOperatorIds).toEqual([]);
    expect(report.blockedOperatorIds).toEqual([]);
  });
});
