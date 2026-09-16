import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { uploadObjectBytes } from "@/lib/media-upload-transport";

/**
 * Credentialed Storage-API release gate for the dedicated Broadcast bucket.
 *
 * This suite intentionally writes temporary objects, so it runs only with an
 * explicit staging opt-in. Never point it at production:
 *   TEST_BROADCAST_STORAGE_TARGET=staging
 *   TEST_SUPER_ADMIN_EMAIL / TEST_SUPER_ADMIN_PASSWORD
 * Optional recipient check:
 *   TEST_MENTOR_EMAIL / TEST_MENTOR_PASSWORD
 */

const BUCKET = "gk-broadcast-media";
const MAX_BYTES = 25 * 1024 * 1024;
const RUN_ID = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const YEAR = new Date().getUTCFullYear();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const EXPECTED_STAGING_PROJECT_REF = "emyxyqqftwnjpcmctkpe";
const configuredProjectRef = /^https:\/\/([a-z0-9]+)\.supabase\.co(?:\/|$)/i.exec(
  SUPABASE_URL,
)?.[1];
const adminEmail = process.env.TEST_SUPER_ADMIN_EMAIL;
const adminPassword = process.env.TEST_SUPER_ADMIN_PASSWORD;
const mentorEmail = process.env.TEST_MENTOR_EMAIL;
const mentorPassword = process.env.TEST_MENTOR_PASSWORD;
const stagingRequested = process.env.TEST_BROADCAST_STORAGE_TARGET === "staging";
const explicitlyStaging = stagingRequested && configuredProjectRef === EXPECTED_STAGING_PROJECT_REF;
const canRun = Boolean(
  explicitlyStaging && SUPABASE_URL && SUPABASE_KEY && adminEmail && adminPassword,
);
const storageSuite = canRun ? describe : describe.skip;
const SHARED_BUCKET = "gk-media";

function makeClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

async function signIn(client: SupabaseClient, email: string, password: string) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
}

function path(label: string, extension = "pdf"): string {
  return `announcements/${YEAR}/${crypto.randomUUID()}-${RUN_ID}-${label}.${extension}`;
}

function bytes(size: number, type: string): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

function fileBytes(size: number, type: string, name: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

async function currentAccessToken(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error(`Could not read the staging session: ${error?.message ?? "missing token"}`);
  }
  return data.session.access_token;
}

async function uploadThroughAppTransport(
  client: SupabaseClient,
  objectPath: string,
  file: File,
): Promise<void> {
  const token = await currentAccessToken(client);
  await uploadObjectBytes({
    path: objectPath,
    file,
    accessToken: token,
    getAccessToken: () => currentAccessToken(client),
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_KEY,
    bucket: BUCKET,
    limitLabel: "25 MB",
    standardUpload: async () => {
      throw new Error("The exact-cap staging gate must exercise the application's TUS path.");
    },
  });
}

describe("gk-broadcast-media :: staging safety gate", () => {
  it("never enables credentialed writes for a project other than staging", () => {
    expect(stagingRequested && configuredProjectRef !== EXPECTED_STAGING_PROJECT_REF).toBe(false);
  });
});

storageSuite("gk-broadcast-media :: credentialed staging gate", () => {
  let admin: SupabaseClient;
  let mentor: SupabaseClient | null = null;
  const cleanup = new Set<string>();
  const sharedCleanup = new Set<string>();
  const privatePath = path("private");

  beforeAll(async () => {
    admin = makeClient();
    await signIn(admin, adminEmail!, adminPassword!);
    if (mentorEmail && mentorPassword) {
      mentor = makeClient();
      await signIn(mentor, mentorEmail, mentorPassword);
    }
  });

  afterAll(async () => {
    if (cleanup.size > 0) await admin.storage.from(BUCKET).remove([...cleanup]);
    if (sharedCleanup.size > 0) {
      await admin.storage.from(SHARED_BUCKET).remove([...sharedCleanup]);
    }
    await admin.auth.signOut();
    await mentor?.auth.signOut();
  });

  it("accepts an allowed object exactly at the 25 MiB cap through TUS", async () => {
    const cappedPath = path("exact-cap");
    await uploadThroughAppTransport(
      admin,
      cappedPath,
      fileBytes(MAX_BYTES, "application/pdf", "exact-cap.pdf"),
    );
    cleanup.add(cappedPath);
  }, 120_000);

  it("rejects one byte over the bucket cap through TUS", async () => {
    const oversizedPath = path("over-cap");
    const attempt = uploadThroughAppTransport(
      admin,
      oversizedPath,
      fileBytes(MAX_BYTES + 1, "application/pdf", "over-cap.pdf"),
    ).then(() => cleanup.add(oversizedPath));
    await expect(attempt).rejects.toThrow();
  }, 120_000);

  it("rejects a MIME type outside the bucket allowlist", async () => {
    const disallowedPath = path("disallowed", "txt");
    const { data, error } = await admin.storage
      .from(BUCKET)
      .upload(disallowedPath, bytes(16, "text/plain"), { upsert: false });
    if (data?.path) cleanup.add(disallowedPath);
    expect(data).toBeFalsy();
    expect(error).toBeTruthy();
  });

  it("rejects cross-bucket copy even when its metadata passes size and MIME checks", async () => {
    const sourcePath = `broadcast-security/${YEAR}/${crypto.randomUUID()}-${RUN_ID}-copy.pdf`;
    const destinationPath = path("copied-object");
    const upload = await admin.storage
      .from(SHARED_BUCKET)
      .upload(sourcePath, bytes(16, "application/pdf"), { upsert: false });
    if (upload.data?.path) sharedCleanup.add(sourcePath);
    expect(upload.error).toBeNull();

    const copied = await admin.storage
      .from(SHARED_BUCKET)
      .copy(sourcePath, destinationPath, { destinationBucket: BUCKET });
    if (copied.data?.path) cleanup.add(destinationPath);
    expect(copied.data).toBeFalsy();
    expect(copied.error).toBeTruthy();

    const destinationInfo = await admin.storage.from(BUCKET).info(destinationPath);
    expect(destinationInfo.data).toBeFalsy();
    expect(destinationInfo.error).toBeTruthy();
  });

  it("rejects signed-upload URL minting for the dedicated bucket", async () => {
    const signedPath = path("signed-upload");
    const signed = await admin.storage.from(BUCKET).createSignedUploadUrl(signedPath, {
      upsert: false,
    });
    expect(signed.data).toBeFalsy();
    expect(signed.error).toBeTruthy();
  });

  it("rejects cross-bucket move without deleting its source", async () => {
    const sourcePath = `broadcast-security/${YEAR}/${crypto.randomUUID()}-${RUN_ID}-move.pdf`;
    const destinationPath = path("moved-object");
    const upload = await admin.storage
      .from(SHARED_BUCKET)
      .upload(sourcePath, bytes(16, "application/pdf"), { upsert: false });
    if (upload.data?.path) sharedCleanup.add(sourcePath);
    expect(upload.error).toBeNull();

    const moved = await admin.storage
      .from(SHARED_BUCKET)
      .move(sourcePath, destinationPath, { destinationBucket: BUCKET });
    if (moved.data) cleanup.add(destinationPath);
    expect(moved.data).toBeFalsy();
    expect(moved.error).toBeTruthy();

    const sourceInfo = await admin.storage.from(SHARED_BUCKET).info(sourcePath);
    expect(sourceInfo.error).toBeNull();
    expect(sourceInfo.data).toBeTruthy();

    const destinationInfo = await admin.storage.from(BUCKET).info(destinationPath);
    expect(destinationInfo.data).toBeFalsy();
    expect(destinationInfo.error).toBeTruthy();
  });

  it("keeps an unlinked object private and immutable but removable", async () => {
    const upload = await admin.storage
      .from(BUCKET)
      .upload(privatePath, bytes(16, "application/pdf"), { upsert: false });
    expect(upload.error).toBeNull();
    cleanup.add(privatePath);

    const replacement = await admin.storage
      .from(BUCKET)
      .update(privatePath, bytes(16, "application/pdf"));
    expect(replacement.error).toBeTruthy();

    if (mentor) {
      const download = await mentor.storage.from(BUCKET).download(privatePath);
      expect(download.data).toBeFalsy();
      expect(download.error).toBeTruthy();
    }

    const removal = await admin.storage.from(BUCKET).remove([privatePath]);
    expect(removal.error).toBeNull();
    expect(removal.data).toHaveLength(1);
    cleanup.delete(privatePath);
  });
});
