import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Automated tests for gk-media bucket RLS.
 *
 * Policies under test:
 *   - anon:          no access to any storage.objects row in gk-media
 *   - authenticated: normal media access remains role/owner scoped
 *   - announcements: the retired reserved prefix denies every authenticated role
 *   - super_admin:   full access, including DELETE of files owned by other users
 *
 * Requires env vars (in .env.local, not committed):
 *   TEST_MENTOR_EMAIL / TEST_MENTOR_PASSWORD
 *   TEST_SUPER_ADMIN_EMAIL / TEST_SUPER_ADMIN_PASSWORD
 * Missing pairs cause the corresponding block to skip.
 */

const BUCKET = "gk-media";
const RUN_ID = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = `automated-tests/${RUN_ID}`;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";

// These suites talk to a live Supabase project. Without a URL and key there is
// nothing to talk to, so skip rather than fail: the credentials live in
// .env.local and are deliberately absent from CI.
const hasSupabaseEnv = Boolean(SUPABASE_URL && SUPABASE_KEY);
const anonSuite = hasSupabaseEnv ? describe : describe.skip;

function makeClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
  });
}

async function signIn(client: SupabaseClient, email: string, password: string) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  }
  return data;
}

function fileBlob(text: string): Blob {
  return new Blob([text], { type: "text/plain" });
}

// ---------------------------------------------------------------------------
// anon
// ---------------------------------------------------------------------------

anonSuite("gk-media :: anon (unauthenticated)", () => {
  let client: SupabaseClient;
  const path = `${PREFIX}/anon-attempt.txt`;

  beforeAll(() => {
    client = makeClient();
  });

  it("cannot upload to gk-media", async () => {
    const { error } = await client.storage.from(BUCKET).upload(path, fileBlob("anon-upload"));
    expect(error).toBeTruthy();
  });

  it("cannot list objects in gk-media (empty or error)", async () => {
    const { data, error } = await client.storage.from(BUCKET).list(PREFIX);
    // Either the API rejects, or RLS filters everything out.
    if (!error) {
      expect(data).toEqual([]);
    }
  });

  it("cannot download an object in gk-media", async () => {
    const { data, error } = await client.storage.from(BUCKET).download(`${PREFIX}/nonexistent.txt`);
    expect(data).toBeFalsy();
    expect(error).toBeTruthy();
  });

  it("cannot delete objects in gk-media", async () => {
    const { data, error } = await client.storage.from(BUCKET).remove([`${PREFIX}/anything.txt`]);
    // Either it errors, or RLS filters and returns 0 removed rows.
    if (!error) {
      expect(data ?? []).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// authenticated (mentor role)
// ---------------------------------------------------------------------------

const mentorEmail = process.env.TEST_MENTOR_EMAIL;
const mentorPassword = process.env.TEST_MENTOR_PASSWORD;
const mentorSuite = hasSupabaseEnv && mentorEmail && mentorPassword ? describe : describe.skip;

mentorSuite("gk-media :: authenticated (mentor)", () => {
  let client: SupabaseClient;
  const ownPath = `${PREFIX}/mentor-own.txt`;
  const uploadedByMentor: string[] = [];

  beforeAll(async () => {
    client = makeClient();
    await signIn(client, mentorEmail!, mentorPassword!);
  });

  afterAll(async () => {
    if (uploadedByMentor.length > 0) {
      await client.storage.from(BUCKET).remove(uploadedByMentor);
    }
    await client.auth.signOut();
  });

  it("can upload to gk-media", async () => {
    const { data, error } = await client.storage
      .from(BUCKET)
      .upload(ownPath, fileBlob("mentor-content"));
    expect(error).toBeNull();
    expect(data?.path).toBeTruthy();
    uploadedByMentor.push(ownPath);
  });

  it("can list objects in gk-media", async () => {
    const { data, error } = await client.storage.from(BUCKET).list(PREFIX);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data?.some((f) => f.name === "mentor-own.txt")).toBe(true);
  });

  it("can download its own uploaded file", async () => {
    const { data, error } = await client.storage.from(BUCKET).download(ownPath);
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    const text = await data!.text();
    expect(text).toBe("mentor-content");
  });

  it("can delete its own uploaded file (owner)", async () => {
    const toDelete = `${PREFIX}/mentor-to-delete.txt`;
    const upload = await client.storage.from(BUCKET).upload(toDelete, fileBlob("delete-me"));
    expect(upload.error).toBeNull();

    const { data, error } = await client.storage.from(BUCKET).remove([toDelete]);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("cannot upload into the reserved announcements folder", async () => {
    const { data, error } = await client.storage
      .from(BUCKET)
      .upload(`announcements/${RUN_ID}/mentor-attempt.pdf`, fileBlob("not-a-broadcast"));
    expect(data).toBeFalsy();
    expect(error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// super_admin
// ---------------------------------------------------------------------------

const adminEmail = process.env.TEST_SUPER_ADMIN_EMAIL;
const adminPassword = process.env.TEST_SUPER_ADMIN_PASSWORD;
const adminSuite = hasSupabaseEnv && adminEmail && adminPassword ? describe : describe.skip;

adminSuite("gk-media :: super_admin", () => {
  let admin: SupabaseClient;
  let mentorClient: SupabaseClient;
  const adminPath = `${PREFIX}/admin-own.txt`;
  const mentorSeededPath = `${PREFIX}/mentor-seed-for-admin-delete.txt`;
  const announcementPath = `announcements/${RUN_ID}/super-admin-broadcast.pdf`;
  const cleanup: string[] = [];

  beforeAll(async () => {
    admin = makeClient();
    mentorClient = makeClient();
    await signIn(admin, adminEmail!, adminPassword!);
    if (mentorEmail && mentorPassword) {
      await signIn(mentorClient, mentorEmail, mentorPassword);
    }
  });

  afterAll(async () => {
    if (cleanup.length > 0) {
      await admin.storage.from(BUCKET).remove(cleanup);
    }
    await admin.auth.signOut();
    await mentorClient.auth.signOut();
  });

  it("can upload to gk-media", async () => {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .upload(adminPath, fileBlob("admin-content"));
    expect(error).toBeNull();
    expect(data?.path).toBeTruthy();
    cleanup.push(adminPath);
  });

  it("can list objects in gk-media", async () => {
    const { data, error } = await admin.storage.from(BUCKET).list(PREFIX);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("can download any file", async () => {
    const { data, error } = await admin.storage.from(BUCKET).download(adminPath);
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  it("cannot upload into the retired announcements folder", async () => {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .upload(announcementPath, new Blob(["broadcast"], { type: "application/pdf" }));
    expect(data).toBeFalsy();
    expect(error).toBeTruthy();
  });

  it.runIf(mentorEmail && mentorPassword)(
    "can delete a file owned by another user (privileged delete)",
    async () => {
      const seed = await mentorClient.storage
        .from(BUCKET)
        .upload(mentorSeededPath, fileBlob("seeded-by-mentor"));
      expect(seed.error).toBeNull();

      const { data, error } = await admin.storage.from(BUCKET).remove([mentorSeededPath]);
      expect(error).toBeNull();
      expect(data?.length).toBe(1);
    },
  );
});
