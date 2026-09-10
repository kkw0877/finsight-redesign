import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";
import styles from "./Badge.module.css";

describe("Badge", () => {
  it("renders the text content", () => {
    render(<Badge text="New" />);
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("defaults to sm size, solid variant, and blue tone", () => {
    render(<Badge text="New" />);
    const badge = screen.getByText("New");
    expect(badge.className).toContain(styles.sm);
    expect(badge.className).toContain(styles.solid);
    expect(badge.className).toContain(styles.blue);
  });

  it("applies the requested tone, variant, and size classes", () => {
    render(<Badge text="Alert" tone="negative" variant="outlined" size="md" />);
    const badge = screen.getByText("Alert");
    expect(badge.className).toContain(styles.negative);
    expect(badge.className).toContain(styles.outlined);
    expect(badge.className).toContain(styles.md);
  });

  it("merges a custom className with the generated classes", () => {
    render(<Badge text="New" className="custom-class" />);
    const badge = screen.getByText("New");
    expect(badge.className).toContain("custom-class");
    expect(badge.className).toContain(styles.badge);
  });

  it("forwards native span props", () => {
    render(<Badge text="New" data-testid="badge" title="tooltip" />);
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("title", "tooltip");
    expect(badge.tagName).toBe("SPAN");
  });
});
