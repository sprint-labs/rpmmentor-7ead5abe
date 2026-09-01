import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260901104809_secure_announcement_media_storage.sql",
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
    expect(migration).toContain("CHECK (ends_at IS NULL OR ends_at > starts_at)");
    expect(migration).toContain("announcements_attachment_mime_check");
  });
});
