// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { FixtureImportDialog } from "@/components/calendar/fixture-import-dialog";

const commitMock = vi.fn();

vi.mock("@/lib/calendar/fixture-import.functions", () => ({
  commitFixtureImport: (...args: unknown[]) => commitMock(...args),
}));

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    useServerFn: <T,>(fn: T) => fn,
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  commitMock.mockReset();
});

const roster = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    full_name: "James Beadle",
    current_club: "Charlton Athletic",
  },
];

const mentors = [
  { id: "22222222-2222-4222-8222-222222222222", name: "David Rouse", isManager: true },
];

function workbookFile(): File {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Date", "Time", "Goalkeeper", "Club", "Opponent", "Competition", "Venue", "H/A"],
    [
      "15/08/2026",
      "15:00",
      "James Beadle",
      "Charlton Athletic",
      "Leyton Orient",
      "League One",
      "The Valley",
      "H",
    ],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Fixtures");
  const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as Uint8Array;
  return new File([buffer], "august-fixtures.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("FixtureImportDialog", () => {
  it("parses an upload, shows preview summary, and commits only after confirm", async () => {
    commitMock.mockResolvedValue({
      imported: 1,
      skipped: 0,
      failed: 0,
      rows: [
        {
          rowNumber: 2,
          outcome: "imported",
          eventId: "evt-1",
          message: "Imported as Charlton Athletic v Leyton Orient (League One).",
        },
      ],
    });

    const onImported = vi.fn().mockResolvedValue(undefined);
    render(
      <FixtureImportDialog
        open
        onClose={() => undefined}
        roster={roster}
        mentors={mentors}
        existingEvents={[]}
        onImported={onImported}
      />,
    );

    expect(screen.getByText(/Import fixtures/i)).toBeTruthy();
    expect(screen.getByText(/Choose \.xlsx or \.csv file/i)).toBeTruthy();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [workbookFile()] } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Review 1 ready fixture/i })).toBeTruthy();
      expect(screen.getByText(/Charlton Athletic v Leyton Orient/i)).toBeTruthy();
    });

    const selects = Array.from(document.querySelectorAll("select"));
    const mentor = selects.find((el) =>
      Array.from(el.options).some((option) => /choose a mentor/i.test(option.textContent ?? "")),
    );
    expect(mentor).toBeTruthy();
    fireEvent.change(mentor!, { target: { value: mentors[0].id } });

    fireEvent.click(screen.getByRole("button", { name: /Review 1 ready fixture/i }));
    expect(screen.getByText(/About to create/i)).toBeTruthy();
    expect(commitMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Confirm import/i }));

    await waitFor(() => {
      expect(commitMock).toHaveBeenCalledTimes(1);
      expect(onImported).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /^Done$/i })).toBeTruthy();
    });

    const payload = commitMock.mock.calls[0][0].data;
    expect(payload.confirm).toBe(true);
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0].player_id).toBe(roster[0].id);
    expect(payload.rows[0].assigned_mentor_id).toBe(mentors[0].id);
    expect(payload.rows[0].event_date).toBe("2026-08-15");
  });

  it("shows a per-row kick-off control when the Time cell is empty", async () => {
    render(
      <FixtureImportDialog
        open
        onClose={() => undefined}
        roster={roster}
        mentors={mentors}
        existingEvents={[]}
        onImported={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const csv = new File(
      ["Date,Goalkeeper,Club,Opponent\n15/08/2026,James Beadle,Charlton Athletic,Leyton Orient\n"],
      "no-times.csv",
      { type: "text/csv" },
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csv] } });

    await waitFor(() => {
      expect(screen.getByText(/Set kick-off for this row/i)).toBeTruthy();
      expect(screen.getByText(/2026-08-15/)).toBeTruthy();
    });

    const timeInputs = Array.from(document.querySelectorAll('input[type="time"]'));
    expect(timeInputs.length).toBeGreaterThan(1);
    const rowTime = timeInputs[1] as HTMLInputElement;
    expect(rowTime.value).toBe("15:00");
    fireEvent.change(rowTime, { target: { value: "19:45" } });

    await waitFor(() => {
      expect(screen.getByText(/19:45/)).toBeTruthy();
    });
  });
});
