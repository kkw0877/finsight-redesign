import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileRowCard } from "./FileRowCard";

describe("FileRowCard", () => {
  it("renders the file name and size", () => {
    render(<FileRowCard fileName="statement.csv" fileSize="1.2MB" />);
    expect(screen.getByText("statement.csv")).toBeInTheDocument();
    expect(screen.getByText("1.2MB")).toBeInTheDocument();
  });

  it("does not show the verified badge by default", () => {
    render(<FileRowCard fileName="statement.csv" fileSize="1.2MB" />);
    expect(screen.queryByText("Format verified")).not.toBeInTheDocument();
  });

  it("shows the verified badge when verified is true", () => {
    render(<FileRowCard fileName="statement.csv" fileSize="1.2MB" verified />);
    expect(screen.getByText("Format verified")).toBeInTheDocument();
  });

  it("merges a custom className with the generated classes", () => {
    const { container } = render(
      <FileRowCard fileName="statement.csv" fileSize="1.2MB" className="custom-class" />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("custom-class");
  });
});
