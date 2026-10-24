import { describe, expect, it } from "vitest";
import { parseSalesAgentConfig, type SalesAgentConfig } from "@repo/validation";
import { DuplicateIndex, duplicateKeys, findDuplicate } from "./dedupe";
import { autoMapHeaders, mapImportRow } from "./import";
import { domainFromEmail, domainFromUrl, normalizeCompanyName, normalizePhone } from "./normalize";
import { bandFor, parseEmployeeCount, scoreLead, type ScorableLead } from "./scoring";
import { canTransitionLead, isContactable } from "./state-machine";

/** "We sell websites to real estate agencies in Lebanon." */
function realEstateConfig(overrides: Partial<SalesAgentConfig> = {}): SalesAgentConfig {
  const base = parseSalesAgentConfig({
    icp: {
      industries: ["Real Estate"],
      countries: ["Lebanon"],
      cities: ["Beirut"],
      jobTitles: ["Owner", "CEO", "General Manager", "Marketing Manager"],
      companySizes: ["1-10", "11-50"],
    },
    qualification: {
      rules: [
        {
          id: "r1",
          label: "Is a real estate company",
          field: "industry",
          operator: "contains",
          value: "real estate",
          required: true,
        },
        {
          id: "r2",
          label: "At least 5 employees",
          field: "companySize",
          operator: "minEmployees",
          value: "5",
        },
        {
          id: "r3",
          label: "Operates in Lebanon",
          field: "country",
          operator: "equals",
          value: "Lebanon",
        },
      ],
    },
  });
  return { ...base, ...overrides };
}

const idealLead: ScorableLead = {
  companyName: "Cedar Homes",
  jobTitle: "CEO",
  industry: "Real estate agency",
  city: "Beirut",
  country: "Lebanon",
  companySize: "25",
  email: "rami@cedarhomes.example",
  status: "NEW",
};

describe("lead scoring", () => {
  it("scores an ideal-customer lead high and qualifies it", () => {
    const result = scoreLead(idealLead, realEstateConfig());
    expect(result.leadScore).toBeGreaterThanOrEqual(90);
    expect(result.band).toBe("hot");
    expect(result.qualification.status).toBe("QUALIFIED");
    expect(result.factors.find((f) => f.key === "industryFit")?.score).toBe(100);
  });

  it("disqualifies a lead failing a required rule, whatever the other factors", () => {
    const result = scoreLead({ ...idealLead, industry: "Restaurant" }, realEstateConfig());
    expect(result.qualification.status).toBe("UNQUALIFIED");
    expect(result.qualification.failed).toContain("Is a real estate company");
    expect(result.leadScore).toBeLessThan(90);
  });

  it("never guesses: missing data is excluded and lowers confidence", () => {
    const sparse = scoreLead({ companyName: "Unknown Co", status: "NEW" }, realEstateConfig());
    expect(sparse.confidence).toBe(0);
    expect(sparse.qualification.status).toBe("NEEDS_REVIEW");
    expect(sparse.factors.every((f) => f.score === null)).toBe(true);
    const partial = scoreLead({ ...idealLead, industry: null }, realEstateConfig());
    expect(partial.qualification.status).toBe("NEEDS_REVIEW");
    expect(partial.confidence).toBeLessThan(1);
  });

  it("never auto-qualifies a clear miss on a configured target", () => {
    // No required rules: right place and role, wrong industry.
    const config = parseSalesAgentConfig({ ...realEstateConfig(), qualification: { rules: [] } });
    const result = scoreLead({ ...idealLead, industry: "Restaurant" }, config);
    expect(result.qualificationScore).toBeGreaterThanOrEqual(60);
    expect(result.qualification.status).toBe("NEEDS_REVIEW");
    expect(result.qualification.reason).toMatch(/industry fit/i);
  });

  it("doesn't rank a lead as hot when most relevant data is missing", () => {
    const thin = scoreLead(
      { companyName: "Beirut Realty", industry: "Real estate", status: "NEW" },
      realEstateConfig(),
    );
    expect(thin.factors.find((f) => f.key === "industryFit")?.score).toBe(100);
    expect(thin.band).not.toBe("hot");
    expect(thin.leadScore).toBeLessThan(scoreLead(idealLead, realEstateConfig()).leadScore);
    // Engagement/intent aren't "missing" before any contact, so ideal new leads can still be hot.
    expect(scoreLead(idealLead, realEstateConfig()).confidence).toBe(1);
  });

  it("is deterministic and respects configured weights", () => {
    const config = realEstateConfig();
    expect(scoreLead(idealLead, config)).toEqual(scoreLead(idealLead, config));
    const roleOnly = parseSalesAgentConfig({
      ...config,
      scoring: {
        weights: {
          industryFit: 0,
          locationFit: 0,
          roleRelevance: 100,
          companySizeFit: 0,
          qualificationFit: 0,
          problemRelevance: 0,
          intent: 0,
          engagement: 0,
        },
      },
    });
    expect(scoreLead({ ...idealLead, jobTitle: "Intern" }, roleOnly).leadScore).toBe(25);
  });

  it("uses configurable bands", () => {
    const bands = { hot: 96, high: 80, medium: 60, low: 40 };
    expect(bandFor(95, bands)).toBe("high");
    expect(bandFor(96, bands)).toBe("hot");
    expect(bandFor(39, bands)).toBe("very_low");
  });

  it("never prioritises opted-out leads", () => {
    expect(
      scoreLead({ ...idealLead, status: "DO_NOT_CONTACT" }, realEstateConfig()).leadScore,
    ).toBe(0);
  });

  it("parses employee counts", () => {
    expect(parseEmployeeCount("11-50")).toBe(31);
    expect(parseEmployeeCount("about 1,200 employees")).toBe(1200);
    expect(parseEmployeeCount("small")).toBeNull();
  });
});

describe("duplicate detection", () => {
  const existing = [
    {
      id: "a",
      firstName: "Rami",
      lastName: "Khoury",
      companyName: "Cedar Homes S.A.L.",
      email: "Rami@CedarHomes.example",
      phone: "+961 1 234 567",
      website: "https://www.cedarhomes.example/about",
    },
    { id: "b", companyName: "Beirut Realty", website: "beirutrealty.example" },
  ];

  it("matches on normalised email, phone and person+company", () => {
    expect(findDuplicate({ email: " rami@cedarhomes.example " }, existing)?.kind).toBe("email");
    expect(findDuplicate({ phone: "00961-1-234-567" }, existing)?.kind).toBe("phone");
    expect(
      findDuplicate({ firstName: "rami", lastName: "khoury", companyName: "Cedar Homes" }, existing)
        ?.existing.id,
    ).toBe("a");
    expect(
      findDuplicate(
        {
          firstName: "Rami",
          lastName: "Khoury",
          email: "rami.k@gmail.com",
          website: "cedarhomes.example",
        },
        existing,
      )?.kind,
    ).toBe("person_domain");
  });

  it("treats different people at the same company as different leads", () => {
    expect(
      findDuplicate(
        { firstName: "Lina", lastName: "Haddad", companyName: "Cedar Homes" },
        existing,
      ),
    ).toBeNull();
  });

  it("matches company-only leads by company and domain", () => {
    expect(
      findDuplicate(
        { companyName: "Beirut Realty", website: "https://beirutrealty.example" },
        existing,
      )?.existing.id,
    ).toBe("b");
  });

  it("never uses webmail domains as company identity", () => {
    expect(domainFromEmail("someone@gmail.com")).toBeNull();
    expect(
      duplicateKeys({ firstName: "A", lastName: "B", email: "a@gmail.com" }).map((k) => k.kind),
    ).toEqual(["email"]);
  });

  it("detects duplicates within the same import file", () => {
    const index = new DuplicateIndex<number>();
    index.add({ email: "x@acme.example" }, 2);
    expect(index.find({ email: "X@ACME.example" })).toEqual({ match: 2, kind: "email" });
  });

  it("normalises identifiers", () => {
    expect(normalizePhone("(01) 23-45")).toBeNull();
    expect(domainFromUrl("HTTPS://www.Example.com/path?q=1")).toBe("example.com");
    expect(normalizeCompanyName("Cedar Homes S.A.L.")).toBe("cedar homes");
  });
});

describe("lead state machine", () => {
  it("lets humans correct decisions but keeps opt-outs final", () => {
    expect(canTransitionLead("QUALIFIED", "UNQUALIFIED", "USER")).toBe(true);
    expect(canTransitionLead("DO_NOT_CONTACT", "NEW", "USER")).toBe(false);
    expect(isContactable("DO_NOT_CONTACT")).toBe(false);
  });

  it("restricts the AI to forward moves and never lets it close deals", () => {
    expect(canTransitionLead("NEW", "RESEARCHING", "AI")).toBe(true);
    expect(canTransitionLead("QUALIFIED", "UNQUALIFIED", "AI")).toBe(false);
    expect(canTransitionLead("NEGOTIATION", "WON", "AI")).toBe(false);
    expect(canTransitionLead("INTERESTED", "LOST", "AI")).toBe(false);
  });

  it("always allows any actor to honour an opt-out", () => {
    for (const from of [
      "NEW",
      "CONTACTED",
      "INTERESTED",
      "MEETING_BOOKED",
      "NEGOTIATION",
    ] as const) {
      expect(canTransitionLead(from, "DO_NOT_CONTACT", "AI")).toBe(true);
      expect(canTransitionLead(from, "DO_NOT_CONTACT", "USER")).toBe(true);
    }
  });
});

describe("import mapping", () => {
  it("auto-maps common header names", () => {
    expect(
      autoMapHeaders([
        "company_name",
        "email_address",
        "position",
        "Full Name",
        "Favourite colour",
      ]),
    ).toEqual({
      company_name: "companyName",
      email_address: "email",
      position: "jobTitle",
      "Full Name": "fullName",
      "Favourite colour": null,
    });
  });

  it("splits full names and validates rows", () => {
    const mapping = autoMapHeaders(["name", "email", "website"]);
    const ok = mapImportRow(
      { name: "Jane Q. Doe", email: "JANE@acme.example", website: "acme.example" },
      mapping,
      2,
    );
    expect(ok.errors).toEqual([]);
    expect(ok.data).toMatchObject({
      firstName: "Jane Q.",
      lastName: "Doe",
      email: "jane@acme.example",
      website: "https://acme.example",
      source: "CSV_IMPORT",
    });
    const bad = mapImportRow({ name: "", email: "not-an-email", website: "" }, mapping, 3);
    expect(bad.data).toBeNull();
    expect(bad.errors.length).toBeGreaterThan(0);
  });
});
