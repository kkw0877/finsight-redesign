import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UsageBadge } from "./UsageBadge";
import styles from "./UsageBadge.module.css";

describe("UsageBadge", () => {
  it("renders the text content", () => {
    render(<UsageBadge text="Free analyses 1/2 left" />);
    expect(screen.getByText("Free analyses 1/2 left")).toBeInTheDocument();
  });

  it("defaults to the non-warn style", () => {
    render(<UsageBadge text="1/2 left" />);
    const badge = screen.getByText("1/2 left");
    expect(badge.className).toContain(styles.badge);
    expect(badge.className).not.toContain(styles.warn);
  });

  it("applies the warn style when warn is true", () => {
    render(<UsageBadge text="0/2 left" warn />);
    const badge = screen.getByText("0/2 left");
    expect(badge.className).toContain(styles.warn);
  });

  it("merges a custom className with the generated classes", () => {
    render(<UsageBadge text="1/2 left" className="custom-class" />);
    const badge = screen.getByText("1/2 left");
    expect(badge.className).toContain("custom-class");
    expect(badge.className).toContain(styles.badge);
  });
});
