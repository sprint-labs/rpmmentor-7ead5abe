import { describe, expect, it, vi } from "vitest";
import { InteractionForm, WorkflowDialog } from "./workflows";

/**
 * Minimal, dependency-free tree walker for React elements. These components
 * are plain, hookless functions, so calling them directly and expanding any
 * function-typed child gives a faithful picture of what would actually
 * render — without pulling in jsdom/React Testing Library.
 */
type Fiber = { type: unknown; props?: Record<string, unknown> };

function isFiber(node: unknown): node is Fiber {
  return typeof node === "object" && node !== null && "type" in node;
}

function expand(node: unknown): unknown {
  if (isFiber(node) && typeof node.type === "function") {
    return expand((node.type as (props: unknown) => unknown)(node.props ?? {}));
  }
  return node;
}

interface Collected {
  tags: Set<string>;
  texts: string[];
  buttons: Fiber[];
}

function walk(node: unknown, out: Collected): void {
  if (node == null || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number") {
    out.texts.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out);
    return;
  }
  const expanded = expand(node);
  if (isFiber(expanded)) {
    if (typeof expanded.type === "string") {
      out.tags.add(expanded.type);
      if (expanded.type === "button") out.buttons.push(expanded);
    }
    const children = expanded.props?.children;
    if (children !== undefined) walk(children, out);
  }
}

function render(node: unknown): Collected {
  const out: Collected = { tags: new Set(), texts: [], buttons: [] };
  walk(node, out);
  return out;
}

describe("reachable Log Interaction dialog (InteractionForm)", () => {
  it("shows a clear unavailable explanation instead of the entry form", () => {
    const onDone = vi.fn();
    const collected = render(InteractionForm({ onDone }));
    const text = collected.texts.join(" ");
    expect(text).toMatch(/isn'?t available|not available/i);
    expect(text).toMatch(/cannot save interaction entries durably/i);
    expect(text).toMatch(/dashboard, calendar, interactions list, or the goalkeeper's\s*profile/i);
  });

  it("has no data-entry fields and no Save/Submit action", () => {
    const onDone = vi.fn();
    const collected = render(InteractionForm({ onDone }));
    expect(collected.tags.has("input")).toBe(false);
    expect(collected.tags.has("select")).toBe(false);
    expect(collected.tags.has("textarea")).toBe(false);
    expect(collected.tags.has("form")).toBe(false);
    expect(collected.buttons).toHaveLength(1);
    expect(collected.buttons[0]?.props?.children).toBe("Close");
    const labels = collected.buttons.map((b) => String(b.props?.children ?? "")).join(" ");
    expect(labels).not.toMatch(/save|submit/i);
  });

  it("Close dismisses the dialog", () => {
    const onDone = vi.fn();
    const collected = render(InteractionForm({ onDone }));
    const closeButton = collected.buttons[0];
    expect(typeof closeButton?.props?.onClick).toBe("function");
    (closeButton?.props?.onClick as () => void)();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("never renders any success/saved/logged/submitted claim", () => {
    const onDone = vi.fn();
    const collected = render(InteractionForm({ onDone }));
    const text = collected.texts.join(" ").toLowerCase();
    // Bans affirmative completion claims, while still allowing the honest
    // disclaimer's own use of "saved"/"logging" in a negated sense (e.g.
    // "cannot be saved", "logging isn't available").
    expect(text).not.toMatch(/\bsuccess(ful(ly)?)?\b/);
    expect(text).not.toMatch(
      /(interaction|entry|entries)\s+(has been|have been|was|is)?\s*(saved|logged|submitted)\b/,
    );
    expect(text).not.toMatch(/(saved|logged|submitted)\s+(successfully|to|and (appears|shown))/);
    expect(text).not.toContain("recent activity");
  });
});

describe("Log Interaction entry point via WorkflowDialog", () => {
  it("keeps the 'Log Interaction' title and an honest, non-committal subtitle", () => {
    const onClose = vi.fn();
    const collected = render(WorkflowDialog({ kind: "interaction", onClose }));
    const text = collected.texts.join(" ");
    expect(text).toContain("Log Interaction");
    expect(text).toMatch(/not available in this release/i);
    expect(text).not.toMatch(/saved locally|autosaves|stored in/i);
  });

  it("has no data-entry fields, no Save/Submit action, anywhere in the dialog", () => {
    const onClose = vi.fn();
    const collected = render(WorkflowDialog({ kind: "interaction", onClose }));
    expect(collected.tags.has("input")).toBe(false);
    expect(collected.tags.has("select")).toBe(false);
    expect(collected.tags.has("textarea")).toBe(false);
    const labels = collected.buttons.map((b) => String(b.props?.children ?? "")).join(" ");
    expect(labels).not.toMatch(/save|submit/i);
  });

  it("every button in the dialog dismisses it — no false-success path exists", () => {
    const onClose = vi.fn();
    const collected = render(WorkflowDialog({ kind: "interaction", onClose }));
    expect(collected.buttons.length).toBeGreaterThanOrEqual(2); // header X + inline Close
    for (const button of collected.buttons) {
      const onClick = button.props?.onClick as (() => void) | undefined;
      expect(typeof onClick).toBe("function");
      onClick?.();
    }
    expect(onClose).toHaveBeenCalled();
  });

  it("never renders any success/saved/logged/submitted claim", () => {
    const onClose = vi.fn();
    const collected = render(WorkflowDialog({ kind: "interaction", onClose }));
    const text = collected.texts.join(" ").toLowerCase();
    // Bans affirmative completion claims, while still allowing the honest
    // disclaimer's own use of "saved"/"logging" in a negated sense (e.g.
    // "cannot be saved", "logging isn't available").
    expect(text).not.toMatch(/\bsuccess(ful(ly)?)?\b/);
    expect(text).not.toMatch(
      /(interaction|entry|entries)\s+(has been|have been|was|is)?\s*(saved|logged|submitted)\b/,
    );
    expect(text).not.toMatch(/(saved|logged|submitted)\s+(successfully|to|and (appears|shown))/);
    expect(text).not.toContain("recent activity");
  });
});
