/**
 * Built-in knowledge for the prospecting agent: how an ICP industry maps to
 * OpenStreetMap business tags, and which words signal that industry on a web
 * page. The LLM planner can extend this per search; without an LLM the agent
 * uses this table alone.
 */

export interface OsmTag {
  key: string;
  value: string;
}

/** OSM keys the agent may query (anything else from a planner is dropped). */
export const OSM_ALLOWED_KEYS = [
  "office",
  "shop",
  "amenity",
  "craft",
  "tourism",
  "leisure",
  "healthcare",
] as const;

interface CategoryRule {
  match: RegExp;
  tags: OsmTag[];
  keywords: string[];
}

const t = (key: string, value: string): OsmTag => ({ key, value });

const RULES: CategoryRule[] = [
  {
    match: /real ?estate|realt|propert|estate agen|housing|apartment|broker/i,
    tags: [t("office", "estate_agent"), t("office", "property_management")],
    keywords: [
      "real estate",
      "property",
      "properties",
      "realty",
      "apartments",
      "listings",
      "rent",
      "sale",
    ],
  },
  {
    match: /developer|construction|contractor|builder|engineering/i,
    tags: [t("office", "construction_company"), t("craft", "builder"), t("office", "engineer")],
    keywords: ["construction", "contractor", "building", "engineering", "projects"],
  },
  {
    match: /software|saas|\bit\b|tech|digital|web|app development/i,
    tags: [t("office", "it"), t("office", "company"), t("office", "telecommunication")],
    keywords: ["software", "technology", "digital", "web", "app", "development", "it services"],
  },
  {
    match: /marketing|advertis|agency|media|design|branding/i,
    tags: [
      t("office", "advertising_agency"),
      t("office", "graphic_design"),
      t("office", "company"),
    ],
    keywords: ["marketing", "advertising", "agency", "branding", "design", "media"],
  },
  {
    match: /law|legal|attorney/i,
    tags: [t("office", "lawyer"), t("office", "notary")],
    keywords: ["law", "legal", "lawyer", "attorney", "firm"],
  },
  {
    match: /account|audit|tax|bookkeep|finance|financial/i,
    tags: [t("office", "accountant"), t("office", "financial"), t("office", "tax_advisor")],
    keywords: ["accounting", "audit", "tax", "finance", "advisory"],
  },
  {
    match: /insurance/i,
    tags: [t("office", "insurance")],
    keywords: ["insurance", "policy", "coverage"],
  },
  {
    match: /bank/i,
    tags: [t("amenity", "bank")],
    keywords: ["bank", "banking"],
  },
  {
    match: /restaurant|food|cafe|catering|hospitality/i,
    tags: [t("amenity", "restaurant"), t("amenity", "cafe"), t("amenity", "fast_food")],
    keywords: ["restaurant", "menu", "food", "cafe", "dining"],
  },
  {
    match: /hotel|travel|tourism/i,
    tags: [t("tourism", "hotel"), t("shop", "travel_agency"), t("tourism", "guest_house")],
    keywords: ["hotel", "travel", "tour", "booking", "rooms"],
  },
  {
    match: /dental|dentist/i,
    tags: [t("amenity", "dentist"), t("healthcare", "dentist")],
    keywords: ["dental", "dentist", "clinic", "teeth"],
  },
  {
    // Generic healthcare — unless a more specific specialty (dental) already matched.
    match: /^(?!.*dent).*(clinic|health|medical|hospital|doctor|pharma)/i,
    tags: [
      t("amenity", "clinic"),
      t("amenity", "doctors"),
      t("healthcare", "clinic"),
      t("amenity", "pharmacy"),
    ],
    keywords: ["clinic", "medical", "health", "doctor", "patients", "care"],
  },
  {
    match: /school|education|training|academy|university/i,
    tags: [
      t("amenity", "school"),
      t("amenity", "college"),
      t("amenity", "language_school"),
      t("office", "educational_institution"),
    ],
    keywords: ["school", "education", "students", "courses", "training", "academy"],
  },
  {
    match: /gym|fitness|sport/i,
    tags: [t("leisure", "fitness_centre"), t("leisure", "sports_centre")],
    keywords: ["gym", "fitness", "training", "membership", "classes"],
  },
  {
    match: /beauty|salon|spa|cosmetic/i,
    tags: [t("shop", "beauty"), t("shop", "hairdresser"), t("leisure", "spa")],
    keywords: ["beauty", "salon", "spa", "hair", "nails"],
  },
  {
    match: /car|auto|vehicle|motor/i,
    tags: [t("shop", "car"), t("shop", "car_repair"), t("amenity", "car_rental")],
    keywords: ["cars", "auto", "vehicles", "dealer", "service"],
  },
  {
    match: /retail|shop|store|e-?commerce|fashion|clothing/i,
    tags: [t("shop", "clothes"), t("shop", "department_store"), t("shop", "boutique")],
    keywords: ["shop", "store", "products", "collection", "buy"],
  },
  {
    match: /furniture|interior/i,
    tags: [t("shop", "furniture"), t("shop", "interior_decoration")],
    keywords: ["furniture", "interior", "decor", "design"],
  },
  {
    match: /logistic|shipping|freight|transport|courier/i,
    tags: [t("office", "logistics"), t("office", "moving_company"), t("amenity", "post_office")],
    keywords: ["logistics", "shipping", "freight", "delivery", "transport"],
  },
  {
    match: /consult/i,
    tags: [t("office", "consulting"), t("office", "company")],
    keywords: ["consulting", "advisory", "strategy", "consultants"],
  },
  {
    match: /ngo|non-?profit|charity|association/i,
    tags: [t("office", "ngo"), t("office", "association"), t("office", "charity")],
    keywords: ["ngo", "non-profit", "association", "charity", "mission"],
  },
];

/**
 * Words that appear in business *names* (English, French, Arabic), for finding
 * businesses mapped without a specific category (e.g. office=company "X Realty").
 */
const NAME_WORDS: Array<[RegExp, string[]]> = [
  [
    /real ?estate|realt|propert|estate agen|housing|apartment|broker/i,
    ["real estate", "realty", "properties", "immobilier", "immobilière", "عقار"],
  ],
  [
    /developer|construction|contractor|builder/i,
    ["construction", "contracting", "builders", "developers", "مقاولات"],
  ],
  [
    /software|saas|\bit\b|tech|digital|web|app development/i,
    ["software", "technologies", "digital", "solutions", "systems", "تكنولوجيا"],
  ],
  [
    /marketing|advertis|agency|media|branding/i,
    ["marketing", "advertising", "media", "creative", "communication", "إعلان"],
  ],
  [/law|legal|attorney/i, ["law firm", "lawyers", "attorneys", "avocats", "legal", "محاماة"]],
  [/account|audit|tax|bookkeep/i, ["accounting", "audit", "accountants", "comptab", "محاسبة"]],
  [/insurance/i, ["insurance", "assurance", "تأمين"]],
  [/bank/i, ["bank", "banque", "بنك", "مصرف"]],
  [/restaurant|food|cafe|catering/i, ["restaurant", "café", "cafe", "catering", "مطعم"]],
  [/hotel|travel|tourism/i, ["hotel", "hôtel", "travel", "tours", "voyages", "فندق"]],
  [/dental|dentist/i, ["dental", "dentaire", "أسنان"]],
  [
    /^(?!.*dent).*(clinic|health|medical|hospital|doctor)/i,
    ["clinic", "medical", "clinique", "hospital", "عيادة", "مستشفى"],
  ],
  [/school|education|training|academy/i, ["school", "academy", "école", "institute", "مدرسة"]],
  [/gym|fitness/i, ["gym", "fitness"]],
  [/beauty|salon|spa|cosmetic/i, ["beauty", "salon", "spa", "صالون"]],
  [/car|auto|vehicle|motor/i, ["motors", "cars", "automotive", "سيارات"]],
  [/furniture|interior/i, ["furniture", "meubles", "interiors", "مفروشات"]],
  [
    /logistic|shipping|freight|transport|courier/i,
    ["logistics", "shipping", "freight", "cargo", "شحن"],
  ],
  [/consult/i, ["consulting", "consultants", "advisory", "conseil"]],
];

/** Plain words safe to put in an Overpass regex (letters, digits, spaces, hyphens, apostrophes). */
export function cleanNameWord(word: string): string | null {
  const cleaned = word
    .replace(/[^\p{L}\p{N}\s'-]/gu, "")
    .trim()
    .toLowerCase();
  return cleaned.length >= 3 ? cleaned.slice(0, 40) : null;
}

/** Name words for the given industries (built-in table, deduplicated). */
export function nameWordsFor(industries: string[]): string[] {
  const words = new Set<string>();
  for (const industry of industries)
    for (const [match, list] of NAME_WORDS)
      if (match.test(industry)) list.forEach((w) => words.add(w));
  return [...words];
}

/** OSM tags and page keywords for the given industries (deduplicated, in rule order). */
export function categoriesFor(industries: string[]): { tags: OsmTag[]; keywords: string[] } {
  const tags = new Map<string, OsmTag>();
  const keywords = new Set<string>();
  for (const industry of industries) {
    let matched = false;
    for (const rule of RULES) {
      if (!rule.match.test(industry)) continue;
      matched = true;
      for (const tag of rule.tags) tags.set(`${tag.key}=${tag.value}`, tag);
      for (const k of rule.keywords) keywords.add(k);
    }
    // Unknown industries still contribute their own words as page keywords.
    for (const word of industry.toLowerCase().split(/[^\p{L}\p{N}]+/u))
      if (word.length > 3) keywords.add(word);
    if (!matched) keywords.add(industry.toLowerCase());
  }
  return { tags: [...tags.values()], keywords: [...keywords] };
}

/** Keep only well-formed tags on allowed keys (planner output is untrusted). */
export function sanitizeOsmTags(tags: OsmTag[]): OsmTag[] {
  const out = new Map<string, OsmTag>();
  for (const tag of tags) {
    const key = tag.key.trim().toLowerCase();
    const value = tag.value.trim().toLowerCase();
    if (!(OSM_ALLOWED_KEYS as readonly string[]).includes(key)) continue;
    if (!/^[a-z0-9_;:-]{2,40}$/.test(value)) continue;
    out.set(`${key}=${value}`, { key, value });
  }
  return [...out.values()].slice(0, 12);
}

/** Share of `keywords` found in `text` (0–1) and which ones matched. */
export function keywordMatch(
  text: string,
  keywords: string[],
): { score: number; matched: string[] } {
  const haystack = text.toLowerCase();
  const matched = keywords.filter((k) => k && haystack.includes(k.toLowerCase()));
  // "real" and "estate" add nothing once "real estate" matched.
  const distinct = matched.filter(
    (k) => !matched.some((other) => other !== k && other.includes(k)),
  );
  return { score: keywords.length ? matched.length / keywords.length : 0, matched: distinct };
}
