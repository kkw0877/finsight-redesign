import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { StatusIconCircle } from "./StatusIconCircle";
import styles from "./StatusIconCircle.module.css";

describe("StatusIconCircle", () => {
  it("renders a positive circle with the circle-check icon at default sizes", () => {
    const { container } = render(<StatusIconCircle tone="positive" />);
    const circle = container.firstChild as HTMLElement;
    expect(circle.className).toContain(styles.circle);
    expect(circle.className).toContain(styles.positive);
    expect(circle.style.width).toBe("56px");
    expect(circle.style.height).toBe("56px");
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("width")).toBe("26");
  });

  it("renders a negative circle with the triangle-alert icon", () => {
    const { container } = render(<StatusIconCircle tone="negative" />);
    const circle = container.firstChild as HTMLElement;
    expect(circle.className).toContain(styles.negative);
  });

  it("applies custom size and iconSize", () => {
    const { container } = render(<StatusIconCircle tone="positive" size={80} iconSize={40} />);
    const circle = container.firstChild as HTMLElement;
    expect(circle.style.width).toBe("80px");
    expect(circle.style.height).toBe("80px");
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("40");
  });

  it("merges a custom className with the generated classes", () => {
    const { container } = render(<StatusIconCircle tone="positive" className="custom-class" />);
    const circle = container.firstChild as HTMLElement;
    expect(circle.className).toContain("custom-class");
    expect(circle.className).toContain(styles.circle);
  });
});
