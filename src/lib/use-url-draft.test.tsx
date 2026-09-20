// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUrlDraft } from "./use-url-draft";

afterEach(() => {
  vi.useRealTimers();
});

describe("editing", () => {
  it("shows the new value at once and writes once the gesture settles", async () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useUrlDraft<number>(1, commit, 20));

    // A drag: one event per pixel.
    for (const value of [1.1, 1.4, 1.9, 2.3, 2.8]) {
      act(() => result.current[1](value));
    }

    // Immediate on screen, and nothing written yet.
    expect(result.current[0]).toBe(2.8);
    expect(commit).not.toHaveBeenCalled();

    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    expect(commit).toHaveBeenCalledWith(2.8);
  });

  it("writes nothing when the value is put back where it started", async () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useUrlDraft<string>("beadle", commit, 20));

    act(() => result.current[1]("beadl"));
    act(() => result.current[1]("beadle"));

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(commit).not.toHaveBeenCalled();
  });
});

describe("the committed value changing underneath", () => {
  it("adopts it — a back, forward, or Clear filters", async () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(({ committed }) => useUrlDraft(committed, commit, 20), {
      initialProps: { committed: "beadle" },
    });

    rerender({ committed: "" });

    await waitFor(() => expect(result.current[0]).toBe(""));
    // Adopting is not editing, so it must not be written back.
    expect(commit).not.toHaveBeenCalled();
  });

  it("does not bounce when the write we made arrives back", async () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(({ committed }) => useUrlDraft(committed, commit, 20), {
      initialProps: { committed: "" },
    });

    act(() => result.current[1]("beadle"));
    await waitFor(() => expect(commit).toHaveBeenCalledWith("beadle"));

    // The URL now reports what we just wrote.
    rerender({ committed: "beadle" });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(result.current[0]).toBe("beadle");
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

describe("a parent that re-renders mid-gesture", () => {
  it("does not stretch the wait by re-arming on a fresh callback", async () => {
    // `commit` is rebuilt on every render here, which is the shape a parent
    // passing an inline arrow has. If the timer depended on its identity, a
    // re-render per drag event would push the write out indefinitely.
    const calls: number[] = [];
    const { result, rerender } = renderHook(() =>
      useUrlDraft<number>(1, (value: number) => calls.push(value), 20),
    );

    act(() => result.current[1](2));
    rerender();
    rerender();

    await waitFor(() => expect(calls).toEqual([2]));
  });
});
