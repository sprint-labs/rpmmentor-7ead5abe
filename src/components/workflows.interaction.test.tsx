// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const createInteractionMock = vi.fn();
const listPlayersMock = vi.fn(async () => [
  { id: "p1", full_name: "Demo Keeper", current_club: "Roster FC" },
]);

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => {
    const chain: Record<string, unknown> = {};
    chain["middleware"] = () => chain;
    chain["inputValidator"] = () => chain;
    chain["handler"] = (fn: unknown) => fn;
    return chain;
  },
  createMiddleware: () => {
    const chain: Record<string, unknown> = {};
    chain["server"] = () => chain;
    chain["client"] = () => chain;
    return chain;
  },
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/interactions.functions", () => ({
  createInteraction: (...args: unknown[]) => createInteractionMock(...args),
  listInteractions: vi.fn(async () => []),
}));
vi.mock("@/lib/players.functions", () => ({
  listPlayers: (...args: unknown[]) => listPlayersMock(...args),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Mentor" }, can: () => true }),
}));
vi.mock("@/components/handwritten-notes-field", () => ({
  HandwrittenNotesField: () => null,
}));
vi.mock("@/components/voice-note-field", () => ({
  VoiceNoteField: () => null,
}));

const { InteractionForm } = await import("./workflows");
const { goalkeepers } = await import("@/lib/mock-data");

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InteractionForm onDone={() => {}} />
    </QueryClientProvider>,
  );
}

async function fillValidForm() {
  const gk = goalkeepers[0]!;
  fireEvent.change(screen.getByLabelText("Goalkeeper"), { target: { value: gk.id } });
  fireEvent.change(screen.getByLabelText("Interaction Type"), { target: { value: "Coffee Catch Up" } });
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-05" } });
  fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Reviewed the recovery plan." } });
  return gk;
}

describe("InteractionForm (durable)", () => {
  beforeEach(() => {
    createInteractionMock.mockReset();
    listPlayersMock.mockClear();
  });

  it("renders a real entry form with every collected value", () => {
    renderForm();
    for (const label of ["Goalkeeper", "Interaction Type", "Club", "Date", "Outcome", "Notes", "Follow-up Action"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /save interaction/i })).toBeTruthy();
  });

  it("shows success only after a confirmed inserted row is returned", async () => {
    createInteractionMock.mockResolvedValue({ id: "i1", occurredAt: "2026-01-05" });
    renderForm();
    const gk = await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));

    await waitFor(() => expect(createInteractionMock).toHaveBeenCalledTimes(1));
    const payload = createInteractionMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(payload.data["goalkeeperName"]).toBe(gk.name);
    expect(payload.data["occurredAt"]).toBe("2026-01-05");
    expect(payload.data["interactionType"]).toBe("Coffee Catch Up");
    // Mentor identity is never sent from the client.
    expect(payload.data["mentorId"]).toBeUndefined();

    await waitFor(() => expect(screen.getByText(/logged successfully/i)).toBeTruthy());
  });

  it("never claims success when the server returns no confirmed row", async () => {
    createInteractionMock.mockResolvedValue({});
    renderForm();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText(/logged successfully/i)).toBeNull();
  });

  it("retains entered values and surfaces the error when saving fails", async () => {
    createInteractionMock.mockRejectedValue(new Error("Unauthorized"));
    renderForm();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Unauthorized"));
    expect(screen.queryByText(/logged successfully/i)).toBeNull();
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Reviewed the recovery plan.");
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-01-05");
  });

  it("auto-fills the club from the roster but keeps it editable and resettable", async () => {
    createInteractionMock.mockResolvedValue({ id: "i1" });
    renderForm();
    const gk = goalkeepers.find((g) => g.name === "Demo Keeper") ?? goalkeepers[0]!;
    listPlayersMock.mockResolvedValue([
      { id: "p1", full_name: gk.name, current_club: "Roster FC" },
    ]);
    fireEvent.change(screen.getByLabelText("Goalkeeper"), { target: { value: gk.id } });

    const club = () => screen.getByLabelText("Club") as HTMLInputElement;
    await waitFor(() => expect(club().value).toBe("Roster FC"));
    fireEvent.change(club(), { target: { value: "Override FC" } });
    expect(club().value).toBe("Override FC");
    fireEvent.click(screen.getByRole("button", { name: /reset to roster club/i }));
    expect(club().value).toBe("Roster FC");
  });
});
