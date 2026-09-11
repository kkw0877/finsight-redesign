import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UploadDropzone } from "./UploadDropzone";
import styles from "./UploadDropzone.module.css";

describe("UploadDropzone", () => {
  it("renders children", () => {
    render(<UploadDropzone>Drop your file here</UploadDropzone>);
    expect(screen.getByText("Drop your file here")).toBeInTheDocument();
  });

  it("applies the dropzone styling", () => {
    render(<UploadDropzone data-testid="dropzone">Content</UploadDropzone>);
    const dropzone = screen.getByTestId("dropzone");
    expect(dropzone.className).toContain(styles.dropzone);
  });

  it("merges a custom className with the generated classes", () => {
    render(
      <UploadDropzone className="custom-class" data-testid="dropzone">
        Content
      </UploadDropzone>,
    );
    const dropzone = screen.getByTestId("dropzone");
    expect(dropzone.className).toContain("custom-class");
    expect(dropzone.className).toContain(styles.dropzone);
  });

  it("forwards native div props", () => {
    render(
      <UploadDropzone data-testid="dropzone" title="tooltip">
        Content
      </UploadDropzone>,
    );
    const dropzone = screen.getByTestId("dropzone");
    expect(dropzone).toHaveAttribute("title", "tooltip");
  });
});
