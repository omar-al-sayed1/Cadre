import { describe, expect, it } from "vitest";
import {
  categoriesFor,
  cleanNameWord,
  keywordMatch,
  nameWordsFor,
  sanitizeOsmTags,
} from "./prospect-categories";

describe("prospect categories", () => {
  it("maps industries to OpenStreetMap tags and page keywords", () => {
    const re = categoriesFor(["Real Estate"]);
    expect(re.tags).toContainEqual({ key: "office", value: "estate_agent" });
    expect(re.keywords).toContain("realty");
    // A specialty doesn't drag in the generic category.
    const dental = categoriesFor(["Dental clinic"]).tags.map((t) => `${t.key}=${t.value}`);
    expect(dental).toContain("amenity=dentist");
    expect(dental).not.toContain("amenity=clinic");
    expect(categoriesFor(["Medical clinic"]).tags).toContainEqual({
      key: "amenity",
      value: "clinic",
    });
    // Unknown industries still contribute their own words.
    expect(categoriesFor(["Aquaculture"]).keywords).toContain("aquaculture");
  });

  it("knows business-name words in several languages and cleans planner input", () => {
    expect(nameWordsFor(["Real Estate"])).toEqual(
      expect.arrayContaining(["realty", "immobilier", "عقار"]),
    );
    expect(cleanNameWord('Realty"];out;')).toBe("realtyout");
    expect(cleanNameWord("ab")).toBeNull();
    expect(
      sanitizeOsmTags([
        { key: "office", value: "estate_agent" },
        { key: "highway", value: "primary" },
        { key: "shop", value: 'x"];' },
      ]),
    ).toEqual([{ key: "office", value: "estate_agent" }]);
  });

  it("reports distinct keyword matches", () => {
    expect(
      keywordMatch("Cedar real estate — apartments", [
        "real estate",
        "real",
        "estate",
        "apartments",
      ]).matched,
    ).toEqual(["real estate", "apartments"]);
  });
});
