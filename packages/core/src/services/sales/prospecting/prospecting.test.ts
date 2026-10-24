import { describe, expect, it, vi } from "vitest";
import {
  DemoSalesAI,
  type AssessProspectsInput,
  type ReadListingInput,
  type SalesBusinessContext,
} from "@repo/ai";
import { categoriesFor, nameWordsFor } from "@repo/sales-engine";
import { extractContacts, extractLinks } from "../research-providers";
import { runProspectingAgent, type AgentSources } from "./agent";
import { crawlCompanySite, type FetchedPage, type PageFetcher } from "./crawler";
import { nominatimQueries, searchNominatim } from "./nominatim";
import { buildOverpassQuery, toOsmPlace, type OsmPlace } from "./osm";
import { countryCode } from "./regions";
import { buildWikidataQuery } from "./wikidata";
import { boundingBox, distanceKm } from "./geo";

const business = {
  companyName: "Nova",
  companyDescription: "",
  website: "https://nova.example",
  offering: {
    name: "Property websites",
    description: "Websites for agencies.",
    priceRange: "",
    pricingModel: null,
    benefits: [],
    features: [],
    differentiators: [],
  },
  icp: {
    industries: ["Real Estate"],
    companySizes: [],
    countries: ["Lebanon"],
    cities: ["Beirut"],
    jobTitles: [],
    characteristics: [],
  },
  valueProposition: { whyBuy: "", problemSolved: "", difference: "", outcomes: [] },
  qualificationNotes: "",
  tone: { style: "CONSULTATIVE", customInstructions: "" },
  language: "en",
  matchProspectLanguage: false,
  responseLength: "SHORT",
  discloseAutomation: false,
  playbook: {
    openingStyle: "",
    qualificationQuestions: [],
    pricingPolicy: "",
    discountPolicy: "",
    competitorPositioning: "",
    meetingRules: "",
    followUpRules: "",
    forbiddenClaims: [],
    escalationRules: [],
    objections: [],
  },
} satisfies SalesBusinessContext;

const criteria = {
  industries: ["Real Estate"],
  countries: ["Lebanon"],
  cities: ["Beirut"],
  companySizes: [],
  keywords: "",
  count: 5,
};

/** A tiny fake web: url → html. */
function fakeWeb(pages: Record<string, string>): PageFetcher {
  return async (url) => {
    const key = url.replace(/\/$/, "");
    const html = pages[key] ?? pages[`${key}/`];
    if (!html) return null;
    const title = /<title>(.*?)<\/title>/.exec(html)?.[1] ?? null;
    return {
      url,
      title,
      description: /content="([^"]+)"/.exec(html)?.[1] ?? null,
      text: html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      html,
    } satisfies FetchedPage;
  };
}

const CEDAR_HOME = `<html><head><title>Cedar Homes | Real estate in Beirut</title>
<meta name="description" content="Apartments for sale and rent in Beirut."></head>
<body><h1>Cedar Homes</h1><p>Real estate agency with 200 listings in Beirut.</p>
<a href="/contact-us">Contact</a> <a href="/about">About us</a>
<a href="https://www.linkedin.com/company/cedar-homes/">LinkedIn</a></body></html>`;
const CEDAR_CONTACT = `<html><head><title>Contact | Cedar Homes</title></head><body>
<a href="mailto:info@cedarhomes.example">info@cedarhomes.example</a>
<a href="tel:+9611234567">+961 1 234 567</a><img src="logo@2x.png"></body></html>`;
const CEDAR_ABOUT = `<html><head><title>About | Cedar Homes</title></head><body>
<p>Founded by Rami Khoury, CEO.</p></body></html>`;

const osmPlace = (over: Partial<OsmPlace>): OsmPlace => ({
  id: "node/1",
  name: "Cedar Homes",
  category: "office=estate_agent",
  website: "https://cedarhomes.example",
  phone: null,
  email: null,
  address: "Hamra Street, Beirut",
  city: "Beirut",
  country: null,
  lat: 33.8966,
  lon: 35.4823,
  osmUrl: "https://www.openstreetmap.org/node/1",
  ...over,
});

describe("regions", () => {
  it("maps country names in English, French and Arabic to ISO codes", () => {
    expect(countryCode("Lebanon")).toBe("LB");
    expect(countryCode("liban")).toBe("LB");
    expect(countryCode("لبنان")).toBe("LB");
    expect(countryCode("UAE")).toBe("AE");
    expect(countryCode("uk")).toBe("GB");
    expect(countryCode("jo")).toBe("JO");
    expect(countryCode("Atlantis")).toBeNull();
  });
});

describe("open-data queries", () => {
  it("builds an Overpass query by category and business name, with the city resolved inside the country", () => {
    const q = buildOverpassQuery(
      categoriesFor(["Real Estate"]).tags,
      { countryCodes: ["LB"], cities: ["Beirut"] },
      50,
      nameWordsFor(["Real Estate"]),
    )!;
    expect(q).toContain('area["ISO3166-1"="LB"][admin_level=2]');
    expect(q).toContain(
      'rel(area.countries)["boundary"="administrative"]["name"~"^Beirut( |$)",i]',
    );
    expect(q).toContain('nwr["office"="estate_agent"]["name"](area.cities);');
    expect(q).toMatch(/nwr\["office"\]\["name"~"real estate\|realty\|/);
    expect(q).toContain(".countries out count;");
    expect(q).toContain("out center tags 50;");
    expect(buildOverpassQuery([], { countryCodes: ["LB"], cities: [] }, 10)).toBeNull();
    expect(
      buildOverpassQuery(categoriesFor(["Real Estate"]).tags, { countryCodes: [], cities: [] }, 10),
    ).toBeNull();
  });

  it("strips quotes and regex syntax from planner-provided words", () => {
    const q = buildOverpassQuery([], { countryCodes: ["LB"], cities: [] }, 10, [
      'realty"];out;(',
      "x",
    ])!;
    expect(q).not.toContain('"];out;(');
    expect(q).toContain('"realtyout"');
  });

  it("reads OSM business tags", () => {
    const place = toOsmPlace(
      {
        type: "node",
        id: 7,
        tags: {
          name: "عقارات الأرز",
          "name:en": "Cedar Realty",
          office: "estate_agent",
          website: "cedarrealty.example",
          "contact:phone": "+961 1 111 111;+961 3 333 333",
          "addr:street": "Hamra",
          "addr:city": "Beirut",
        },
      },
      categoriesFor(["Real Estate"]).tags,
    );
    expect(place).toMatchObject({
      name: "عقارات الأرز (Cedar Realty)",
      category: "office=estate_agent",
      website: "https://cedarrealty.example",
      phone: "+961 1 111 111",
      city: "Beirut",
      osmUrl: "https://www.openstreetmap.org/node/7",
    });
    expect(toOsmPlace({ type: "node", id: 8, tags: { office: "estate_agent" } }, [])).toBeNull();
  });

  it("builds Wikidata and Nominatim queries", () => {
    const sparql = buildWikidataQuery(["Q1", "Q2"], ["LB"], 20);
    expect(sparql).toContain("VALUES ?industry { wd:Q1 wd:Q2 }");
    expect(sparql).toContain('VALUES ?iso { "LB" }');
    expect(sparql).toContain("LIMIT 20");
    expect(
      nominatimQueries(categoriesFor(["Real Estate"]).tags, ["realty"], ["Beirut, Lebanon"]),
    ).toEqual([
      "estate agent in Beirut, Lebanon",
      "property management in Beirut, Lebanon",
      "realty Beirut, Lebanon",
    ]);
  });
});

describe("website reading", () => {
  it("extracts published contact details and never invents any", () => {
    const contacts = extractContacts(
      [
        {
          url: "https://cedarhomes.example/contact",
          html: `${CEDAR_CONTACT} <p>Write to rami.k@gmail.com or noreply@cedarhomes.example</p>`,
        },
      ],
      "cedarhomes.example",
    );
    expect(contacts.emails[0]).toBe("info@cedarhomes.example");
    expect(contacts.emails).toContain("rami.k@gmail.com");
    expect(contacts.emails.join(" ")).not.toMatch(/logo@2x|noreply/);
    expect(contacts.phones).toEqual(["+9611234567"]);
    const links = extractLinks(CEDAR_HOME, "https://cedarhomes.example/");
    expect(links.map((l) => l.url)).toContain("https://cedarhomes.example/contact-us");
  });

  it("crawls the homepage plus contact and about pages", async () => {
    const report = await crawlCompanySite("cedarhomes.example", {
      maxPages: 3,
      fetchPage: fakeWeb({
        "https://cedarhomes.example": CEDAR_HOME,
        "https://cedarhomes.example/contact-us": CEDAR_CONTACT,
        "https://cedarhomes.example/about": CEDAR_ABOUT,
      }),
    });
    expect(report).toMatchObject({
      verified: true,
      origin: "https://cedarhomes.example",
      emails: ["info@cedarhomes.example"],
      phones: ["+9611234567"],
      linkedinUrl: "https://www.linkedin.com/company/cedar-homes",
    });
    expect(report.pages.map((p) => p.url)).toEqual([
      "https://cedarhomes.example/",
      "https://cedarhomes.example/contact-us",
      "https://cedarhomes.example/about",
    ]);
    expect(
      (await crawlCompanySite("down.example", { maxPages: 3, fetchPage: fakeWeb({}) })).verified,
    ).toBe(false);
  });
});

describe("prospecting agent", () => {
  const web = fakeWeb({
    "https://cedarhomes.example": CEDAR_HOME,
    "https://cedarhomes.example/contact-us": CEDAR_CONTACT,
    "https://cedarhomes.example/about": CEDAR_ABOUT,
    "https://burger.example":
      "<html><head><title>Burger Place</title></head><body>Burgers and fries</body></html>",
  });

  const sources = (over: Partial<AgentSources> = {}): Partial<AgentSources> => ({
    osm: async () => ({
      places: [
        osmPlace({}),
        osmPlace({
          id: "node/2",
          name: "Known Realty",
          website: "https://known.example",
          osmUrl: "https://www.openstreetmap.org/node/2",
        }),
        osmPlace({
          id: "node/3",
          name: "Hamra Properties",
          website: null,
          phone: "+961 1 999 999",
          osmUrl: "https://www.openstreetmap.org/node/3",
        }),
      ],
      note: null,
    }),
    wikidata: async () => ({
      companies: [
        {
          qid: "Q9",
          name: "Cedar Homes",
          description: "Lebanese real estate company",
          website: "https://www.cedarhomes.example/",
          employees: 40,
          headquarters: "Beirut",
          industry: "real estate",
          lat: null,
          lon: null,
          url: "https://www.wikidata.org/wiki/Q9",
        },
      ],
      note: null,
    }),
    fetchPage: web,
    ...over,
  });

  it("finds real companies from open data, reads their websites and skips ones already in the CRM (rules mode)", async () => {
    const progress: string[] = [];
    const result = await runProspectingAgent({
      ai: new DemoSalesAI(),
      business,
      criteria,
      depth: "quick",
      exclude: { names: new Set(), domains: new Set(["known.example"]) },
      meta: {},
      onProgress: (m) => void progress.push(m),
      sources: sources(),
    });
    const names = result.prospects.map((p) => p.companyName);
    expect(names).toContain("Cedar Homes");
    expect(names).not.toContain("Known Realty");
    const cedar = result.prospects.find((p) => p.companyName === "Cedar Homes")!;
    expect(cedar).toMatchObject({
      website: "https://cedarhomes.example",
      websiteCheck: "verified",
      email: "info@cedarhomes.example",
      emailSource: "https://cedarhomes.example/contact-us",
      phone: "+9611234567",
      linkedinUrl: "https://www.linkedin.com/company/cedar-homes",
      companySize: "11-50",
      people: [],
    });
    // OSM and Wikidata records for the same company were merged, sources kept.
    expect(cedar.sources.map((s) => s.url)).toEqual(
      expect.arrayContaining([
        "https://www.openstreetmap.org/node/1",
        "https://www.wikidata.org/wiki/Q9",
      ]),
    );
    const hamra = result.prospects.find((p) => p.companyName === "Hamra Properties");
    expect(hamra).toMatchObject({
      websiteCheck: "none",
      phone: "+961 1 999 999",
      phoneSource: "https://www.openstreetmap.org/node/3",
    });
    expect(result.prospects[0]?.companyName).toBe("Cedar Homes"); // best-evidenced first
    expect(result.notes.join(" ")).toMatch(/OpenStreetMap contributors/);
    expect(result.notes.join(" ")).toMatch(/keyword rules/);
    expect(progress.some((m) => /Visiting/.test(m))).toBe(true);
  });

  it("keeps going when a source fails", async () => {
    const result = await runProspectingAgent({
      ai: new DemoSalesAI(),
      business,
      criteria,
      depth: "quick",
      exclude: { names: new Set(), domains: new Set() },
      meta: {},
      sources: sources({
        osm: async () => {
          throw new Error("down");
        },
      }),
    });
    expect(result.notes.join(" ")).toMatch(/OpenStreetMap couldn't be searched/);
    expect(result.prospects.map((p) => p.companyName)).toEqual(["Cedar Homes"]);
  });

  it("with a reasoning model: reads directories, follows only real links, and keeps only people named on fetched pages", async () => {
    const directory = `<html><head><title>Members | Beirut Realtors</title></head><body>
      <a href="https://cedarhomes.example/">Cedar Homes</a> <a href="/members?page=2">Next</a>
      <a href="https://evil.example/login">Login</a></body></html>`;
    const page2 = `<html><head><title>Members 2</title></head><body><a href="https://burger.example">Burger Place</a></body></html>`;
    const reads: string[] = [];
    const rules = new DemoSalesAI();
    const ai = Object.assign(Object.create(rules) as DemoSalesAI, {
      canReason: true,
      modelName: "fake-model",
      planProspectSearch: async () => ({
        data: {
          osmTags: [],
          wikidataIndustries: [],
          seedUrls: ["https://realtors.example/members", "https://www.linkedin.com/x"],
          pageKeywords: [],
          nameKeywords: [],
          notes: [],
        },
        promptVersion: "t",
        provider: "fake",
        model: "fake",
      }),
      readListingPage: async (input: ReadListingInput) => {
        reads.push(input.page.url);
        return {
          data: input.page.url.includes("page=2")
            ? { relevant: true, companies: [], followLinks: [] }
            : {
                relevant: true,
                companies: [
                  {
                    name: "Cedar Homes",
                    website: "https://cedarhomes.example/",
                    city: "Beirut",
                    country: "Lebanon",
                    evidence: "Member",
                  },
                  {
                    name: "Ghost Realty",
                    website: "https://ghost.example",
                    city: null,
                    country: null,
                    evidence: "",
                  },
                ],
                followLinks: [
                  "https://realtors.example/members?page=2",
                  "https://evil.example/login",
                ],
              },
          promptVersion: "t",
          provider: "fake",
          model: "fake",
        };
      },
      assessProspects: async (input: AssessProspectsInput) => ({
        data: {
          assessments: input.companies.map((c) => ({
            ref: c.ref,
            isCompany: true,
            matches: c.name !== "Ghost Realty",
            companyName: c.name ?? "?",
            industry: "Real estate",
            city: "Beirut",
            country: "Lebanon",
            companySize: null,
            description: "Agency.",
            matchReasons: ["Real estate agency in Beirut."],
            people: [
              {
                fullName: "Rami Khoury",
                jobTitle: "CEO",
                sourceUrl: "https://cedarhomes.example/about",
              },
              { fullName: "Made Up", jobTitle: "CTO", sourceUrl: "https://elsewhere.example/team" },
            ],
            confidence: 0.9,
          })),
        },
        promptVersion: "t",
        provider: "fake",
        model: "fake",
      }),
    });
    const result = await runProspectingAgent({
      ai,
      business,
      criteria,
      depth: "deep",
      exclude: { names: new Set(), domains: new Set() },
      meta: {},
      sources: sources({
        osm: async () => ({ places: [], note: null }),
        wikidata: async () => ({ companies: [], note: null }),
        fetchPage: fakeWeb({
          "https://realtors.example/members": directory,
          "https://realtors.example/members?page=2": page2,
          "https://cedarhomes.example": CEDAR_HOME,
          "https://cedarhomes.example/contact-us": CEDAR_CONTACT,
          "https://cedarhomes.example/about": CEDAR_ABOUT,
        }),
      }),
    });
    // LinkedIn seed dropped; pagination followed on the same site; off-site links ignored.
    expect(reads).toEqual([
      "https://realtors.example/members",
      "https://realtors.example/members?page=2",
    ]);
    const cedar = result.prospects.find((p) => p.companyName === "Cedar Homes")!;
    expect(cedar.people).toEqual([
      { fullName: "Rami Khoury", jobTitle: "CEO", sourceUrl: "https://cedarhomes.example/about" },
    ]);
    expect(cedar.sources[0]?.url).toBe("https://realtors.example/members");
    expect(result.stats.directoryPages).toBe(2);
    // A company whose website isn't linked from the directory page has no website.
    expect(result.prospects.some((p) => p.companyName === "Ghost Realty")).toBe(false);
  });
});

describe("OpenStreetMap search fallback", () => {
  it("keeps only results inside the target countries (Lebanon, TN is not Lebanon)", async () => {
    const urls: string[] = [];
    const fake = async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify([
          {
            osm_type: "node",
            osm_id: 1,
            name: "Cumberland Real Estate",
            display_name:
              "Cumberland Real Estate, Public Square, Lebanon, Tennessee, United States",
            category: "office",
            type: "estate_agent",
            address: { city: "Lebanon", country: "United States", country_code: "us" },
          },
          {
            osm_type: "node",
            osm_id: 2,
            name: "Beirut Living",
            display_name: "Beirut Living, Hamra, Beirut, Lebanon",
            category: "office",
            type: "estate_agent",
            extratags: { website: "beirutliving.example" },
            address: { city: "Beirut", country: "Lebanon", country_code: "lb" },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    vi.stubGlobal("fetch", fake);
    try {
      const places = await searchNominatim({
        tags: [{ key: "office", value: "estate_agent" }],
        nameWords: [],
        countries: ["Lebanon"],
        cities: [],
        countryCodes: ["LB"],
      });
      expect(places.map((p) => p.name)).toEqual(["Beirut Living"]);
      expect(places[0]?.website).toBe("https://beirutliving.example");
      expect(urls[0]).toContain("countrycodes=lb");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("map area search", () => {
  const hamra = { lat: 33.8966, lon: 35.4823, radiusKm: 5 };

  it("uses a fast around-filter instead of country areas", () => {
    const q = buildOverpassQuery(
      categoriesFor(["Real Estate"]).tags,
      { countryCodes: ["LB"], cities: ["Beirut"], around: hamra },
      40,
      [],
      "tags",
    )!;
    expect(q).toContain('nwr["office"="estate_agent"]["name"](around:5000,33.896600,35.482300);');
    expect(q).not.toContain("ISO3166-1");
    expect(buildOverpassQuery([], { countryCodes: [], cities: [], around: hamra }, 10)).toBeNull();
  });

  it("finds Wikidata companies headquartered inside the circle", () => {
    const sparql = buildWikidataQuery(["Q1"], [], 20, hamra);
    expect(sparql).toContain("SERVICE wikibase:around");
    expect(sparql).toContain('"Point(35.482300 33.896600)"^^geo:wktLiteral');
    expect(sparql).toContain('wikibase:radius "5"');
    expect(sparql).not.toContain("wdt:P297");
  });

  it("measures distances and boxes", () => {
    // Hamra → Beirut Martyrs' Square is roughly 2.3 km.
    const d = distanceKm(hamra, { lat: 33.8959, lon: 35.5075 });
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(2.6);
    const box = boundingBox(hamra);
    expect(box.north - box.south).toBeCloseTo(0.0899, 3);
    expect(box.west).toBeLessThan(hamra.lon);
  });

  it("passes the circle to the sources and reports each result's distance", async () => {
    const seen: unknown[] = [];
    const result = await runProspectingAgent({
      ai: new DemoSalesAI(),
      business,
      criteria: {
        ...criteria,
        cities: [],
        countries: [],
        area: { ...hamra, label: "Hamra, Beirut" },
      },
      depth: "quick",
      exclude: { names: new Set(), domains: new Set() },
      meta: {},
      sources: {
        osm: async (input) => {
          seen.push(input.around);
          return { places: [osmPlace({ lat: 33.8959, lon: 35.5075 })], note: null };
        },
        wikidata: async (input) => {
          seen.push(input.around);
          return { companies: [], note: null };
        },
        fetchPage: fakeWeb({
          "https://cedarhomes.example": CEDAR_HOME,
          "https://cedarhomes.example/contact-us": CEDAR_CONTACT,
        }),
      },
    });
    expect(seen).toEqual([
      { ...hamra, label: "Hamra, Beirut" },
      { ...hamra, label: "Hamra, Beirut" },
    ]);
    expect(result.prospects[0]).toMatchObject({ companyName: "Cedar Homes", lat: 33.8959 });
    expect(result.prospects[0]?.distanceKm).toBeCloseTo(2.3, 0);
  });
});
