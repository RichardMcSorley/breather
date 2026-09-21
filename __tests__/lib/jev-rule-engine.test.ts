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
    expect(result.mileageMinimum).toBe(1.5);
  });

  it("uses one mileage floor for shopping workload", () => {
    const result = evaluateJevPolicy(
      {
        payBand: "12_to_14_99",
        milesBand: "5_to_5_99",
        pickups: "one",
        dropoffs: "one",
        itemsBand: "eleven_to_fifteen",
        orderKind: "shopping_order",
      },
      5,
      { pay: 12, miles: 8, pickups: 1, drops: 1, items: 12 },
    );

    expect(result.mileageMinimum).toBe(1.5);
  });

  it("uses confirmed pay and miles instead of rejecting a mixed band", () => {
    const result = evaluateJevPolicy(
      {
        payBand: "7_to_7_99",
        milesBand: "3_to_3_99",
        pickups: "one",
        dropoffs: "one",
        itemsBand: "zero",
        orderKind: "single_delivery",
      },
      7,
      { pay: 7.8, miles: 3.3, pickups: 1, drops: 1, items: 0 },
    );

    expect(result.decision).toBe("accept");
    expect(result.reason).toContain("clears");
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
