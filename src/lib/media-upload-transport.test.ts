import { beforeEach, describe, expect, it, vi } from "vitest";

const tusState = vi.hoisted(() => ({
  captured: [] as Array<{ file: File; options: Record<string, unknown> }>,
  previousUploads: [] as Array<{ uploadUrl: string }>,
  failWith: null as Error | null,
}));

vi.mock("tus-js-client", () => {
  class Upload {
    file: File;
    options: Record<string, unknown>;
    constructor(file: File, options: Record<string, unknown>) {
      this.file = file;
      this.options = options;
      tusState.captured.push({ file, options });
    }
    findPreviousUploads = async () => tusState.previousUploads;
    resumeFromPreviousUpload = vi.fn();
    start = () => {
      if (tusState.failWith) {
        (this.options.onError as (error: Error) => void)(tusState.failWith);
        return;
      }
      const onProgress = this.options.onProgress as (sent: number, total: number) => void;
      onProgress?.(Math.floor(this.file.size / 2), this.file.size);
      (this.options.onSuccess as () => void)();
    };
  }
  return { Upload };
});

import {
  TUS_CHUNK_SIZE_BYTES,
  TUS_RETRY_DELAYS,
  buildObjectPath,
  describeUploadError,
  fileExceedsLimitMessage,
  formatFileLimit,
  resumableUploadEndpoint,
  storageDirectOrigin,
  uploadObjectBytes,
} from "@/lib/media-upload-transport";

function clip(name: string, size: number, type = "video/mp4"): File {
  const file = new File(["clip"], name, { type });
  Object.defineProperty(file, "size", { configurable: true, value: size });
  return file;
}

describe("media upload transport helpers", () => {
  it("formats the shared 1 GB limit without decimals", () => {
    expect(formatFileLimit(1024 * 1024 * 1024)).toBe("1 GB");
    expect(fileExceedsLimitMessage(1024 * 1024 * 1024)).toBe(
      "File exceeds the 1 GB upload limit.",
    );
  });

  it("builds the direct Storage hostname and resumable endpoint", () => {
    const apiUrl = "https://zdxxezquhvpjmoxlecjp.supabase.co";
    expect(storageDirectOrigin(apiUrl)).toBe(
      "https://zdxxezquhvpjmoxlecjp.storage.supabase.co",
    );
    expect(resumableUploadEndpoint(apiUrl)).toBe(
      "https://zdxxezquhvpjmoxlecjp.storage.supabase.co/storage/v1/upload/resumable",
    );
  });

  it("keeps object paths unique and sanitised", () => {
    expect(buildObjectPath("gk-1", "Rhys Byrne 20-08-2026.mp4", "abc123")).toBe(
      "gk-1/abc123-Rhys_Byrne_20-08-2026.mp4",
    );
    expect(buildObjectPath(null, "clip.mov", "id-9")).toBe("unlinked/id-9-clip.mov");
  });

  it("maps size, session, permission, type and connection failures to useful copy", () => {
    const limit = "1 GB";
    expect(describeUploadError({ status: 413, message: "Payload too large" }, limit)).toMatch(
      /Global file size limit is 1 GB/,
    );
    expect(describeUploadError({ status: 401, message: "JWT expired" }, limit)).toBe(
      "Your session has expired. Sign in again and retry this clip.",
    );
    expect(
      describeUploadError({ status: 403, message: "new row violates row-level security" }, limit),
    ).toBe("You don't have permission to upload this clip. Ask an admin if this keeps happening.");
    expect(describeUploadError({ status: 415, message: "mime type not supported" }, limit)).toBe(
      "This file type isn't supported. Use video, audio, image, or PDF.",
    );
    expect(describeUploadError(new Error("Failed to fetch"), limit)).toBe(
      "The upload was interrupted. Check your connection and retry this clip.",
    );
  });
});

describe("uploadObjectBytes TUS path", () => {
  beforeEach(() => {
    tusState.captured = [];
    tusState.previousUploads = [];
    tusState.failWith = null;
  });

  it("uses the direct Storage hostname, 6 MB chunks and retry delays for large clips", async () => {
    const file = clip("large.mp4", 6 * 1024 * 1024 + 1);
    const progress: number[] = [];
    const getAccessToken = vi.fn(async () => "refreshed-token");

    await uploadObjectBytes({
      path: "unlinked/abc-large.mp4",
      file,
      onProgress: (fraction) => progress.push(fraction),
      getAccessToken,
      accessToken: "initial-token",
      supabaseUrl: "https://zdxxezquhvpjmoxlecjp.supabase.co",
      anonKey: "anon-key",
      bucket: "gk-media",
      limitLabel: "1 GB",
      standardUpload: vi.fn(),
    });

    expect(tusState.captured).toHaveLength(1);
    const options = tusState.captured[0]!.options;
    expect(options.endpoint).toBe(
      "https://zdxxezquhvpjmoxlecjp.storage.supabase.co/storage/v1/upload/resumable",
    );
    expect(options.chunkSize).toBe(TUS_CHUNK_SIZE_BYTES);
    expect(options.retryDelays).toEqual([...TUS_RETRY_DELAYS]);
    // tus-js-client applies these static headers and then runs
    // onBeforeRequest, and both go through XMLHttpRequest.setRequestHeader,
    // which combines a repeated header into "value1, value2". Setting the
    // token here as well made Storage reject an invalid compact JWS, so only
    // onBeforeRequest may send credentials.
    expect(options.headers).toEqual({ "x-upsert": "false" });
    expect(options.metadata).toMatchObject({
      bucketName: "gk-media",
      objectName: "unlinked/abc-large.mp4",
    });
    expect(progress[0]).toBeCloseTo(0.5, 5);
    expect(progress.at(-1)).toBe(1);

    const req = { setHeader: vi.fn() };
    await (options.onBeforeRequest as (request: { setHeader: (k: string, v: string) => void }) => Promise<void>)(
      req,
    );
    expect(getAccessToken).toHaveBeenCalled();
    expect(req.setHeader).toHaveBeenCalledWith("Authorization", "Bearer refreshed-token");
    expect(req.setHeader).toHaveBeenCalledWith("apikey", "anon-key");
    expect(req.setHeader).toHaveBeenCalledTimes(2);
  });

  it("resumes a previous TUS upload for the same object path", async () => {
    tusState.previousUploads = [{ uploadUrl: "https://tus.example/resume" }];
    const file = clip("large.mp4", 8 * 1024 * 1024);

    await uploadObjectBytes({
      path: "unlinked/same-path.mp4",
      file,
      getAccessToken: async () => "token",
      accessToken: "token",
      supabaseUrl: "https://zdxxezquhvpjmoxlecjp.supabase.co",
      anonKey: "anon-key",
      bucket: "gk-media",
      limitLabel: "1 GB",
      standardUpload: vi.fn(),
    });

    const upload = tusState.captured[0]!;
    expect(upload.options.metadata).toMatchObject({ objectName: "unlinked/same-path.mp4" });
  });

  it("does not use TUS for files at or below 6 MB", async () => {
    const standardUpload = vi.fn(async () => undefined);
    await uploadObjectBytes({
      path: "unlinked/small.mp4",
      file: clip("small.mp4", 6 * 1024 * 1024),
      getAccessToken: async () => "token",
      accessToken: "token",
      supabaseUrl: "https://zdxxezquhvpjmoxlecjp.supabase.co",
      anonKey: "anon-key",
      bucket: "gk-media",
      limitLabel: "1 GB",
      standardUpload,
    });
    expect(tusState.captured).toHaveLength(0);
    expect(standardUpload).toHaveBeenCalledTimes(1);
  });
});
