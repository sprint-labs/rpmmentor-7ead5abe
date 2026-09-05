import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260901111131_secure_announcement_media_storage.sql",
    import.meta.url,
  ),
  "utf8",
);

function policy(name: string): string {
  const match = migration.match(
    new RegExp(`CREATE POLICY ${name}([\\s\\S]*?)(?=\\nDROP POLICY|$)`),
  );
  if (!match) throw new Error(`Policy ${name} was not found`);
  return match[0];
}

function announcementStorageReadBranch(): string {
  return policy("gk_broadcast_media_select_scoped");
}

describe("announcement Storage hardening migration", () => {
  it("creates a dedicated private bucket with service-enforced upload limits", () => {
    expect(migration).toContain(
      "INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)",
    );
    expect(migration).toContain("'gk-broadcast-media'");
    expect(migration).toContain("26214400");
    expect(migration).toContain("allowed_mime_types = EXCLUDED.allowed_mime_types");
    for (const mime of ["image/jpeg", "video/mp4", "audio/mpeg", "application/pdf"]) {
      expect(migration).toContain(`'${mime}'`);
    }
  });

  it("retires the old shared-bucket prefix without changing other gk-media access", () => {
    for (const name of [
      "gk_media_select_scoped",
      "gk_media_insert_authenticated",
      "gk_media_update_privileged",
      "gk_media_delete_privileged",
    ]) {
      expect(migration).toContain(`DROP POLICY IF EXISTS ${name} ON storage.objects;`);
      expect(migration).toContain(`CREATE POLICY ${name}`);
      expect(policy(name)).toContain(
        "(storage.foldername(name))[1] IS DISTINCT FROM 'announcements'",
      );
    }
    expect(policy("gk_media_select_scoped")).not.toContain(
      "announcement.attachment_path = storage.objects.name",
    );
  });

  it("only exposes announcement objects when the linked broadcast is live", () => {
    const select = policy("gk_broadcast_media_select_scoped");
    expect(select).toContain("announcement.attachment_path = storage.objects.name");
    expect(select).toContain("announcement.active = true");
    expect(select).toContain("announcement.starts_at <= now()");
    expect(select).toContain("announcement.ends_at > now()");
  });

  it("denies the announcement feed and media to roleless authenticated users", () => {
    const announcementSelect = policy("announcements_select_scoped");
    const storageAnnouncementSelect = announcementStorageReadBranch();

    for (const role of ["mentor", "mentor_manager", "admin", "super_admin"]) {
      expect(announcementSelect).toContain(`'${role}'::public.app_role`);
      expect(storageAnnouncementSelect).toContain(`'${role}'::public.app_role`);
    }

    expect(announcementSelect).toContain("active = true");
    expect(announcementSelect).toContain("starts_at <= now()");
    expect(announcementSelect).toContain("ends_at > now()");
    expect(storageAnnouncementSelect).toContain("AND EXISTS (");
  });

  it("requires Super Admin for announcement object mutations", () => {
    for (const name of [
      "gk_broadcast_media_insert_super_admin",
      "gk_broadcast_media_delete_super_admin",
    ]) {
      const sql = policy(name);
      expect(sql).toContain("bucket_id = 'gk-broadcast-media'");
      expect(sql).toContain("'super_admin'::public.app_role");
    }
    expect(migration).toContain(
      "DROP POLICY IF EXISTS gk_broadcast_media_update_super_admin ON storage.objects;",
    );
    expect(migration).not.toContain("CREATE POLICY gk_broadcast_media_update_super_admin");
  });

  it("admits only size-checked standard and TUS upload operations", () => {
    const insert = policy("gk_broadcast_media_insert_super_admin");
    expect(insert).toContain("storage.allow_any_operation(ARRAY[");
    for (const operation of [
      "storage.object.upload",
      "storage.tus.upload.create",
      "storage.tus.upload.part",
    ]) {
      expect(insert).toContain(`'${operation}'`);
    }
    for (const bypass of [
      "storage.object.copy",
      "storage.object.move",
      "storage.object.upload_signed",
      "storage.s3.upload",
    ]) {
      expect(insert).not.toContain(`'${bypass}'`);
    }
    expect(insert).toContain("WHEN jsonb_typeof(metadata -> 'contentLength') = 'number'");
    expect(insert).toContain("(metadata ->> 'contentLength')::numeric BETWEEN 0 AND 26214400");
    expect(insert).toContain("(metadata ->> 'mimetype') IN (");
  });

  it("keeps linked announcement objects immutable while allowing unlinked cleanup", () => {
    for (const name of [
      "gk_broadcast_media_insert_super_admin",
      "gk_broadcast_media_delete_super_admin",
    ]) {
      const sql = policy(name);
      expect(sql).toContain("AND NOT EXISTS (");
      expect(sql).toContain("linked_announcement.attachment_path = storage.objects.name");
    }
  });

  it("enforces valid announcement windows and MIME allowlisting in the database", () => {
    expect(migration).toContain(
      "CHECK (NOT active OR ends_at IS NULL OR ends_at > starts_at) NOT VALID",
    );
    expect(migration).toContain("announcements_attachment_mime_check");
    expect(migration.match(/NOT VALID;/g)).toHaveLength(2);
  });

  it("exposes the upload-readiness marker only after the hardening policies", () => {
    const marker = "CREATE OR REPLACE FUNCTION public.announcement_media_storage_ready_v2()";
    expect(migration).toContain(marker);
    expect(migration.indexOf(marker)).toBeGreaterThan(
      migration.indexOf("CREATE POLICY gk_broadcast_media_delete_super_admin"),
    );
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.announcement_media_storage_ready_v1();",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.announcement_media_storage_ready_v2() FROM PUBLIC;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.announcement_media_storage_ready_v2() TO authenticated;",
    );
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).not.toContain("SECURITY DEFINER");
  });
});
