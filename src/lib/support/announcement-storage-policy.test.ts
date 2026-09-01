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
  const select = policy("gk_media_select_scoped");
  const start = select.indexOf("(storage.foldername(name))[1] = 'announcements'");
  const end = select.indexOf(
    "(storage.foldername(name))[1] IS DISTINCT FROM 'announcements'",
    start,
  );
  if (start < 0 || end < 0) throw new Error("Announcement Storage read branch was not found");
  return select.slice(start, end);
}

describe("announcement Storage hardening migration", () => {
  it("replaces every broad gk-media operation policy", () => {
    for (const name of [
      "gk_media_select_scoped",
      "gk_media_insert_authenticated",
      "gk_media_update_privileged",
      "gk_media_delete_privileged",
    ]) {
      expect(migration).toContain(`DROP POLICY IF EXISTS ${name} ON storage.objects;`);
      expect(migration).toContain(`CREATE POLICY ${name}`);
    }
  });

  it("only exposes announcement objects when the linked broadcast is live", () => {
    const select = policy("gk_media_select_scoped");
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
      "gk_media_insert_authenticated",
      "gk_media_update_privileged",
      "gk_media_delete_privileged",
    ]) {
      const sql = policy(name);
      expect(sql).toContain("(storage.foldername(name))[1] = 'announcements'");
      expect(sql).toContain("'super_admin'::public.app_role");
    }
    expect(policy("gk_media_update_privileged")).toContain("WITH CHECK");
  });

  it("enforces valid announcement windows and MIME allowlisting in the database", () => {
    expect(migration).toContain("CHECK (ends_at IS NULL OR ends_at > starts_at) NOT VALID");
    expect(migration).toContain("announcements_attachment_mime_check");
    expect(migration.match(/NOT VALID;/g)).toHaveLength(2);
  });

  it("exposes the upload-readiness marker only after the hardening policies", () => {
    const marker = "CREATE OR REPLACE FUNCTION public.announcement_media_storage_ready_v1()";
    expect(migration).toContain(marker);
    expect(migration.indexOf(marker)).toBeGreaterThan(
      migration.indexOf("CREATE POLICY gk_media_delete_privileged"),
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.announcement_media_storage_ready_v1() FROM PUBLIC;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.announcement_media_storage_ready_v1() TO authenticated;",
    );
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).not.toContain("SECURITY DEFINER");
  });
});
