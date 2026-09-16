import { describe, expect, it, vi } from "vitest";
import {
  isMissingAnnouncementAttachmentColumn,
  queryAnnouncementsWithSchemaCompatibility,
} from "./announcement-schema-compat";

describe("announcement schema compatibility", () => {
  it("recognises missing attachment columns from Postgres and the PostgREST schema cache", () => {
    expect(
      isMissingAnnouncementAttachmentColumn({
        code: "42703",
        message: "column announcements.attachment_path does not exist",
      }),
    ).toBe(true);
    expect(
      isMissingAnnouncementAttachmentColumn({
        code: "PGRST204",
        message: "Could not find the 'attachment_size' column in the schema cache",
      }),
    ).toBe(true);
  });

  it("does not hide unrelated database errors", () => {
    expect(
      isMissingAnnouncementAttachmentColumn({ code: "42501", message: "permission denied" }),
    ).toBe(false);
  });

  it("retries legacy columns only when the attachment migration is absent", async () => {
    const currentQuery = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42703", message: "column attachment_path does not exist" },
    });
    const legacyQuery = vi
      .fn()
      .mockResolvedValue({ data: [{ id: "announcement-1" }], error: null });

    await expect(
      queryAnnouncementsWithSchemaCompatibility(currentQuery, legacyQuery),
    ).resolves.toEqual({ data: [{ id: "announcement-1" }], error: null });
    expect(currentQuery).toHaveBeenCalledOnce();
    expect(legacyQuery).toHaveBeenCalledOnce();
  });

  it("returns genuine failures without retrying", async () => {
    const result = { data: null, error: { code: "42501", message: "permission denied" } };
    const currentQuery = vi.fn().mockResolvedValue(result);
    const legacyQuery = vi.fn();

    await expect(
      queryAnnouncementsWithSchemaCompatibility(currentQuery, legacyQuery),
    ).resolves.toEqual(result);
    expect(currentQuery).toHaveBeenCalledOnce();
    expect(legacyQuery).not.toHaveBeenCalled();
  });
});
