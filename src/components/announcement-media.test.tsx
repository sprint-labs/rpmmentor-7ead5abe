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

  it("retries a failed refresh before the retained signed URL expires", async () => {
    vi.useFakeTimers();
    createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: "https://example.test/first" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "temporary failure" } })
      .mockResolvedValueOnce({
        data: { signedUrl: "https://example.test/recovered" },
        error: null,
      });

    render(<AnnouncementMedia attachment={attachment} />);
    await act(async () => undefined);

    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: "Open update.png" }).getAttribute("href")).toBe(
      "https://example.test/first",
    );

    await act(async () => {
      vi.advanceTimersByTime(15 * 1000);
    });
    expect(createSignedUrl).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("link", { name: "Open update.png" }).getAttribute("href")).toBe(
      "https://example.test/recovered",
    );
  });

  it("retries when the signed-URL request rejects", async () => {
    vi.useFakeTimers();
    createSignedUrl.mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce({
      data: { signedUrl: "https://example.test/recovered" },
      error: null,
    });

    render(<AnnouncementMedia attachment={attachment} />);
    await act(async () => undefined);
    expect(createSignedUrl).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(15 * 1000);
    });
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: "Open update.png" }).getAttribute("href")).toBe(
      "https://example.test/recovered",
    );
  });

  it.each([
    { name: "update.mov", mime: "video/quicktime", element: "video" },
    { name: "update.aac", mime: "audio/aac", element: "audio" },
  ])("offers a direct link when the browser cannot decode $mime", ({ name, mime, element }) => {
    const { container } = render(
      <AnnouncementMedia
        attachment={{ ...attachment, name, mime }}
        previewUrl="https://example.test/media"
      />,
    );

    const link = screen.getByRole("link", { name: `Open attachment: ${name}` });
    expect(link.getAttribute("href")).toBe("https://example.test/media");
    expect(container.querySelector(element)?.contains(link)).toBe(false);
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
