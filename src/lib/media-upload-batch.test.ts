import { describe, expect, it, vi } from "vitest";
import { MAX_FILE_BYTES, fileExceedsLimitMessage } from "@/lib/media-store";
import {
  DEFAULT_MEDIA_UPLOAD_CONCURRENCY,
  createMediaUploadItems,
  retryFailedMediaUploads,
  runMediaUploadBatch,
  type MediaUploadItem,
} from "@/lib/media-upload-batch";

function file(name: string, type = "video/mp4", size = 5): File {
  const value = new File(["bytes"], name, { type });
  Object.defineProperty(value, "size", { configurable: true, value: size });
  return value;
}

describe("media upload batches", () => {
  it("queues supported files and preserves every File.name exactly as its title", () => {
    const files = [
      file("Rhys Byrne 20-08-2026.mp4"),
      file("PLAYER NAME + DATE.MOV", "video/quicktime"),
    ];

    const items = createMediaUploadItems(files);

    expect(items.map((item) => item.title)).toEqual(files.map((item) => item.name));
    expect(items.map((item) => item.status)).toEqual(["queued", "queued"]);
    expect(items.map((item) => item.kind)).toEqual(["video", "video"]);
  });

  it("fails unsupported and oversized files without sending them to the uploader", async () => {
    const upload = vi.fn(async (item: { title: string }) => item.title);
    const items = createMediaUploadItems([
      file("valid.mp4"),
      file("notes.txt", "text/plain"),
      file("too-large.mp4", "video/mp4", MAX_FILE_BYTES + 1),
    ]);

    const result = await runMediaUploadBatch(items, { upload });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.map((item) => item.status)).toEqual(["succeeded", "failed", "failed"]);
    expect(result[1]?.validationError).toBe("Unsupported file type.");
    expect(result[2]?.validationError).toBe(fileExceedsLimitMessage(MAX_FILE_BYTES));
  });

  it("accepts a file of exactly 1 GB and rejects anything larger", () => {
    const items = createMediaUploadItems([
      file("exact-limit.mp4", "video/mp4", MAX_FILE_BYTES),
      file("over-limit.mp4", "video/mp4", MAX_FILE_BYTES + 1),
    ]);
    expect(items[0]?.status).toBe("queued");
    expect(items[1]?.status).toBe("failed");
    expect(items[1]?.validationError).toBe("File exceeds the 1 GB upload limit.");
  });

  it("uses a default maximum concurrency of two", async () => {
    let active = 0;
    let maximumActive = 0;
    const items = createMediaUploadItems(
      Array.from({ length: 7 }, (_, index) => file(`clip-${index + 1}.mp4`)),
    );

    const result = await runMediaUploadBatch(items, {
      upload: async (item) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return item.title;
      },
    });

    expect(DEFAULT_MEDIA_UPLOAD_CONCURRENCY).toBe(2);
    expect(maximumActive).toBe(2);
    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(result.every((item) => item.status === "succeeded")).toBe(true);
  });

  it("tracks progress per item and lets other files finish after one rejection", async () => {
    const updates: Array<Pick<MediaUploadItem<string>, "title" | "status" | "progress">> = [];
    const items = createMediaUploadItems<string>([
      file("first.mp4"),
      file("fails.mp4"),
      file("last.mp4"),
    ]);

    const result = await runMediaUploadBatch(items, {
      concurrency: 2,
      upload: async (item, onProgress) => {
        onProgress(item.title === "last.mp4" ? 0.75 : 0.25);
        if (item.title === "fails.mp4") throw new Error("Network dropped");
        return `asset:${item.title}`;
      },
      onItemUpdate: (item) => {
        updates.push({ title: item.title, status: item.status, progress: item.progress });
      },
    });

    expect(result.map((item) => item.status)).toEqual(["succeeded", "failed", "succeeded"]);
    expect(result[1]?.error).toBe("Network dropped");
    expect(result[2]?.result).toBe("asset:last.mp4");
    expect(updates).toContainEqual({ title: "first.mp4", status: "uploading", progress: 0.25 });
    expect(updates).toContainEqual({ title: "fails.mp4", status: "failed", progress: 0.25 });
    expect(updates).toContainEqual({ title: "last.mp4", status: "uploading", progress: 0.75 });
  });

  it("retries only failed valid uploads and leaves successes and invalid files untouched", async () => {
    const initial = await runMediaUploadBatch(
      createMediaUploadItems<string>([
        file("already-saved.mp4"),
        file("retry-me.mp4"),
        file("never-valid.txt", "text/plain"),
      ]),
      {
        upload: async (item) => {
          if (item.title === "retry-me.mp4") throw new Error("Temporary failure");
          return `first:${item.title}`;
        },
      },
    );
    const retryUpload = vi.fn(async (item: { title: string }) => `retry:${item.title}`);

    const retried = await retryFailedMediaUploads(initial, { upload: retryUpload });

    expect(retryUpload).toHaveBeenCalledTimes(1);
    expect(retryUpload.mock.calls[0]?.[0].title).toBe("retry-me.mp4");
    expect(retried.map((item) => item.status)).toEqual(["succeeded", "succeeded", "failed"]);
    expect(retried[0]?.result).toBe("first:already-saved.mp4");
    expect(retried[1]?.result).toBe("retry:retry-me.mp4");
    expect(retried[2]?.validationError).toBe("Unsupported file type.");
  });

  it("assigns a stable object path on first upload and reuses it on retry", async () => {
    const paths: string[] = [];
    const items = createMediaUploadItems([file("clip.mp4")]);
    const first = await runMediaUploadBatch(items, {
      resolveObjectPath: (item) => `unlinked/${item.id}-clip.mp4`,
      upload: async (item) => {
        paths.push(item.objectPath ?? "");
        throw new Error("Temporary failure");
      },
    });

    expect(first[0]?.objectPath).toBe(`unlinked/${items[0]!.id}-clip.mp4`);

    await retryFailedMediaUploads(first, {
      resolveObjectPath: () => "unlinked/should-not-change.mp4",
      upload: async (item) => {
        paths.push(item.objectPath ?? "");
        return "ok";
      },
    });

    expect(paths).toEqual([
      `unlinked/${items[0]!.id}-clip.mp4`,
      `unlinked/${items[0]!.id}-clip.mp4`,
    ]);
  });
});
