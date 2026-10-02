import { expect, it } from "vitest";
import { smokeAdd } from "./smoke-oncall";

it("adds", () => {
  expect(smokeAdd(1, 2)).toBe(4);
});
