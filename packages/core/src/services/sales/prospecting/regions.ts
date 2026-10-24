/**
 * Country names → ISO 3166-1 alpha-2 codes, built from the runtime's own ICU
 * data (English, French and Arabic names), plus common short forms.
 */
const ALIASES: Record<string, string> = {
  uae: "AE",
  "u.a.e.": "AE",
  emirates: "AE",
  ksa: "SA",
  usa: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  america: "US",
  uk: "GB",
  "u.k.": "GB",
  england: "GB",
  britain: "GB",
  "great britain": "GB",
  "south korea": "KR",
  "north korea": "KP",
  russia: "RU",
  syria: "SY",
  iran: "IR",
  palestine: "PS",
  "ivory coast": "CI",
  turkey: "TR",
  türkiye: "TR",
  czechia: "CZ",
  holland: "NL",
};

let index: Map<string, string> | null = null;

function buildIndex(): Map<string, string> {
  const map = new Map<string, string>();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const locales = ["en", "fr", "ar"];
  const namers = locales.map(
    (l) => new Intl.DisplayNames([l], { type: "region", fallback: "none" }),
  );
  for (const a of letters) {
    for (const b of letters) {
      const code = `${a}${b}`;
      for (const namer of namers) {
        let name: string | undefined;
        try {
          name = namer.of(code);
        } catch {
          name = undefined;
        }
        if (name && name !== code) map.set(name.toLowerCase(), code);
      }
    }
  }
  for (const [alias, code] of Object.entries(ALIASES)) map.set(alias, code);
  return map;
}

/** ISO code for a country name or code ("Lebanon", "liban", "لبنان", "LB"), or null. */
export function countryCode(name: string): string | null {
  const value = name.trim();
  const alias = ALIASES[value.toLowerCase()];
  if (alias) return alias;
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  index ??= buildIndex();
  return index.get(value.toLowerCase()) ?? null;
}
