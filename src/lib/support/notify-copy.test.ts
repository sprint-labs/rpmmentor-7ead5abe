import { describe, expect, it } from "vitest";
import {
  buildSupportReplyCopy,
  buildSupportThreadOpenedCopy,
  truncatePreview,
} from "./notify-copy";

describe("support notification copy", () => {
  const threadId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("renders a bug-opened notification with subject, preview, and support link", () => {
    const copy = buildSupportThreadOpenedCopy({
      threadId,
      kind: "bug",
      subject: "Calendar will not save",
      body: "Tapping Save does nothing on the calendar page.",
    });
    expect(copy.kind).toBe("support_thread_opened");
    expect(copy.title).toBe("New bug report");
    expect(copy.body).toContain("Calendar will not save");
    expect(copy.body).toContain("Tapping Save");
    expect(copy.linkPath).toBe(`/support?thread=${threadId}`);
  });

  it("renders a question-opened notification", () => {
    const copy = buildSupportThreadOpenedCopy({
      threadId,
      kind: "question",
      subject: "How do I log a call?",
      body: "I cannot find the log interaction button.",
    });
    expect(copy.title).toBe("New question");
    expect(copy.kind).toBe("support_thread_opened");
  });

  it("renders a reply with truncated preview", () => {
    const long = "n".repeat(200);
    const copy = buildSupportReplyCopy({ threadId, body: long });
    expect(copy.kind).toBe("support_reply");
    expect(copy.title).toBe("Support reply");
    expect(copy.body.length).toBeLessThanOrEqual(160);
    expect(copy.body.endsWith("…")).toBe(true);
    expect(copy.linkPath).toContain(threadId);
  });

  it("does not truncate a short preview", () => {
    expect(truncatePreview("Short note")).toBe("Short note");
  });
});
