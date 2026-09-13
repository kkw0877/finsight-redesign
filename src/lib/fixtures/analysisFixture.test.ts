import { beforeEach, describe, expect, it } from "vitest";
import {
  finishProcessing,
  getLatestResult,
  isProcessing,
  MOCK_ANALYSIS_RESULT,
  setLatestResult,
  startProcessing,
} from "./analysisFixture";

describe("analysisFixture", () => {
  beforeEach(() => {
    finishProcessing();
  });

  it("has no latest result before one is set", () => {
    expect(getLatestResult()).toBeNull();
  });

  it("returns the result that was set", () => {
    setLatestResult(MOCK_ANALYSIS_RESULT);
    expect(getLatestResult()).toEqual(MOCK_ANALYSIS_RESULT);
  });

  it("toggles the processing flag", () => {
    expect(isProcessing()).toBe(false);
    startProcessing();
    expect(isProcessing()).toBe(true);
    finishProcessing();
    expect(isProcessing()).toBe(false);
  });
});
