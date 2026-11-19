import { describe, expect, it } from "vitest";
import {
  BRANDED_HEADER_PATHS,
  INNER_ROUTE_PREFIXES,
  isImmersiveChatRoute,
  normalizePathname,
  resolveNavbarVariant,
  shouldShowBottomNav,
  shouldShowBrandedHeader,
} from "./nav-mode";

const ALL_INNER_ROUTES = [
  "/reader",
  "/plans",
  "/journey",
  "/settings",
  "/social",
  "/circles/circle-1",
  "/circles/circle-1/settings",
  "/dm/friend-1",
  "/members/member-1",
] as const;

describe("nav-mode", () => {
  it("exposes branded header paths and inner route prefixes", () => {
    expect(BRANDED_HEADER_PATHS).toEqual(["/", "/login"]);
    expect(INNER_ROUTE_PREFIXES).toEqual([
      "/reader",
      "/plans",
      "/journey",
      "/settings",
      "/social",
      "/circles",
      "/dm",
      "/members",
    ]);
  });

  describe("normalizePathname", () => {
    it("strips query strings, hashes, whitespace, and trailing slashes", () => {
      expect(normalizePathname("/")).toBe("/");
      expect(normalizePathname("")).toBe("/");
      expect(normalizePathname("   ")).toBe("/");
      expect(normalizePathname("///")).toBe("/");
      expect(normalizePathname("/login/")).toBe("/login");
      expect(normalizePathname("/login?next=/social#auth")).toBe("/login");
      expect(normalizePathname("/reader/#verse-1?ref=1")).toBe("/reader");
      expect(normalizePathname("social/")).toBe("/social");
    });
  });

  describe("resolveNavbarVariant", () => {
    it("resolves / and /login variants including queries, hashes, and trailing slashes", () => {
      expect(resolveNavbarVariant("/")).toBe("home");
      expect(resolveNavbarVariant("")).toBe("home");
      expect(resolveNavbarVariant("/?tab=today")).toBe("home");
      expect(resolveNavbarVariant("/#top")).toBe("home");

      expect(resolveNavbarVariant("/login")).toBe("login");
      expect(resolveNavbarVariant("/login/")).toBe("login");
      expect(resolveNavbarVariant("/login?next=/social")).toBe("login");
      expect(resolveNavbarVariant("/login/callback")).toBe("login");
    });

    it("resolves all 9 inner routes and unknown paths to inner", () => {
      for (const route of ALL_INNER_ROUTES) {
        expect(resolveNavbarVariant(route)).toBe("inner");
        expect(resolveNavbarVariant(`${route}/?foo=bar#sec`)).toBe("inner");
      }

      expect(resolveNavbarVariant("/unknown")).toBe("inner");
    });
  });

  describe("isImmersiveChatRoute", () => {
    it("matches /dm/* routes after stripping query/hash and before trimming trailing slash", () => {
      expect(isImmersiveChatRoute("/dm/123")).toBe(true);
      expect(isImmersiveChatRoute("/dm/123?reply=2#bottom")).toBe(true);
      expect(isImmersiveChatRoute("/dm/")).toBe(true);

      expect(isImmersiveChatRoute("/dm")).toBe(false);
      expect(isImmersiveChatRoute("/dms")).toBe(false);
      expect(isImmersiveChatRoute("/circles/123")).toBe(false);
      expect(isImmersiveChatRoute("/social")).toBe(false);
      expect(isImmersiveChatRoute("/")).toBe(false);
    });
  });

  describe("shouldShowBrandedHeader", () => {
    it("returns true only for / and /login", () => {
      expect(shouldShowBrandedHeader("/")).toBe(true);
      expect(shouldShowBrandedHeader("/login")).toBe(true);
      expect(shouldShowBrandedHeader("/login?next=/plans")).toBe(true);

      for (const route of ALL_INNER_ROUTES) {
        expect(shouldShowBrandedHeader(route)).toBe(false);
      }
    });
  });

  describe("shouldShowBottomNav", () => {
    it("hides bottom nav on /login by default", () => {
      expect(shouldShowBottomNav("/login")).toBe(false);
      expect(shouldShowBottomNav("/login?next=/social")).toBe(false);
    });

    it("shows bottom nav on home and inner routes including /dm/* by default", () => {
      expect(shouldShowBottomNav("/")).toBe(true);
      expect(shouldShowBottomNav("/reader")).toBe(true);
      expect(shouldShowBottomNav("/plans")).toBe(true);
      expect(shouldShowBottomNav("/journey")).toBe(true);
      expect(shouldShowBottomNav("/settings")).toBe(true);
      expect(shouldShowBottomNav("/social")).toBe(true);
      expect(shouldShowBottomNav("/circles/123")).toBe(true);
      expect(shouldShowBottomNav("/circles/123/settings")).toBe(true);
      expect(shouldShowBottomNav("/dm/123")).toBe(true);
      expect(shouldShowBottomNav("/dm/123?unread=1")).toBe(true);
      expect(shouldShowBottomNav("/members/u1")).toBe(true);
      expect(shouldShowBottomNav("/dms")).toBe(true);
    });

    it("respects explicit hideBottomNav and variant overrides", () => {
      expect(shouldShowBottomNav("/", { hideBottomNav: true })).toBe(false);
      expect(shouldShowBottomNav("/circles/123", { hideBottomNav: true })).toBe(
        false
      );
      expect(shouldShowBottomNav("/dm/123", { hideBottomNav: false })).toBe(true);
      expect(shouldShowBottomNav("/login", { hideBottomNav: false })).toBe(true);
      expect(shouldShowBottomNav("/custom", { variant: "login" })).toBe(false);
      expect(
        shouldShowBottomNav("/custom", { variant: "login", hideBottomNav: false })
      ).toBe(true);
    });
  });
});
