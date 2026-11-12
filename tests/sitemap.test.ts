import { describe, expect, it } from "vitest";
import { sitemapXML, isSitemapRouteIncluded } from "../src/lib/sitemap";
import { createRootRoute, createRoute } from "@tanstack/react-router";

describe("sitemap boundaries", () => {
  it("excludes authenticated descendants even if marked for inclusion", () => {
    const root = createRootRoute({ staticData: { sitemap: false } });
    const privateLayout = createRoute({
      getParentRoute: () => root,
      id: "private",
      staticData: { sitemap: "exclude-subtree" },
    });
    const child = createRoute({
      getParentRoute: () => privateLayout,
      path: "dashboard",
      staticData: { sitemap: true },
    });
    root.init({ originalIndex: 0 });
    privateLayout.init({ originalIndex: 0 });
    child.init({ originalIndex: 0 });
    expect(isSitemapRouteIncluded(child)).toBe(false);
  });
  it("rejects external or query-bearing paths", () => {
    expect(() => sitemapXML("https://hardcopy.tools", [{ path: "//elsewhere.test" }])).toThrow();
    expect(() => sitemapXML("https://hardcopy.tools", [{ path: "/auth?token=test" }])).toThrow();
  });
  it("deduplicates URLs and omits unproven change dates", () => {
    const xml = sitemapXML("https://hardcopy.tools", [{ path: "/draft" }, { path: "/draft" }]);
    expect(xml.match(/<loc>/g)).toHaveLength(1);
    expect(xml).toContain("https://hardcopy.tools/draft");
    expect(xml).not.toContain("lastmod");
  });
});
