import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoogleButton } from "./GoogleButton";

describe("GoogleButton", () => {
  it("renders the default label", () => {
    render(<GoogleButton />);
    expect(screen.getByText("Continue with Google")).toBeInTheDocument();
  });

  it("renders a custom label", () => {
    render(<GoogleButton label="Sign up with Google" />);
    expect(screen.getByText("Sign up with Google")).toBeInTheDocument();
  });

  it("renders the Google G logo", () => {
    const { container } = render(<GoogleButton />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("is a button element with type button", () => {
    render(<GoogleButton />);
    const button = screen.getByRole("button");
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });

  it("forwards native button props like onClick", async () => {
    const handleClick = vi.fn();
    render(<GoogleButton onClick={handleClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
