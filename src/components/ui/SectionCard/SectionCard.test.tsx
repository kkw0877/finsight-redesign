import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionCard } from "./SectionCard";
import styles from "./SectionCard.module.css";

describe("SectionCard", () => {
  it("renders children", () => {
    render(<SectionCard>Content</SectionCard>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("applies default card styling without the focused class", () => {
    render(<SectionCard data-testid="card">Content</SectionCard>);
    const card = screen.getByTestId("card");
    expect(card.className).toContain(styles.card);
    expect(card.className).not.toContain(styles.focused);
  });

  it("applies the focused class when focused is true", () => {
    render(
      <SectionCard focused data-testid="card">
        Content
      </SectionCard>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain(styles.focused);
  });

  it("merges a custom className with the generated classes", () => {
    render(
      <SectionCard className="custom-class" data-testid="card">
        Content
      </SectionCard>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("custom-class");
    expect(card.className).toContain(styles.card);
  });

  it("forwards native div props", () => {
    render(
      <SectionCard data-testid="card" title="tooltip">
        Content
      </SectionCard>,
    );
    const card = screen.getByTestId("card");
    expect(card).toHaveAttribute("title", "tooltip");
    expect(card.tagName).toBe("DIV");
  });
});
