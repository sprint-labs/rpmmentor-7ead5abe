import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";

const authState = vi.hoisted(() => ({
  session: {
    access_token: "session-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  } as { access_token: string; expires_at: number } | null,
  refreshedToken: "refreshed-token",
}));

const storageState = vi.hoisted(() => ({
  uploaded: [] as string[],
  removed: [] as string[][],
  insertError: null as { message: string } | null,
  inserted: [] as Array<Record<string, unknown>>,
}));

const tusState = vi.hoisted(() => ({
  objectNames: [] as string[],
  tokens: [] as string[],
}));

vi.mock("tus-js-client", () => {
  class Upload {
    options: Record<string, unknown>;
    constructor(_file: File, options: Record<string, unknown>) {
      this.options = options;
      tusState.objectNames.push(
        (options.metadata as { objectName?: string } | undefined)?.objectName ?? "",
      );
    }
    findPreviousUploads = async () => [];
    resumeFromPreviousUpload = vi.fn();
    start = () => {
      // Mirrors tus-js-client: the static `headers` are applied first, then
      // `onBeforeRequest` runs, and both go through
      // XMLHttpRequest.setRequestHeader, which combines a repeated header into
      // "value1, value2" rather than replacing it.
      const headers: Record<string, string> = {
        ...((this.options.headers as Record<string, string> | undefined) ?? {}),
      };
      const req = {
        getMethod: () => "POST",
        getHeader: (name: string) => headers[name],
        setHeader: (name: string, value: string) => {
          headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
        },
      };
      const onBeforeRequest = this.options.onBeforeRequest as
        | ((request: typeof req) => Promise<void>)
        | undefined;
      void Promise.resolve(onBeforeRequest?.(req)).then(() => {
        tusState.tokens.push(headers.Authorization ?? "");
        (this.options.onSuccess as () => void)();
      });
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
        upload: async (path: string) => {
          storageState.uploaded.push(path);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          storageState.removed.push(paths);
          return { error: null };
        },
      }),
    },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (table === "media_assets") {
          if (storageState.insertError) {
            return {
              select: () => ({
                single: async () => ({ data: null, error: storageState.insertError }),
              }),
            };
          }
          const data = { id: "asset-1", ...row };
          storageState.inserted.push(data);
          return {
            select: () => ({
              single: async () => ({ data, error: null }),
            }),
          };
        }
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

import {
  MAX_FILE_BYTES,
  fileExceedsLimitMessage,
  formatFileLimit,
  getUploadAccessToken,
  uploadMedia,
} from "@/lib/media-store";

const USER: SessionUser = {
  id: "user-1",
  name: "Mentor",
  email: "mentor@example.com",
  role: "mentor",
  initials: "M",
  title: "Mentor",
};

function clip(name: string, size: number): File {
  const file = new File(["bytes"], name, { type: "video/mp4" });
  Object.defineProperty(file, "size", { configurable: true, value: size });
  return file;
}

describe("media store upload limits and records", () => {
  beforeEach(() => {
    authState.session = {
      access_token: "session-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    authState.refreshedToken = "refreshed-token";
    storageState.uploaded = [];
    storageState.removed = [];
    storageState.insertError = null;
    storageState.inserted = [];
    tusState.objectNames = [];
    tusState.tokens = [];
    vi.stubEnv("VITE_SUPABASE_URL", "https://zdxxezquhvpjmoxlecjp.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-key");
  });

  it("accepts a file of exactly 1 GB and rejects anything larger", async () => {
    expect(formatFileLimit(MAX_FILE_BYTES)).toBe("1 GB");
    expect(fileExceedsLimitMessage(MAX_FILE_BYTES)).toBe("File exceeds the 1 GB upload limit.");

    await expect(
      uploadMedia({
        file: clip("too-big.mp4", MAX_FILE_BYTES + 1),
        gkId: null,
        title: "too-big.mp4",
        kind: "video",
        user: USER,
      }),
    ).rejects.toThrow("File exceeds the 1 GB upload limit.");
    expect(tusState.objectNames).toHaveLength(0);

    const asset = await uploadMedia({
      file: clip("max.mp4", MAX_FILE_BYTES),
      gkId: null,
      title: "max.mp4",
      kind: "video",
      user: USER,
      objectPath: "unlinked/stable-max.mp4",
    });
    expect(asset.id).toBe("asset-1");
    expect(storageState.inserted[0]?.file_path).toBe("unlinked/stable-max.mp4");
  });

  it("supplies a refreshed token for large TUS uploads and reuses the object path on retry", async () => {
    authState.session = {
      access_token: "expired-token",
      expires_at: Math.floor(Date.now() / 1000) - 10,
    };
    const file = clip("large.mp4", 8 * 1024 * 1024);
    const path = "unlinked/stable-large.mp4";

    await uploadMedia({
      file,
      gkId: null,
      title: "large.mp4",
      kind: "video",
      user: USER,
      objectPath: path,
    });
    await uploadMedia({
      file,
      gkId: null,
      title: "large.mp4",
      kind: "video",
      user: USER,
      objectPath: path,
    });

    expect(tusState.objectNames).toEqual([path, path]);
    expect(tusState.tokens.every((token) => token === "Bearer refreshed-token")).toBe(true);
  });

  it("refreshes an expiring session token before upload", async () => {
    authState.session = {
      access_token: "old-token",
      expires_at: Math.floor(Date.now() / 1000) + 10,
    };
    const token = await getUploadAccessToken(false);
    expect(token).toBe("refreshed-token");
  });

  it("attempts object cleanup when the media_assets insert fails", async () => {
    storageState.insertError = { message: "insert failed" };
    await expect(
      uploadMedia({
        file: clip("clip.mp4", 1024),
        gkId: "gk-1",
        title: "clip.mp4",
        kind: "video",
        user: USER,
        objectPath: "gk-1/stable-clip.mp4",
      }),
    ).rejects.toThrow("Could not save media record: insert failed");
    expect(storageState.removed.some((paths) => paths.includes("gk-1/stable-clip.mp4"))).toBe(
      true,
    );
  });

  it("stores unlinked clips under the unlinked folder", async () => {
    await uploadMedia({
      file: clip("solo.mp4", 2048),
      gkId: null,
      title: "solo.mp4",
      kind: "video",
      user: USER,
    });
    expect(String(storageState.inserted[0]?.file_path)).toMatch(/^unlinked\//);
    expect(storageState.inserted[0]?.gk_id).toBeNull();
  });
});
