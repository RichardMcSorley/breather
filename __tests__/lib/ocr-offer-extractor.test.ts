import { describe, expect, it } from "vitest";
import { extractRegexOfferCandidates } from "@/lib/ocr-offer-extractor";
import { resolveRegexOfferCandidates } from "@/lib/ocr-offer-resolution";

describe("extractRegexOfferCandidates", () => {
  it("extracts Dasher batch pay, miles, drops, and merchants", () => {
    const result = extractRegexOfferCandidates(
      `$11.50 Guaranteed (incl. tips)\n11.0 mi\nPickup\nTaco Bell\nPickup\nMcDonald's\nCustomer dropoff\nCustomer dropoff`,
      "Dasher",
    );

    expect(result).toMatchObject({
      pay: 11.5,
      miles: 11,
      pickups: 2,
      drops: 2,
      orderKind: "delivery_batch",
      merchants: ["Taco Bell", "McDonald's"],
    });
  });

  it("treats DoorDash total stops as pickup plus dropoffs", () => {
    const result = extractRegexOfferCandidates(
      `$7.80 Guaranteed (incl. tips)\n4.3 mi\n18 min\nPickup\nOutback Steakhouse\nCustomer dropoff\n(2 stops)`,
      "Photos",
    );

    expect(result).toMatchObject({
      pay: 7.8,
      miles: 4.3,
      pickups: 1,
      drops: 1,
      orderKind: "single_delivery",
    });
  });

  it("handles GH multiline distance without treating pay cents as order count", () => {
    const result = extractRegexOfferCandidates(
      `Steak 'n Shake & Jimmy John's\n$12.33\nDelivery pay + tip\n9.2\n2\nmiles\norders`,
      "GH Drivers",
    );

    expect(result.pay).toBe(12.33);
    expect(result.miles).toBe(9.2);
    expect(result.drops).toBe(2);
  });

  it("extracts Roadie total items instead of weight or heaviest-item values", () => {
    const result = extractRegexOfferCandidates(
      `HOME DEPOT\n$17.54\n28 mi (1hr 6min) • 2 Deliveries\nITEM SUMMARY\nTotal Items\n2\nTotal Weight\n15lbs\nHeaviest Item\n8lbs`,
      "Roadie",
    );

    expect(result).toMatchObject({
      pay: 17.54,
      miles: 28,
      drops: 2,
      items: 2,
      orderKind: "shopping_batch",
      merchants: ["Home Depot"],
    });
  });
});

describe("resolveRegexOfferCandidates", () => {
  const classification = {
    payBand: "8_to_8_99",
    milesBand: "8_to_8_99",
    pickups: "one",
    dropoffs: "one",
    itemsBand: "zero",
    orderKind: "single_delivery",
  };

  it("uses confirmed regex values even when Jev band has a conflict", () => {
    const resolved = resolveRegexOfferCandidates(
      {
        pay: 3.4,
        miles: 8.4,
        pickups: 1,
        drops: 1,
        merchants: ["McDonald's"],
        evidence: {},
      },
      {
        pay_candidate: { type: "choice", choice: "confirmed" },
        miles_candidate: { type: "choice", choice: "confirmed" },
        pickups_candidate: { type: "choice", choice: "confirmed" },
        drops_candidate: { type: "choice", choice: "confirmed" },
        merchant_candidates: { type: "choice", choice: "confirmed" },
        merchant_category: { type: "choice", choice: "fast_food" },
      },
      classification,
    );

    expect(resolved.pay).toBe(3.4);
    expect(resolved.miles).toBe(8.4);
    expect(resolved.payEstimated).toBe(false);
  });

  it("uses conservative Jev fallback values when regex is rejected", () => {
    const resolved = resolveRegexOfferCandidates(
      {
        pay: 3.4,
        miles: 8.4,
        pickups: 1,
        drops: 1,
        merchants: [],
        evidence: {},
      },
      {
        pay_candidate: { type: "choice", choice: "rejected" },
        miles_candidate: { type: "choice", choice: "uncertain" },
        merchant_candidates: { type: "choice", choice: "not_present" },
        merchant_category: { type: "choice", choice: "grocery_store" },
      },
      classification,
    );

    expect(resolved.pay).toBe(8);
    expect(resolved.miles).toBe(8.99);
    expect(resolved.payEstimated).toBe(true);
    expect(resolved.milesEstimated).toBe(true);
    expect(resolved.merchants).toEqual(["Grocery store"]);
  });
});
