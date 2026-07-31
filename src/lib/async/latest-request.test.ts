import { describe, expect, it } from "vitest";
import { LatestRequestGate } from "./latest-request";

describe("LatestRequestGate", () => {
  it("prevents a late response from repopulating cleared UI state", async () => {
    const gate = new LatestRequestGate();
    const originalRequest = gate.begin();
    let resolveResponse: (value: string) => void = () => undefined;
    const response = new Promise<string>((resolve) => {
      resolveResponse = resolve;
    });
    let displayedRewrite: string | null = null;
    const commitResponse = response.then((value) => {
      if (originalRequest.isCurrent()) displayedRewrite = value;
    });

    gate.invalidate();
    resolveResponse("Rewrite from the discarded recording");
    await commitResponse;

    expect(originalRequest.isCurrent()).toBe(false);
    expect(displayedRewrite).toBeNull();
  });

  it("allows only the newest request to update UI state", () => {
    const gate = new LatestRequestGate();
    const firstRequest = gate.begin();
    const secondRequest = gate.begin();

    expect(firstRequest.isCurrent()).toBe(false);
    expect(secondRequest.isCurrent()).toBe(true);
  });
});
