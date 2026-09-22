export type RegexOrderKind =
  | "single_delivery"
  | "delivery_batch"
  | "shopping_order"
  | "shopping_batch";

export type MerchantCategory =
  | "restaurant"
  | "fast_food"
  | "grocery_store"
  | "retail_store"
  | "pharmacy"
  | "home_improvement"
  | "pet_store"
  | "gas_station"
  | "coffee_shop"
  | "convenience_store"
  | "unknown_merchant";

export interface RegexOfferCandidates {
  pay?: number;
  miles?: number;
  pickups?: number;
  drops?: number;
  orderCount?: number;
  items?: number;
  orderKind?: RegexOrderKind;
  merchants: string[];
  evidence: {
    pay?: string;
    miles?: string;
    pickups?: string;
    drops?: string;
    orderCount?: string;
    items?: string;
    orderKind?: string;
    merchants?: string;
  };
}

const NUMBER = `(\\d+(?:\\.\\d{1,2})?)`;
const PAY_LABEL =
  /(?:guaranteed|includes expected tip|delivery pay\s*\+\s*tip)/i;
const CONTROL_LINE =
  /^(?:accept|decline|reject|route|red card|customer dropoff|customer verification|match|may need returns|items can be added|delivery pay|guaranteed|includes expected tip)$/i;

const merchantAliases: Record<string, string> = {
  "chick-fil-a": "Chick-fil-A",
  "chick il a": "Chick-fil-A",
  mcdonalds: "McDonald's",
  "mcdonald's": "McDonald's",
  "taco bell": "Taco Bell",
  "dollar general": "Dollar General",
  "wendy's": "Wendy's",
  wendys: "Wendy's",
  kroger: "Kroger",
  cvs: "CVS",
  "cvs pharmacy": "CVS",
  "home depot": "Home Depot",
  "home depot wv other metro": "Home Depot",
  petsmart: "PetSmart",
  "pet smart": "PetSmart",
  walmart: "Walmart",
  aldi: "ALDI",
  speedway: "Speedway",
  walgreens: "Walgreens",
  starbucks: "Starbucks",
  panera: "Panera Bread",
  "panera bread": "Panera Bread",
  "pizza hut": "Pizza Hut",
  "little caesars": "Little Caesars",
  "burger king": "Burger King",
  "outback steakhouse": "Outback Steakhouse",
  "olive garden": "Olive Garden",
  "the human bean": "The Human Bean",
  "tropical smoothie cafe": "Tropical Smoothie Cafe",
  "penn station": "Penn Station",
  "bob evans": "Bob Evans",
  "moe's southwest grill": "Moe's Southwest Grill",
};

export const KNOWN_MERCHANTS = [...new Set(Object.values(merchantAliases))];

const canonicalMerchant = (value: string) => {
  const cleaned = value
    .replace(/[®™]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*\([^)]*\)$/, "")
    .trim();
  const lower = cleaned.toLowerCase();
  const exact = merchantAliases[lower];
  if (exact) return exact;

  const prefix = Object.keys(merchantAliases)
    .sort((a, b) => b.length - a.length)
    .find((alias) => lower.startsWith(`${alias} `));
  return prefix ? merchantAliases[prefix] : cleaned;
};

const linesOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[•·|]+|[•·|]+$/g, "").trim())
    .filter(Boolean);

const numberFrom = (match: RegExpMatchArray | null) =>
  match ? Number(match[1]) : undefined;

const extractPay = (text: string) => {
  const candidates: Array<{ value: number; score: number; evidence: string }> =
    [];
  const patterns = [
    {
      score: 10,
      pattern: new RegExp(`\\bfor\\s+\\$\\s*${NUMBER}`, "i"),
    },
    {
      score: 10,
      pattern: new RegExp(`\\bdelivery\\s*[•·:]\\s*\\$\\s*${NUMBER}`, "i"),
    },
    {
      score: 9,
      pattern: new RegExp(`\\$\\s*${NUMBER}\\s*(?=${PAY_LABEL.source})`, "i"),
    },
    {
      score: 1,
      pattern: new RegExp(`\\$\\s*${NUMBER}(?!\\s*/\\s*mi)`, "i"),
    },
  ];

  for (const { pattern, score } of patterns) {
    const match = text.match(pattern);
    const value = numberFrom(match);
    if (value !== undefined && value > 0 && value <= 500) {
      candidates.push({ value, score, evidence: match?.[0] ?? "" });
    }
  }

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  return best;
};

const extractMiles = (text: string, appName?: string) => {
  const candidates: Array<{ value: number; score: number; evidence: string }> =
    [];
  const addMatches = (pattern: RegExp, score: number) => {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        candidates.push({ value, score, evidence: match[0] });
      }
    }
  };

  if (appName === "Roadie") {
    addMatches(
      new RegExp(`${NUMBER}\\s*mi\\s*\\(\\s*${NUMBER}\\s*min`, "gi"),
      12,
    );
  }

  addMatches(new RegExp(`${NUMBER}\\s*mi\\s*\\)\\s*total`, "gi"), 12);
  addMatches(
    new RegExp(
      `${NUMBER}\\s*[|,\\n]+\\s*\\d+(?:\\.\\d+)?\\s*[|,\\n]+\\s*miles\\b`,
      "gi",
    ),
    10,
  );
  addMatches(new RegExp(`${NUMBER}\\s*(?:mi|miles)\\b`, "gi"), 1);

  const payMarker = text.search(PAY_LABEL);
  if (payMarker >= 0) {
    const afterPay = candidates.filter((candidate) => {
      const position = text.indexOf(candidate.evidence, payMarker);
      return position >= payMarker && position <= payMarker + 220;
    });
    if (afterPay.length > 0) {
      return afterPay.sort((a, b) => b.score - a.score)[0];
    }
  }

  return candidates.sort((a, b) => b.score - a.score)[0];
};

const extractItems = (text: string) => {
  const matches = [
    ...text.matchAll(/total\s+items?\s*[:\n|•-]*\s*(\d+)/gi),
    ...text.matchAll(/(?<![\d.$])(\d+)\s+items?\b/gi),
  ];
  const values = matches
    .map((match) => ({ value: Number(match[1]), evidence: match[0] }))
    .filter(
      ({ value }) => Number.isInteger(value) && value >= 0 && value <= 200,
    );

  if (values.length === 0) return undefined;
  return {
    value: values.reduce((total, item) => total + item.value, 0),
    evidence: values.map((item) => item.evidence).join("; "),
  };
};

const extractDrops = (text: string, appName?: string) => {
  const values: Array<{ value: number; evidence: string }> = [];
  const add = (pattern: RegExp) => {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isInteger(value) && value > 0 && value <= 50) {
        values.push({ value, evidence: match[0] });
      }
    }
  };

  add(new RegExp(`(?:delivery|package)\\s*\\(\\s*${NUMBER}\\s*\\)`, "gi"));
  const customerDropoffs = [...text.matchAll(/customer\s+dropoff/gi)].length;
  const pickupLabels = [...text.matchAll(/\b(?:pickup|retail\s+pickup)\b/gi)]
    .length;
  const hasTotalStopLabels = customerDropoffs > 0 && pickupLabels > 0;
  const dasherStops =
    /(?:dasher|doordash)/i.test(appName ?? "") || hasTotalStopLabels;
  if (!dasherStops) {
    add(
      new RegExp(
        `(?<![\\d.$])${NUMBER}\\s+(?:deliver(?:y|ies)|orders?|bundles?|stops?)\\b`,
        "gi",
      ),
    );
  } else {
    for (const match of text.matchAll(/(?<![\d.$])(\d+)\s+stops?\b/gi)) {
      const stops = Number(match[1]);
      if (Number.isInteger(stops) && stops > 0 && stops <= 50) {
        values.push({
          value: Math.max(1, stops - 1),
          evidence: `${match[0]} interpreted as ${Math.max(1, stops - 1)} dropoff`,
        });
      }
    }
  }
  add(new RegExp(`(?<![\\d.$])${NUMBER}\\s+shop\\s+and\\s+deliver\\b`, "gi"));
  add(/(?<![\\d.$])(\d+)\s*[|,\n]+\s*miles?\s*[|,\n]*\s*orders?\b/gi);

  if (customerDropoffs > 0) {
    values.push({
      value: customerDropoffs,
      evidence: `${customerDropoffs} customer dropoff labels`,
    });
  }

  const best = values.sort((a, b) => b.value - a.value)[0];
  return best ?? { value: 1, evidence: "default single drop" };
};

const extractPickups = (text: string) => {
  const payPosition = text.search(/\$\s*\d/);
  const offerText = (payPosition >= 0 ? text.slice(payPosition) : text).split(
    /\baccept\b/i,
  )[0];
  const count = [...offerText.matchAll(/^\s*pickup\s*$/gim)].length;
  return {
    value: count || 1,
    evidence: count ? `${count} pickup labels` : "default single pickup",
  };
};

const extractOrderCount = (text: string) => {
  const match = text.match(/drop\s*off\s+(\d+)\s+orders?/i);
  return match
    ? { value: Math.max(1, Number(match[1])), evidence: match[0] }
    : { value: 1, evidence: "default single order" };
};

const extractStopCounts = (text: string) => {
  const totalMatch = text.match(/(?<![\d.])(\d+)\s+stops?\s*\(/i);
  const dropoffMatch = text.match(
    /multiple\s+dropoffs?\s*\(\s*(\d+)\s+stops?\s*\)/i,
  );
  return {
    totalStops: totalMatch ? Number(totalMatch[1]) : undefined,
    dropoffStops: dropoffMatch ? Number(dropoffMatch[1]) : undefined,
  };
};

const extractMerchants = (text: string) => {
  const lines = linesOf(text);
  const merchants: string[] = [];
  const add = (value: string) => {
    const cleaned = canonicalMerchant(
      value.replace(/\s*\([^)]*(?:item|order|unit|delivery|stop)[^)]*\)/gi, ""),
    );
    if (
      cleaned &&
      cleaned.length <= 80 &&
      !CONTROL_LINE.test(cleaned) &&
      !/^\$|^\d|^(?:mi|miles|deliver|pickup|drop|food delivery|shop for)/i.test(
        cleaned,
      ) &&
      !/\b(?:street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|highway|hwy)\b/i.test(
        cleaned,
      )
    ) {
      merchants.push(cleaned);
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^(?:pickup|retail pickup|food delivery)$/i.test(line)) {
      for (const nextLine of lines.slice(index + 1, index + 3)) {
        if (/^(?:customer|accept|decline|red card|route|\$|\d)/i.test(nextLine))
          break;
        add(nextLine);
      }
    }
    if (/shop\s*(?:for\s*items|and\s*deliver)|shop\s*&\s*deliver/i.test(line)) {
      if (lines[index + 1]) add(lines[index + 1]);
    }
    if (/\btotal$/i.test(line) && lines[index + 1]) add(lines[index + 1]);
  }

  for (const knownMerchant of KNOWN_MERCHANTS) {
    if (text.toLowerCase().includes(knownMerchant.toLowerCase())) {
      merchants.push(knownMerchant);
    }
  }

  return [...new Set(merchants)].slice(0, 6);
};

export function extractRegexOfferCandidates(text: string, appName?: string) {
  const pay = extractPay(text);
  const miles = extractMiles(text, appName);
  const items = extractItems(text);
  const drops = extractDrops(text, appName);
  const pickups = extractPickups(text);
  const merchants = extractMerchants(text);
  const orderCount = extractOrderCount(text);
  const stopCounts = extractStopCounts(text);
  const payPosition = text.search(/\$\s*\d/);
  const offerText = payPosition >= 0 ? text.slice(payPosition) : text;
  const dropoffPosition = offerText.search(/customer\s+dropoff/i);
  const beforeDropoff =
    dropoffPosition >= 0 ? offerText.slice(0, dropoffPosition) : offerText;
  const knownPickupCount = KNOWN_MERCHANTS.filter((merchant) =>
    beforeDropoff.toLowerCase().includes(merchant.toLowerCase()),
  ).length;
  const customerDropoffCount = [...text.matchAll(/customer\s+dropoff/gi)].length;
  const dropValue =
    stopCounts.dropoffStops ??
    (customerDropoffCount > 0 ? customerDropoffCount : drops.value);
  const pickupFromStops =
    stopCounts.totalStops !== undefined && stopCounts.dropoffStops !== undefined
      ? Math.max(1, stopCounts.totalStops - stopCounts.dropoffStops)
      : 0;
  const pickupValue = Math.max(pickups.value, knownPickupCount, pickupFromStops);
  const resolvedPickups = {
    value: pickupValue,
    evidence:
      knownPickupCount > 1
        ? `${pickupValue} pickup merchants before customer dropoff`
        : pickups.evidence,
  };
  const resolvedDrops = {
    value: dropValue,
    evidence:
      stopCounts.dropoffStops !== undefined
        ? `${stopCounts.dropoffStops} explicit dropoff stops`
        : customerDropoffCount > 0
        ? `${customerDropoffCount} customer dropoff labels`
        : drops.evidence,
  };
  const shopping =
    items !== undefined ||
    /shop\s*(?:for\s*items|and\s*deliver)|shop\s*&\s*deliver|red\s*card|retail pickup/i.test(
      text,
    );
  const batch =
    orderCount.value > 1 || resolvedPickups.value > 1 || resolvedDrops.value > 1;
  const orderKind: RegexOrderKind = shopping
    ? batch
      ? "shopping_batch"
      : "shopping_order"
    : batch
      ? "delivery_batch"
      : "single_delivery";

  return {
    pay: pay?.value,
    miles: miles?.value,
    pickups: resolvedPickups.value,
    drops: resolvedDrops.value,
    orderCount: orderCount.value,
    items: items?.value,
    orderKind,
    merchants,
    evidence: {
      pay: pay?.evidence,
      miles: miles?.evidence,
      pickups: resolvedPickups.evidence,
      drops: resolvedDrops.evidence,
      orderCount: orderCount.evidence,
      items: items?.evidence,
      orderKind: orderKind,
      merchants: merchants.join("; "),
    },
  } satisfies RegexOfferCandidates;
}
