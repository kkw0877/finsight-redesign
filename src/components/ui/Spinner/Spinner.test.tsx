import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "./Spinner";
import styles from "./Spinner.module.css";

describe("Spinner", () => {
  it("renders with an accessible loading status role", () => {
    render(<Spinner />);
    const spinner = screen.getByRole("status", { name: "Loading" });
    expect(spinner).toBeInTheDocument();
    expect(spinner.className).toContain(styles.spinner);
  });

  it("defaults to a 24px size with a proportional border width", () => {
    render(<Spinner />);
    const spinner = screen.getByRole("status");
    expect(spinner.style.width).toBe("24px");
    expect(spinner.style.height).toBe("24px");
    expect(spinner.style.borderWidth).toBe("3px");
  });

  it("scales the border width with a custom size", () => {
    render(<Spinner size={40} />);
    const spinner = screen.getByRole("status");
    expect(spinner.style.width).toBe("40px");
    expect(spinner.style.height).toBe("40px");
    expect(spinner.style.borderWidth).toBe("5px");
  });

  it("enforces a minimum border width of 2px for small sizes", () => {
    render(<Spinner size={8} />);
    expect(screen.getByRole("status").style.borderWidth).toBe("2px");
  });

  it("applies a custom color and merges custom style with the size-derived style", () => {
    render(<Spinner color="red" style={{ marginTop: 4 }} />);
    const spinner = screen.getByRole("status");
    expect(spinner.style.color).toBe("red");
    expect(spinner.style.marginTop).toBe("4px");
    expect(spinner.style.width).toBe("24px");
  });

  it("merges a custom className with the generated class", () => {
    render(<Spinner className="custom-class" />);
    expect(screen.getByRole("status").className).toContain("custom-class");
  });
});
