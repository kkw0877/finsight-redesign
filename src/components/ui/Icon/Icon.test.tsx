import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Icon } from "./Icon";
import { icons } from "./icons";

describe("Icon", () => {
  it("renders an svg with the glyph's viewBox and path", () => {
    const { container } = render(<Icon name="circle-check" />);
    const svg = container.querySelector("svg");
    const path = container.querySelector("path");

    expect(svg).toHaveAttribute("viewBox", icons["circle-check"].viewBox);
    expect(path).toHaveAttribute("d", icons["circle-check"].path);
  });

  it("defaults to a 20px square size", () => {
    const { container } = render(<Icon name="triangle-alert" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "20");
    expect(svg).toHaveAttribute("height", "20");
  });

  it("applies a custom size to both width and height", () => {
    const { container } = render(<Icon name="triangle-alert" size={32} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
  });

  it("is hidden from assistive tech by default and forwards extra svg props", () => {
    const { container } = render(<Icon name="triangle-alert" aria-hidden="false" className="custom-class" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("aria-hidden", "false");
    expect(svg).toHaveClass("custom-class");
  });
});
