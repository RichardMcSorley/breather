import { describe, expect, it } from "vitest";
import { evaluateJevPolicy } from "@/lib/jev-rule-engine";

describe("evaluateJevPolicy", () => {
  it("explains why strong offers should be taken", () => {
    const result = evaluateJevPolicy(
      {
        payBand: "12_to_14_99",
        milesBand: "4_to_4_99",
        pickups: "one",
        dropoffs: "one",
        itemsBand: "zero",
        orderKind: "single_delivery",
      },
      5,
    );

    expect(result.decision).toBe("accept");
    expect(result.reason).toContain("clears");
    expect(result.requiredPayMaximum).toBe(5);
  });

  it("explains why weak offers should be passed", () => {
    const result = evaluateJevPolicy(
      {
        payBand: "under_4",
        milesBand: "20_plus",
        pickups: "one",
        dropoffs: "one",
        itemsBand: "zero",
        orderKind: "single_delivery",
      },
      5,
    );

    expect(result.decision).toBe("decline");
    expect(result.reason).toContain("Pass:");
  });
});
