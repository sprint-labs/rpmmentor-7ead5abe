import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  session: {
    access_token: "session-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  } as { access_token: string; expires_at: number } | null,
  refreshedToken: "refreshed-token",
  sessionRequests: 0,
}));

const storageState = vi.hoisted(() => ({
  buckets: [] as string[],
  uploaded: [] as Array<{ path: string; contentType?: string }>,
  removed: [] as string[],
}));

const capabilityState = vi.hoisted(() => ({
  ready: true as boolean | null,
  error: null as { message: string } | null,
  throws: false,
  calls: [] as string[],
}));

const tusState = vi.hoisted(() => ({
  bucketNames: [] as string[],
  objectNames: [] as string[],
  sizes: [] as number[],
}));

vi.mock("tus-js-client", () => {
  class Upload {
    file: File;
    options: Record<string, unknown>;
    constructor(file: File, options: Record<string, unknown>) {
      this.file = file;
      this.options = options;
      tusState.objectNames.push(
        (options.metadata as { objectName?: string } | undefined)?.objectName ?? "",
      );
      tusState.bucketNames.push(
        (options.metadata as { bucketName?: string } | undefined)?.bucketName ?? "",
      );
      tusState.sizes.push(file.size);
    }
    findPreviousUploads = async () => [];
    resumeFromPreviousUpload = vi.fn();
    start = () => {
      (this.options.onSuccess as () => void)();
    };
  }
  return { Upload };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string) => {
      capabilityState.calls.push(name);
      if (capabilityState.throws) throw new Error("network unavailable");
      return { data: capabilityState.ready, error: capabilityState.error };
    },
    auth: {
      getSession: async () => {
        authState.sessionRequests += 1;
        return { data: { session: authState.session } };
      },
      refreshSession: async () => ({
        data: {
          session: authState.session
            ? { ...authState.session, access_token: authState.refreshedToken }
            : null,
        },
      }),
    },
    storage: {
      from: (bucket: string) => {
        storageState.buckets.push(bucket);
        return {
          upload: async (path: string, _file: File, options?: { contentType?: string }) => {
            storageState.uploaded.push({ path, contentType: options?.contentType });
            return { error: null };
          },
          remove: async (paths: string[]) => {
            storageState.removed.push(...paths);
            return { error: null };
          },
        };
      },
    },
  },
}));

import { ANNOUNCEMENT_ATTACHMENT_MAX_BYTES } from "@/lib/support/schema";
import {
  announcementAttachmentMime,
  removeUnlinkedAnnouncementAttachment,
  uploadAnnouncementAttachment,
} from "@/lib/support/announcement-attachments";

function attachment(name: string, size: number, type = "video/mp4"): File {
  const file = new File(["bytes"], name, { type });
  Object.defineProperty(file, "size", { configurable: true, value: size });
  return file;
}

describe("uploadAnnouncementAttachment", () => {
  beforeEach(() => {
    authState.session = {
      access_token: "session-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    authState.sessionRequests = 0;
    storageState.buckets = [];
    storageState.uploaded = [];
    storageState.removed = [];
    capabilityState.ready = true;
    capabilityState.error = null;
    capabilityState.throws = false;
    capabilityState.calls = [];
    tusState.bucketNames = [];
    tusState.objectNames = [];
    tusState.sizes = [];
    vi.stubEnv("VITE_SUPABASE_URL", "https://zdxxezquhvpjmoxlecjp.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-key");
  });

  it("uses TUS for attachments larger than 6 MB and still within the 25 MB cap", async () => {
    const result = await uploadAnnouncementAttachment(attachment("clip.mp4", 6 * 1024 * 1024 + 1));

    expect(result.name).toBe("clip.mp4");
    expect(result.size).toBe(6 * 1024 * 1024 + 1);
    expect(result.path).toMatch(/^announcements\/\d{4}\//);
    expect(tusState.bucketNames).toEqual(["gk-broadcast-media"]);
    expect(tusState.objectNames).toEqual([result.path]);
    expect(tusState.sizes).toEqual([result.size]);
    expect(storageState.uploaded).toHaveLength(0);
  });

  it("keeps supabase-js upload for files at or below 6 MB", async () => {
    const result = await uploadAnnouncementAttachment(
      attachment("note.pdf", 6 * 1024 * 1024, "application/pdf"),
    );

    expect(result.mime).toBe("application/pdf");
    expect(storageState.buckets).toEqual(["gk-broadcast-media"]);
    expect(tusState.objectNames).toHaveLength(0);
    expect(storageState.uploaded).toEqual([{ path: result.path, contentType: "application/pdf" }]);
  });

  it("infers preview and upload MIME from an allowed extension when the browser omits it", () => {
    expect(announcementAttachmentMime(attachment("preview.png", 1024, ""))).toBe("image/png");
  });

  it("rejects files over 25 MB before contacting Storage", async () => {
    await expect(
      uploadAnnouncementAttachment(attachment("huge.mp4", ANNOUNCEMENT_ATTACHMENT_MAX_BYTES + 1)),
    ).rejects.toThrow("Attachments must be 25 MB or smaller.");
    expect(tusState.objectNames).toHaveLength(0);
    expect(storageState.uploaded).toHaveLength(0);
  });

  it("rejects a misleading extension when the browser reports a disallowed MIME type", async () => {
    await expect(
      uploadAnnouncementAttachment(attachment("notice.pdf", 1024, "text/html")),
    ).rejects.toThrow("Use an image, MP4, MOV, WebM, audio file or PDF.");
    expect(tusState.objectNames).toHaveLength(0);
    expect(storageState.uploaded).toHaveLength(0);
  });

  it("fails closed before upload when the storage-hardening marker is unavailable", async () => {
    capabilityState.ready = null;
    capabilityState.error = { message: "function does not exist" };

    await expect(
      uploadAnnouncementAttachment(attachment("notice.pdf", 1024, "application/pdf")),
    ).rejects.toThrow("Media attachments are unavailable");
    expect(capabilityState.calls).toEqual(["announcement_media_storage_ready_v2"]);
    expect(authState.sessionRequests).toBe(0);
    expect(tusState.objectNames).toHaveLength(0);
    expect(storageState.uploaded).toHaveLength(0);
  });

  it("fails closed before upload when the readiness check cannot complete", async () => {
    capabilityState.throws = true;

    await expect(
      uploadAnnouncementAttachment(attachment("notice.pdf", 1024, "application/pdf")),
    ).rejects.toThrow("Media attachments are unavailable");
    expect(authState.sessionRequests).toBe(0);
    expect(tusState.objectNames).toHaveLength(0);
    expect(storageState.uploaded).toHaveLength(0);
  });

  it("can remove a definitely unlinked upload before create begins", async () => {
    const uploaded = await uploadAnnouncementAttachment(
      attachment("notice.pdf", 1024, "application/pdf"),
    );

    await removeUnlinkedAnnouncementAttachment(uploaded);
    expect(storageState.removed).toEqual([uploaded.path]);
  });
});
