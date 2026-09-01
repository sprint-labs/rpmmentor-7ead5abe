// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnnouncementAttachment } from "@/lib/support/schema";
import { AnnouncementMedia } from "./announcement-media";

const { createSignedUrl } = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({ createSignedUrl }),
    },
  },
}));

const attachment: AnnouncementAttachment = {
  path: "announcements/2026/update.png",
  name: "update.png",
  mime: "image/png",
  size: 1024,
};

describe("AnnouncementMedia", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("refreshes a signed media URL before its five minute expiry", async () => {
    vi.useFakeTimers();
    createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: "https://example.test/first" }, error: null })
      .mockResolvedValueOnce({
        data: { signedUrl: "https://example.test/refreshed" },
        error: null,
      });

    render(<AnnouncementMedia attachment={attachment} />);
    await act(async () => undefined);

    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Open update.png" }).getAttribute("href")).toBe(
      "https://example.test/first",
    );

    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });

    expect(createSignedUrl).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: "Open update.png" }).getAttribute("href")).toBe(
      "https://example.test/refreshed",
    );
  });

  it("refreshes a playing stream before expiry and resumes at its previous position", async () => {
    vi.useFakeTimers();
    createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: "https://example.test/first" }, error: null })
      .mockResolvedValueOnce({
        data: { signedUrl: "https://example.test/refreshed" },
        error: null,
      });

    const { container } = render(
      <AnnouncementMedia attachment={{ ...attachment, name: "update.mp4", mime: "video/mp4" }} />,
    );
    await act(async () => undefined);

    const video = container.querySelector("video");
    expect(video?.getAttribute("src")).toBe("https://example.test/first");
    const play = vi.spyOn(video!, "play").mockResolvedValue();
    video!.currentTime = 137;
    fireEvent.play(video!);

    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });

    expect(video?.getAttribute("src")).toBe("https://example.test/refreshed");
    video!.currentTime = 0;
    fireEvent.loadedMetadata(video!);
    expect(video?.currentTime).toBe(137);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("preserves a paused stream position during a scheduled URL refresh", async () => {
    vi.useFakeTimers();
    createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: "https://example.test/first" }, error: null })
      .mockResolvedValueOnce({
        data: { signedUrl: "https://example.test/refreshed" },
        error: null,
      });

    const { container } = render(
      <AnnouncementMedia attachment={{ ...attachment, name: "update.mp4", mime: "video/mp4" }} />,
    );
    await act(async () => undefined);

    const video = container.querySelector("video");
    const play = vi.spyOn(video!, "play").mockResolvedValue();
    video!.currentTime = 82;

    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });

    expect(video?.getAttribute("src")).toBe("https://example.test/refreshed");
    video!.currentTime = 0;
    fireEvent.loadedMetadata(video!);
    expect(video?.currentTime).toBe(82);
    expect(play).not.toHaveBeenCalled();
  });
});
