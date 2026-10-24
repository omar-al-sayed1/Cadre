import { describe, expect, it } from "vitest";
import {
  assertSafeUrl,
  describeFetchError,
  extractPage,
  isAllowedByRobots,
  isNonPublicAddress,
} from "./research-providers";

describe("research SSRF protection", () => {
  it("blocks private, loopback, link-local and metadata addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isNonPublicAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"])
      expect(isNonPublicAddress(ip), ip).toBe(false);
  });

  it("only accepts public http(s) URLs on standard ports", () => {
    expect(assertSafeUrl("https://example.com/about").hostname).toBe("example.com");
    for (const bad of [
      "file:///etc/passwd",
      "http://localhost/",
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "https://example.com:8443/",
      "https://user:pass@example.com/",
      "http://intranet/",
      "http://printer.local/",
      "gopher://example.com/",
    ]) {
      expect(() => assertSafeUrl(bad), bad).toThrow();
    }
  });
});

describe("robots.txt", () => {
  const robots =
    "User-agent: *\nDisallow: /private\nAllow: /private/press\n\nUser-agent: BadBot\nDisallow: /";
  it("honours disallow rules for everyone and our bot", () => {
    expect(isAllowedByRobots(robots, "/")).toBe(true);
    expect(isAllowedByRobots(robots, "/private/team")).toBe(false);
    expect(isAllowedByRobots(robots, "/private/press/2026")).toBe(true);
    expect(isAllowedByRobots("User-agent: CadreResearchBot\nDisallow: /", "/about")).toBe(false);
  });
});

describe("page extraction", () => {
  it("keeps readable text and drops scripts", () => {
    const page = extractPage(
      '<html><head><title>Cedar &amp; Co</title><meta name="description" content="Homes in Beirut"></head><body><script>alert(1)</script><h1>Welcome</h1><p>We sell apartments.</p></body></html>',
    );
    expect(page).toMatchObject({ title: "Cedar & Co", description: "Homes in Beirut" });
    expect(page.text).toContain("We sell apartments.");
    expect(page.text).not.toContain("alert");
  });
});

describe("fetch errors", () => {
  it("are explained in plain language without raw network details", () => {
    const dns = Object.assign(new Error("getaddrinfo ENOTFOUND cedar.example"), {
      code: "ENOTFOUND",
    });
    expect(describeFetchError(dns)).toBe("the domain couldn't be found");
    expect(describeFetchError(new Error("The website took too long to respond."))).toBe(
      "it took too long to respond",
    );
    expect(describeFetchError(Object.assign(new Error("x"), { code: "EBLOCKED" }))).toMatch(
      /public website/,
    );
    expect(describeFetchError("weird")).toBe("a network error occurred");
  });
});
