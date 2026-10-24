import { describe, expect, it } from "vitest";
import { demoDiscoverProspects } from "./demo-discovery";
import { comparableUrl, keepSourcedProspects } from "./discovery-filter";
import type { DiscoveredProspect, ProspectDiscovery } from "./schemas-discovery";
import type { DiscoverProspectsInput } from "./types";

const prospect = (over: Partial<DiscoveredProspect>): DiscoveredProspect => ({
  companyName: "Cedar Homes",
  website: "https://cedarhomes.example",
  industry: "Real estate",
  city: "Beirut",
  country: "Lebanon",
  companySize: null,
  description: "Residential agency.",
  matchReasons: ["Real estate agency in Beirut."],
  contact: null,
  publicEmail: null,
  publicPhone: null,
  sourceUrls: ["https://cedarhomes.example/about"],
  confidence: 0.8,
  ...over,
});

const discovery = (prospects: DiscoveredProspect[]): ProspectDiscovery => ({
  prospects,
  searchSummary: "Found agencies in Beirut.",
  notes: [],
});

describe("comparableUrl", () => {
  it("ignores scheme, www, fragments and trailing slashes", () => {
    expect(comparableUrl("https://www.Cedar.example/about/#team")).toBe("cedar.example/about");
    expect(comparableUrl("cedar.example/about")).toBe("cedar.example/about");
    expect(comparableUrl("")).toBeNull();
  });
});

describe("keepSourcedProspects (no invented companies)", () => {
  const results = [
    { url: "https://cedarhomes.example/about" },
    { url: "https://directory.example/agencies/beirut" },
  ];

  it("drops prospects whose sources weren't returned by the search", () => {
    const kept = keepSourcedProspects(
      discovery([
        prospect({}),
        prospect({ companyName: "Imagined Realty", sourceUrls: ["https://imagined.example/"] }),
        prospect({ companyName: "No Sources", sourceUrls: [] }),
      ]),
      results,
      10,
    );
    expect(kept.prospects.map((p) => p.companyName)).toEqual(["Cedar Homes"]);
    expect(kept.notes.join(" ")).toMatch(/2 companies were left out/);
  });

  it("keeps only matching source URLs and removes unsupported contacts", () => {
    const kept = keepSourcedProspects(
      discovery([
        prospect({
          sourceUrls: ["https://www.cedarhomes.example/about/", "https://made-up.example/x"],
          contact: {
            fullName: "Rami Khoury",
            jobTitle: "CEO",
            sourceUrl: "https://made-up.example/x",
          },
        }),
      ]),
      results,
      10,
    );
    expect(kept.prospects[0]?.sourceUrls).toEqual(["https://cedarhomes.example/about"]);
    expect(kept.prospects[0]?.contact).toBeNull();
  });

  it("keeps a contact listed on a returned page, collapses duplicate names and respects the limit", () => {
    const kept = keepSourcedProspects(
      discovery([
        prospect({
          contact: {
            fullName: "Rami Khoury",
            jobTitle: "CEO",
            sourceUrl: "https://cedarhomes.example/about",
          },
        }),
        prospect({ companyName: "cedar homes" }),
        prospect({
          companyName: "Beirut Lofts",
          sourceUrls: ["https://directory.example/agencies/beirut"],
        }),
      ]),
      results,
      1,
    );
    expect(kept.prospects).toHaveLength(1);
    expect(kept.prospects[0]?.contact?.fullName).toBe("Rami Khoury");
  });
});

describe("demo discovery", () => {
  const input = (
    over: Partial<DiscoverProspectsInput["criteria"]> = {},
  ): DiscoverProspectsInput => ({
    business: {} as DiscoverProspectsInput["business"],
    criteria: {
      industries: ["Real Estate"],
      countries: ["Lebanon", "Jordan"],
      cities: [],
      companySizes: ["1-10"],
      keywords: "",
      count: 5,
      ...over,
    },
    exclude: { names: [], domains: [] },
  });

  it("returns clearly fictional samples that match the criteria, with no contact details", () => {
    const result = demoDiscoverProspects(input());
    expect(result.prospects).toHaveLength(5);
    for (const p of result.prospects) {
      expect(p.website).toMatch(/\.example$/);
      expect(p.description).toMatch(/Fictional/);
      expect(p.contact).toBeNull();
      expect(p.publicEmail).toBeNull();
      expect(["Lebanon", "Jordan"]).toContain(p.country);
    }
    expect(result.notes.join(" ")).toMatch(/fictional/i);
  });

  it("skips companies already in the workspace and is deterministic", () => {
    const first = demoDiscoverProspects(input());
    const again = demoDiscoverProspects({
      ...input(),
      exclude: { names: first.prospects.map((p) => p.companyName), domains: [] },
    });
    expect(demoDiscoverProspects(input())).toEqual(first);
    expect(
      again.prospects.some((p) => first.prospects.some((f) => f.companyName === p.companyName)),
    ).toBe(false);
  });
});
