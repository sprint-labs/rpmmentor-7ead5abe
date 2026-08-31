import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  session: {
    access_token: "session-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  } as { access_token: string; expires_at: number } | null,
  refreshedToken: "refreshed-token",
}));

const storageState = vi.hoisted(() => ({
  uploaded: [] as Array<{ path: string; contentType?: string }>,
}));

const tusState = vi.hoisted(() => ({
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
    auth: {
      getSession: async () => ({ data: { session: authState.session } }),
      refreshSession: async () => ({
        data: {
          session: authState.session
            ? { ...authState.session, access_token: authState.refreshedToken }
            : null,
        },
      }),
    },
    storage: {
      from: () => ({
        upload: async (path: string, _file: File, options?: { contentType?: string }) => {
          storageState.uploaded.push({ path, contentType: options?.contentType });
          return { error: null };
        },
        remove: async () => ({ error: null }),
      }),
    },
  },
}));

import { ANNOUNCEMENT_ATTACHMENT_MAX_BYTES } from "@/lib/support/schema";
import { uploadAnnouncementAttachment } from "@/lib/support/announcement-attachments";

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
    storageState.uploaded = [];
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
    expect(tusState.objectNames).toEqual([result.path]);
    expect(tusState.sizes).toEqual([result.size]);
    expect(storageState.uploaded).toHaveLength(0);
  });

  it("keeps supabase-js upload for files at or below 6 MB", async () => {
    const result = await uploadAnnouncementAttachment(
      attachment("note.pdf", 6 * 1024 * 1024, "application/pdf"),
    );

    expect(result.mime).toBe("application/pdf");
    expect(tusState.objectNames).toHaveLength(0);
    expect(storageState.uploaded).toEqual([{ path: result.path, contentType: "application/pdf" }]);
  });

  it("rejects files over 25 MB before contacting Storage", async () => {
    await expect(
      uploadAnnouncementAttachment(attachment("huge.mp4", ANNOUNCEMENT_ATTACHMENT_MAX_BYTES + 1)),
    ).rejects.toThrow("Attachments must be 25 MB or smaller.");
    expect(tusState.objectNames).toHaveLength(0);
    expect(storageState.uploaded).toHaveLength(0);
  });
});
