import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Chip } from "./Chip";
import styles from "./Chip.module.css";

describe("Chip", () => {
  it("renders the text content", () => {
    render(<Chip text="Filter" />);
    expect(screen.getByText("Filter")).toBeInTheDocument();
  });

  it("defaults to sm size, outlined variant, and unselected", () => {
    render(<Chip text="Filter" />);
    const chip = screen.getByText("Filter");
    expect(chip.className).toContain(styles.sm);
    expect(chip.className).toContain(styles.outlined);
    expect(chip.className).not.toContain(styles.selected);
  });

  it("applies the selected class when selected is true", () => {
    render(<Chip text="Filter" selected />);
    expect(screen.getByText("Filter").className).toContain(styles.selected);
  });

  it("applies the requested size and variant classes", () => {
    render(<Chip text="Filter" size="md" variant="solid" />);
    const chip = screen.getByText("Filter");
    expect(chip.className).toContain(styles.md);
    expect(chip.className).toContain(styles.solid);
  });

  it("merges a custom className with the generated classes", () => {
    render(<Chip text="Filter" className="custom-class" />);
    const chip = screen.getByText("Filter");
    expect(chip.className).toContain("custom-class");
    expect(chip.className).toContain(styles.chip);
  });
});
