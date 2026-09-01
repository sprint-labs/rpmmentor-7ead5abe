import { describe, expect, it } from "vitest";
import {
  ANNOUNCEMENT_ATTACHMENT_MAX_BYTES,
  createAnnouncementInput,
  createSupportThreadInput,
  replySupportThreadInput,
} from "./schema";

describe("createSupportThreadInput", () => {
  it("accepts a bug without page_path", () => {
    const parsed = createSupportThreadInput.parse({
      kind: "bug",
      subject: "Save failed",
      body: "The save button did nothing.",
    });
    expect(parsed.kind).toBe("bug");
    expect(parsed.page_path).toBeUndefined();
  });

  it("rejects a 4001-character body", () => {
    expect(() =>
      createSupportThreadInput.parse({
        kind: "question",
        subject: "A question",
        body: "x".repeat(4001),
      }),
    ).toThrow();
  });

  it("rejects a 201-character subject", () => {
    expect(() =>
      createSupportThreadInput.parse({
        kind: "question",
        subject: "s".repeat(201),
        body: "Hello",
      }),
    ).toThrow();
  });

  it("rejects unknown kind and severity values", () => {
    expect(() =>
      createSupportThreadInput.parse({
        kind: "ticket",
        subject: "Hello",
        body: "Hello",
      }),
    ).toThrow();
    expect(() =>
      createSupportThreadInput.parse({
        kind: "bug",
        subject: "Hello",
        body: "Hello",
        severity: "critical",
      }),
    ).toThrow();
  });

  it("accepts low/medium/high severity", () => {
    for (const severity of ["low", "medium", "high"] as const) {
      expect(
        createSupportThreadInput.parse({
          kind: "bug",
          subject: "Broken filter",
          body: "The filter is empty.",
          severity,
        }).severity,
      ).toBe(severity);
    }
  });
});

describe("replySupportThreadInput", () => {
  it("rejects an empty body", () => {
    expect(() =>
      replySupportThreadInput.parse({
        threadId: "11111111-1111-4111-8111-111111111111",
        body: "   ",
      }),
    ).toThrow();
  });
});

describe("createAnnouncementInput", () => {
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
      publishMode: "later",
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
    expect(parsed.publishMode).toBe("later");
  });

  it("normalises an allowed attachment MIME type for the database constraint", () => {
    const parsed = createAnnouncementInput.parse({
      kind: "info",
      title: "PDF notice",
      attachment: {
        path: "announcements/2026/example.pdf",
        name: "example.pdf",
        mime: " APPLICATION/PDF ",
        size: 1024,
      },
    });

    expect(parsed.attachment?.mime).toBe("application/pdf");
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

  it("rejects attachment metadata when the MIME type does not match the extension", () => {
    expect(() =>
      createAnnouncementInput.parse({
        kind: "info",
        title: "Notice",
        attachment: {
          path: "announcements/2026/notice.pdf",
          name: "notice.pdf",
          mime: "text/html",
          size: 1024,
        },
      }),
    ).toThrow("Attachment type does not match an allowed file extension.");
  });

  it("rejects an expiry that is not after the publish time", () => {
    expect(() =>
      createAnnouncementInput.parse({
        kind: "downtime",
        title: "Maintenance",
        startsAt: "2026-09-02T10:00:00.000Z",
        endsAt: "2026-09-02T09:00:00.000Z",
      }),
    ).toThrow("The end time must be after the publish time.");
  });
});
