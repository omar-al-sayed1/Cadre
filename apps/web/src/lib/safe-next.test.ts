import { describe, expect, it } from "vitest";
import { inviteTokenFrom, safeNext, withNext } from "./safe-next";

describe("auth redirects", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext(undefined)).toBeNull();
  });

  it("keeps the destination on links between sign-in and sign-up", () => {
    expect(withNext("/login", "/invite/abc")).toBe("/login?next=%2Finvite%2Fabc");
    expect(withNext("/login", null)).toBe("/login");
  });

  it("recognises a team-invitation destination", () => {
    const token = "Q2xhdWRlLWludml0ZS10b2tlbi0xMjM0NTY3ODkw";
    expect(inviteTokenFrom(`/invite/${token}`)).toBe(token);
    expect(inviteTokenFrom(`/invite/${token}/extra`)).toBeNull();
    expect(inviteTokenFrom("/home")).toBeNull();
  });
});
