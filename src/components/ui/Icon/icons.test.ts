import { describe, expect, it } from "vitest";
import { icons } from "./icons";

describe("icons registry", () => {
  it("defines an entry for every declared IconName", () => {
    expect(Object.keys(icons).sort()).toEqual(["circle-check", "triangle-alert"]);
  });

  it("gives every icon a non-empty viewBox and svg path", () => {
    for (const glyph of Object.values(icons)) {
      expect(glyph.viewBox).toMatch(/^\d+ \d+ \d+ \d+$/);
      expect(glyph.path.length).toBeGreaterThan(0);
    }
  });
});
