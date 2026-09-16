// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BulletinAttentionStrip,
  BulletinBoardSelector,
  BulletinWorkspace,
} from "@/components/bulletins/bulletin-workspace";
import { bulletinOwnerLabel, clampBulletinPage, preferredBulletinBoardWithWork, bulletinBoardsWithWork } from "@/components/bulletins/bulletin-display";
import type { BulletinDetail, BulletinItem, BulletinSummary } from "@/lib/bulletins/schema";

const items: BulletinItem[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "deal",
    title: "Championship club needs an experienced number two",
    details: "Confirm profile and availability before speaking with the club.",
    subjectType: "club",
    subjectName: "Championship club",
    status: "working",
    ownerId: "22222222-2222-4222-8222-222222222222",
    ownerName: "Rich Lee",
    nextAction: "Agree the first shortlist",
    dueDate: "2026-08-31",
    createdBy: "33333333-3333-4333-8333-333333333333",
    createdByName: "Luke Corrigan",
    createdAt: "2026-08-28T09:00:00.000Z",
    updatedAt: "2026-08-28T10:00:00.000Z",
    lastUpdateAt: "2026-08-28T10:00:00.000Z",
    version: 2,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    kind: "deal",
    title: "League One development goalkeeper enquiry",
    details: "Initial need has been logged.",
    subjectType: "club",
    subjectName: "League One club",
    status: "open",
    ownerId: null,
    ownerName: null,
    nextAction: "Confirm age profile",
    dueDate: null,
    createdBy: "33333333-3333-4333-8333-333333333333",
    createdByName: "Luke Corrigan",
    createdAt: "2026-08-28T11:00:00.000Z",
    updatedAt: "2026-08-28T11:00:00.000Z",
    lastUpdateAt: "2026-08-28T11:00:00.000Z",
    version: 1,
  },
];

const detail: BulletinDetail = {
  item: items[0]!,
  updates: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      bulletinId: items[0]!.id,
      authorId: "22222222-2222-4222-8222-222222222222",
      authorName: "Rich Lee",
      body: "Club has confirmed the role profile.",
      createdAt: "2026-08-28T12:30:00.000Z",
    },
  ],
  updatesTotal: 1,
  updatesPage: 1,
  updatesPageSize: 20,
  updatesPageCount: 1,
  canManage: true,
};

const summary: BulletinSummary = {
  boards: [
    { kind: "daily_update", total: 2, open: 2, blocked: 0 },
    { kind: "deal", total: 7, open: 4, blocked: 1 },
    { kind: "lead", total: 3, open: 2, blocked: 0 },
    { kind: "mandate", total: 1, open: 1, blocked: 0 },
  ],
  attention: { overdue: 2, dueSoon: 4, unassigned: 1 },
  asOfDate: "2026-08-28",
  dueSoonThrough: "2026-09-04",
  canManage: true,
};

function workspaceProps() {
  return {
    kind: "deal" as const,
    canManage: true,
    rows: items,
    total: 22,
    page: 1,
    pageSize: 20,
    pageCount: 2,
    selectedId: items[0]!.id,
    detail,
    search: "",
    status: "all" as const,
    onSearchChange: vi.fn(),
    onStatusChange: vi.fn(),
    onSelect: vi.fn(),
    onPageChange: vi.fn(),
    onRetryList: vi.fn(),
    onRetryDetail: vi.fn(),
    onEdit: vi.fn(),
    onAddUpdate: vi.fn().mockResolvedValue(undefined),
    onUpdatesPageChange: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Bulletin Board operational workspace", () => {
  it("clamps stale URL pages and derives assignment from the canonical owner id", () => {
    expect(clampBulletinPage(999, 2)).toBe(2);
    expect(clampBulletinPage(0, 0)).toBe(1);
    expect(bulletinOwnerLabel({ ownerId: null, ownerName: "Departed Mentor" })).toBe("Unassigned");
  });

  it("prefers a populated board when Daily Updates is empty", () => {
    const emptyDaily = {
      boards: [
        { kind: "daily_update" as const, total: 0, open: 0, blocked: 0 },
        { kind: "deal" as const, total: 0, open: 0, blocked: 0 },
        { kind: "lead" as const, total: 3, open: 1, blocked: 0 },
        { kind: "mandate" as const, total: 0, open: 0, blocked: 0 },
      ],
    };
    expect(preferredBulletinBoardWithWork(emptyDaily)).toBe("lead");
    expect(bulletinBoardsWithWork(emptyDaily, "daily_update")).toEqual([
      { kind: "lead", label: "Leads", total: 3 },
    ]);
  });

  it("presents four distinct boards and makes the Deals meaning explicit", () => {
    const onChange = vi.fn();
    render(<BulletinBoardSelector current="daily_update" summary={summary} onChange={onChange} />);

    expect(screen.getByRole("button", { name: /Daily Updates/ }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("button", { name: /Deals/ }).textContent).toContain("Club needs");
    expect(screen.getByRole("button", { name: /Deals/ }).textContent).toContain("7");

    fireEvent.click(screen.getByRole("button", { name: /Mandates/ }));
    expect(onChange).toHaveBeenCalledWith("mandate");
  });

  it("shows the evidence-backed attention strip without a chart", () => {
    const { container } = render(<BulletinAttentionStrip summary={summary} />);
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeTruthy();
    expect(screen.getByText("Overdue").parentElement?.textContent).toContain("2");
    expect(screen.getByText("Due soon").parentElement?.textContent).toContain("4");
    expect(screen.getByText("Unassigned").parentElement?.textContent).toContain("1");
    expect(container.querySelector("svg[role='img']")).toBeNull();
  });

  it("keeps unassigned team work out of a Mentor's personal attention strip", () => {
    render(<BulletinAttentionStrip summary={{ ...summary, canManage: false }} />);
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByText("Due soon")).toBeTruthy();
    expect(screen.queryByText("Unassigned")).toBeNull();
  });

  it("keeps the list and complete selected record together, with manager edit and append-only updates", async () => {
    const props = workspaceProps();
    render(<BulletinWorkspace {...props} />);

    expect(
      screen
        .getByRole("button", { name: new RegExp(items[0]!.title) })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    const detailPanel = screen.getByRole("region", { name: "Selected bulletin details" });
    expect(within(detailPanel).getByRole("heading", { name: items[0]!.title })).toBeTruthy();
    expect(within(detailPanel).getByText(items[0]!.details)).toBeTruthy();
    expect(within(detailPanel).getByText("Club has confirmed the role profile.")).toBeTruthy();

    fireEvent.click(within(detailPanel).getByRole("button", { name: "Edit & assign" }));
    expect(props.onEdit).toHaveBeenCalledWith(items[0]);

    const update = within(detailPanel).getByRole("textbox", { name: "Add an update" });
    const submit = within(detailPanel).getByRole("button", { name: "Add update" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(update, { target: { value: "  First shortlist shared.  " } });
    fireEvent.click(submit);
    await waitFor(() => expect(props.onAddUpdate).toHaveBeenCalledWith("First shortlist shared."));
    await waitFor(() => expect((update as HTMLTextAreaElement).value).toBe(""));
  });

  it("keeps older timeline entries reachable with explicit pagination", () => {
    const props = workspaceProps();
    const pagedDetail = { ...detail, updatesTotal: 24, updatesPageCount: 2 };
    render(<BulletinWorkspace {...props} detail={pagedDetail} />);

    const timelinePages = screen.getByRole("navigation", { name: "Update timeline pages" });
    expect(within(timelinePages).getByText("1 / 2")).toBeTruthy();
    fireEvent.click(within(timelinePages).getByRole("button", { name: "Next" }));
    expect(props.onUpdatesPageChange).toHaveBeenCalledWith(2);
  });

  it("lets an assigned Mentor append progress without exposing edit or assignment controls", async () => {
    const props = workspaceProps();
    const mentorDetail = { ...detail, canManage: false };
    render(<BulletinWorkspace {...props} canManage={false} detail={mentorDetail} />);

    const detailPanel = screen.getByRole("region", { name: "Selected bulletin details" });
    expect(within(detailPanel).queryByRole("button", { name: "Edit & assign" })).toBeNull();

    const update = within(detailPanel).getByRole("textbox", { name: "Add an update" });
    fireEvent.change(update, { target: { value: "  Shortlist reviewed with Rich.  " } });
    fireEvent.click(within(detailPanel).getByRole("button", { name: "Add update" }));
    await waitFor(() =>
      expect(props.onAddUpdate).toHaveBeenCalledWith("Shortlist reviewed with Rich."),
    );
  });

  it("moves mobile focus only after a newly selected detail has loaded", async () => {
    const props = workspaceProps();
    const originalMatchMedia = window.matchMedia;
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const frame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => (callback(0), 1));

    const { rerender } = render(
      <BulletinWorkspace {...props} selectedId={null} detail={undefined} detailLoading />,
    );
    fireEvent.click(screen.getByRole("button", { name: new RegExp(items[0]!.title) }));
    expect(props.onSelect).toHaveBeenCalledWith(items[0]!.id);

    rerender(
      <BulletinWorkspace
        {...props}
        selectedId={items[0]!.id}
        detail={detail}
        detailLoading={false}
      />,
    );
    const heading = screen.getByRole("heading", { name: items[0]!.title });
    await waitFor(() => expect(document.activeElement).toBe(heading));

    frame.mockRestore();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView,
    });
  });

  it("uses truthful loading, failure and filtered-empty states", () => {
    const props = workspaceProps();
    const { rerender } = render(
      <BulletinWorkspace {...props} rows={[]} total={0} detail={undefined} listLoading />,
    );
    expect(screen.getByLabelText("Loading bulletin items")).toBeTruthy();

    rerender(
      <BulletinWorkspace
        {...props}
        rows={[]}
        total={0}
        detail={undefined}
        listLoading={false}
        listError="Database unavailable"
      />,
    );
    expect(screen.getByRole("heading", { name: "Could not load this board" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onRetryList).toHaveBeenCalledTimes(1);

    rerender(
      <BulletinWorkspace
        {...props}
        rows={[]}
        total={0}
        detail={undefined}
        listError={null}
        search="academy"
      />,
    );
    expect(screen.getByRole("heading", { name: "No matching items" })).toBeTruthy();
    expect(screen.getByText("Try a broader search or a different status.")).toBeTruthy();

    rerender(
      <BulletinWorkspace
        {...props}
        canManage={false}
        rows={[]}
        total={0}
        detail={undefined}
        listError={null}
        search=""
      />,
    );
    expect(screen.getByRole("heading", { name: "No deals assigned to you" })).toBeTruthy();
    expect(screen.getByText("Nothing is currently assigned to you on this board.")).toBeTruthy();
    expect(screen.queryByText(/Create the first/i)).toBeNull();
  });
});
