import { describe, expect, it } from "vitest";
import { Button, Badge, Chip, Spinner, Icon } from "./index";

describe("ui barrel exports", () => {
  it("re-exports every component defined in src/components/ui", () => {
    expect(Button).toBeTypeOf("function");
    expect(Badge).toBeTypeOf("function");
    expect(Chip).toBeTypeOf("function");
    expect(Spinner).toBeTypeOf("function");
    expect(Icon).toBeTypeOf("function");
  });
});
