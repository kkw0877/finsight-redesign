import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";
import styles from "./Button.module.css";

describe("Button", () => {
  it("renders the label as button text", () => {
    render(<Button label="Save" />);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("defaults to md size, primary color, and solid variant", () => {
    render(<Button label="Save" />);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain(styles.md);
    expect(button.className).toContain(styles.primary);
    expect(button.className).toContain(styles.solid);
  });

  it("applies the requested size, color, and variant classes", () => {
    render(<Button label="Cancel" size="lg" color="assistive" variant="outlined" />);
    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button.className).toContain(styles.lg);
    expect(button.className).toContain(styles.assistive);
    expect(button.className).toContain(styles.outlined);
  });

  it("applies the fullWidth class only when fullWidth is true", () => {
    const { rerender } = render(<Button label="Save" />);
    expect(screen.getByRole("button", { name: "Save" }).className).not.toContain(
      styles.fullWidth
    );

    rerender(<Button label="Save" fullWidth />);
    expect(screen.getByRole("button", { name: "Save" }).className).toContain(styles.fullWidth);
  });

  it("merges a custom className with the generated classes", () => {
    render(<Button label="Save" className="custom-class" />);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("custom-class");
    expect(button.className).toContain(styles.button);
  });

  it("forwards native button props and fires onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button label="Save" onClick={onClick} disabled={false} />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("respects the disabled prop", () => {
    render(<Button label="Save" disabled />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("always renders with type=\"button\" so it never submits a form", () => {
    render(<Button label="Save" />);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });
});
