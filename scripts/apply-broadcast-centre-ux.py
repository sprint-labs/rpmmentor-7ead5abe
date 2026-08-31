from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:80]!r}")
    write(path, content.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Shared schema
# ---------------------------------------------------------------------------
replace_once(
    "src/lib/support/schema.ts",
    '''export const ANNOUNCEMENT_KINDS = ["feature", "info", "incident", "downtime"] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];
''',
    '''export const ANNOUNCEMENT_KINDS = ["feature", "info", "incident", "downtime"] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

export const ANNOUNCEMENT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export interface AnnouncementAttachment {
  path: string;
  name: string;
  mime: string;
  size: number;
}

export const announcementAttachmentInput = z.object({
  path: z.string().trim().min(1).max(500).startsWith("announcements/"),
  name: z.string().trim().min(1).max(255),
  mime: z.string().trim().min(1).max(150),
  size: z.number().int().min(0).max(ANNOUNCEMENT_ATTACHMENT_MAX_BYTES),
});
''',
)
replace_once(
    "src/lib/support/schema.ts",
    '''export const createAnnouncementInput = z.object({
  kind: z.enum(ANNOUNCEMENT_KINDS),
  title: z.string().trim().min(1, "Title is required").max(160),
  body: z.string().trim().max(4000).default(""),
  endsAt: z.string().datetime({ offset: true }).nullish(),
});
''',
    '''export const createAnnouncementInput = z.object({
  kind: z.enum(ANNOUNCEMENT_KINDS),
  title: z.string().trim().min(1, "Title is required").max(160),
  body: z.string().trim().max(4000).default(""),
  startsAt: z.string().datetime({ offset: true }).nullish(),
  endsAt: z.string().datetime({ offset: true }).nullish(),
  attachment: announcementAttachmentInput.nullish(),
});
''',
)
replace_once(
    "src/lib/support/schema.ts",
    '''  createdBy: string;
  createdAt: string;
  readAt: string | null;
}''',
    '''  createdBy: string;
  createdAt: string;
  readAt: string | null;
  attachment: AnnouncementAttachment | null;
}''',
)

# ---------------------------------------------------------------------------
# Server functions
# ---------------------------------------------------------------------------
replace_once(
    "src/lib/support.functions.ts",
    '''  type AnnouncementKind,
  type AnnouncementRow,
''',
    '''  type AnnouncementAttachment,
  type AnnouncementKind,
  type AnnouncementRow,
''',
)
replace_once(
    "src/lib/support.functions.ts",
    '''  created_by: string;
  created_at: string;
};''',
    '''  created_by: string;
  created_at: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
};''',
)
replace_once(
    "src/lib/support.functions.ts",
    '''function mapAnnouncement(row: AnnouncementDbRow, readAt: string | null): AnnouncementRow {
  return {
''',
    '''function mapAnnouncement(row: AnnouncementDbRow, readAt: string | null): AnnouncementRow {
  const attachment: AnnouncementAttachment | null =
    row.attachment_path &&
    row.attachment_name &&
    row.attachment_mime &&
    row.attachment_size !== null
      ? {
          path: row.attachment_path,
          name: row.attachment_name,
          mime: row.attachment_mime,
          size: row.attachment_size,
        }
      : null;

  return {
''',
)
replace_once(
    "src/lib/support.functions.ts",
    '''    createdAt: row.created_at,
    readAt,
  };
}''',
    '''    createdAt: row.created_at,
    readAt,
    attachment,
  };
}''',
)
replace_once(
    "src/lib/support.functions.ts",
    '''const ANNOUNCEMENT_COLUMNS =
  "id, kind, title, body, starts_at, ends_at, active, created_by, created_at";''',
    '''const ANNOUNCEMENT_COLUMNS =
  "id, kind, title, body, starts_at, ends_at, active, created_by, created_at, attachment_path, attachment_name, attachment_mime, attachment_size";''',
)
replace_once(
    "src/lib/support.functions.ts",
    '''export const markAnnouncementRead = createServerFn({ method: "POST" })''',
    '''export const listAdminAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AnnouncementRow[]> => {
    await requireRole(
      context.supabase,
      context.userId,
      SUPPORT_INBOX_ROLES,
      "view all announcements",
    );

    const { data: rows, error } = await context.supabase
      .from("announcements")
      .select(ANNOUNCEMENT_COLUMNS)
      .order("starts_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    return ((rows ?? []) as AnnouncementDbRow[]).map((row) => mapAnnouncement(row, null));
  });

export const markAnnouncementRead = createServerFn({ method: "POST" })''',
)
replace_once(
    "src/lib/support.functions.ts",
    '''        body: data.body ?? "",
        ends_at: data.endsAt ?? null,
        created_by: context.userId,
        active: true,
''',
    '''        body: data.body ?? "",
        starts_at: data.startsAt ?? new Date().toISOString(),
        ends_at: data.endsAt ?? null,
        attachment_path: data.attachment?.path ?? null,
        attachment_name: data.attachment?.name ?? null,
        attachment_mime: data.attachment?.mime ?? null,
        attachment_size: data.attachment?.size ?? null,
        created_by: context.userId,
        active: true,
''',
)

# ---------------------------------------------------------------------------
# Generated Supabase types for the new columns
# ---------------------------------------------------------------------------
types_path = "src/integrations/supabase/types.ts"
types = read(types_path)
start = types.index("      announcements: {")
end = types.index("      calendar_event_audit: {", start)
announcement_types = '''      announcements: {
        Row: {
          active: boolean
          attachment_mime: string | null
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          body: string
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          kind: string
          starts_at: string
          title: string
        }
        Insert: {
          active?: boolean
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          body?: string
          created_at?: string
          created_by: string
          ends_at?: string | null
          id?: string
          kind: string
          starts_at?: string
          title: string
        }
        Update: {
          active?: boolean
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          body?: string
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          kind?: string
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
'''
write(types_path, types[:start] + announcement_types + types[end:])

# ---------------------------------------------------------------------------
# Route swaps the old form for the new component
# ---------------------------------------------------------------------------
route_path = "src/routes/support.tsx"
route = read(route_path)
for old in [
    "  createAnnouncement,\n",
    "  endAnnouncement,\n",
    "  listActiveAnnouncements,\n",
    "  ANNOUNCEMENT_KINDS,\n",
    "  type AnnouncementKind,\n",
]:
    if route.count(old) != 1:
        raise RuntimeError(f"Expected one import token in {route_path}: {old!r}")
    route = route.replace(old, "", 1)
route = route.replace(
    'import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";\n',
    'import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";\nimport { BroadcastCentre } from "@/components/broadcast-centre";\n',
    1,
)
route = route.replace(
    '{tab === "broadcasts" && canInbox && <BroadcastsPanel />}',
    '{tab === "broadcasts" && canInbox && <BroadcastCentre />}',
    1,
)
old_panel = route.index("\nfunction BroadcastsPanel() {")
route = route[:old_panel].rstrip() + "\n"
write(route_path, route)

# ---------------------------------------------------------------------------
# End user drawer renders broadcast media and all notice types
# ---------------------------------------------------------------------------
launcher_path = "src/components/help-updates-launcher.tsx"
launcher = read(launcher_path)
launcher = launcher.replace(
    'import type { AnnouncementRow } from "@/lib/support/schema";\n',
    'import type { AnnouncementRow } from "@/lib/support/schema";\nimport { AnnouncementMedia, ANNOUNCEMENT_KIND_LABEL } from "@/components/announcement-media";\n',
    1,
)
label_start = launcher.index("\nconst ANNOUNCEMENT_LABEL:")
label_end = launcher.index("\n\nexport function HelpUpdatesLauncher", label_start)
launcher = launcher[:label_start] + launcher[label_end:]
launcher = launcher.replace("ANNOUNCEMENT_LABEL[announcement.kind]", "ANNOUNCEMENT_KIND_LABEL[announcement.kind]")
launcher = launcher.replace("What&apos;s new", "Updates")
launcher = launcher.replace(
    '''                              {announcement.body && (
                                <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                                  {announcement.body}
                                </p>
                              )}
                              <button
''',
    '''                              {announcement.body && (
                                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                                  {announcement.body}
                                </p>
                              )}
                              <AnnouncementMedia attachment={announcement.attachment} compact />
                              <button
''',
    1,
)
write(launcher_path, launcher)

# Include service notices in the Help drawer without duplicating their unread badge.
replace_once(
    "src/components/app-shell.tsx",
    '''  const updateAnnouncements = announcements.filter(
    (announcement) => announcement.kind === "feature" || announcement.kind === "info",
  );''',
    '''  const updateAnnouncements = announcements;''',
)
replace_once(
    "src/components/app-shell.tsx",
    '''  const helpUnread = updateAnnouncements.filter((announcement) => !announcement.readAt).length;''',
    '''  const helpUnread = updateAnnouncements.filter(
    (announcement) =>
      (announcement.kind === "feature" || announcement.kind === "info") && !announcement.readAt,
  ).length;''',
)

# ---------------------------------------------------------------------------
# Tests and small compile fixes
# ---------------------------------------------------------------------------
replace_once(
    "src/components/help-updates-launcher.test.tsx",
    '''    createdAt: `2026-08-26T12:0${index}:00.000Z`,
    readAt,
''',
    '''    createdAt: `2026-08-26T12:0${index}:00.000Z`,
    readAt,
    attachment: null,
''',
)
replace_once(
    "src/lib/support/schema.test.ts",
    '''  createAnnouncementInput,
  createSupportThreadInput,
''',
    '''  ANNOUNCEMENT_ATTACHMENT_MAX_BYTES,
  createAnnouncementInput,
  createSupportThreadInput,
''',
)
replace_once(
    "src/lib/support/schema.test.ts",
    '''describe("createAnnouncementInput", () => {
  it("accepts feature/info/incident/downtime", () => {
    for (const kind of ["feature", "info", "incident", "downtime"] as const) {
      expect(
        createAnnouncementInput.parse({
          kind,
          title: "Notice",
          body: "",
        }).kind,
      ).toBe(kind);
    }
  });
});
''',
    '''describe("createAnnouncementInput", () => {
  it("accepts feature/info/incident/downtime", () => {
    for (const kind of ["feature", "info", "incident", "downtime"] as const) {
      expect(
        createAnnouncementInput.parse({
          kind,
          title: "Notice",
          body: "",
        }).kind,
      ).toBe(kind);
    }
  });

  it("accepts scheduling and one attachment", () => {
    const parsed = createAnnouncementInput.parse({
      kind: "feature",
      title: "New media flow",
      body: "You can now attach a short video.",
      startsAt: "2026-09-01T09:00:00.000Z",
      endsAt: "2026-09-08T09:00:00.000Z",
      attachment: {
        path: "announcements/2026/example.mp4",
        name: "example.mp4",
        mime: "video/mp4",
        size: 1024,
      },
    });
    expect(parsed.attachment?.name).toBe("example.mp4");
  });

  it("rejects oversized or incorrectly scoped attachments", () => {
    expect(() =>
      createAnnouncementInput.parse({
        kind: "info",
        title: "Notice",
        attachment: {
          path: "goalkeepers/example.pdf",
          name: "example.pdf",
          mime: "application/pdf",
          size: ANNOUNCEMENT_ATTACHMENT_MAX_BYTES + 1,
        },
      }),
    ).toThrow();
  });
});
''',
)

# Card is a lightweight component rather than forwardRef.
broadcast_path = "src/components/broadcast-centre.tsx"
broadcast = read(broadcast_path)
broadcast = broadcast.replace('  const composerRef = useRef<HTMLDivElement>(null);\n', "", 1)
broadcast = broadcast.replace(
    '    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });\n',
    "",
    1,
)
broadcast = broadcast.replace('<Card ref={composerRef} className="space-y-5 p-4 sm:p-5">', '<Card className="space-y-5 p-4 sm:p-5">', 1)
write(broadcast_path, broadcast)

# ---------------------------------------------------------------------------
# Record the forward migration in the checked manifest.
# ---------------------------------------------------------------------------
migration_path = ROOT / "supabase/migrations/20260831193000_announcement_media_and_scheduling.sql"
raw = migration_path.read_bytes()
comparable = raw[:-1] if raw.endswith(b"\n") else raw
manifest_path = ROOT / "docs/supabase-production-migration-manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
entry = {
    "version": "20260831193000",
    "name": "announcement_media_and_scheduling",
    "statement_count": 1,
    "sql_length": len(comparable.decode("utf-8")),
    "sql_md5": hashlib.md5(comparable).hexdigest(),
}
forward = manifest.setdefault("reviewed_forward_migrations", [])
forward = [item for item in forward if item.get("version") != entry["version"]]
forward.append(entry)
forward.sort(key=lambda item: item["version"])
manifest["reviewed_forward_migrations"] = forward
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

print("Broadcast centre UX changes applied.")
