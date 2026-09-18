// @vitest-environment jsdom

/**
 * Edit Details is a role-gated correction path, and the roles it offers are not
 * the roles the database enforces — so both halves are pinned here.
 *
 * Hiding a control is presentation only: `updatePlayerClub`, `updatePlayerTier`
 * and `updatePlayerRecord` each re-check the caller, and RLS plus the
 * `players_guard_club_only_update` trigger enforce it a third time. These tests
 * guard the promise the UI makes, not the security boundary.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { roleHasPermission, type Role } from "@/lib/auth";

const authState = vi.hoisted(() => ({ role: "mentor_manager" as Role }));
const saveMocks = vi.hoisted(() => ({
  saveClub: vi.fn(),
  saveTier: vi.fn(),
  saveRecord: vi.fn(),
  refreshClub: vi.fn(),
  refreshDuty: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    useAuth: () => ({
      user: { id: "u1", name: "Test", email: "t@example.com", role: authState.role },
      can: (permission: string) => actual.roleHasPermission(authState.role, permission as never),
    }),
  };
});

vi.mock("@/lib/players.functions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/players.functions")>();
  return {
    ...actual,
    updatePlayerClub: "update-player-club",
    updatePlayerTier: "update-player-tier",
    updatePlayerRecord: "update-player-record",
  };
});

vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => {
    if (fn === "update-player-club") return saveMocks.saveClub;
    if (fn === "update-player-tier") return saveMocks.saveTier;
    if (fn === "update-player-record") return saveMocks.saveRecord;
    return vi.fn();
  },
}));

vi.mock("@/lib/query-refresh", () => ({
  refreshClubDependentViews: (...args: unknown[]) => saveMocks.refreshClub(...args),
  refreshDutyOfCareViews: (...args: unknown[]) => saveMocks.refreshDuty(...args),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { EditDetailsButton } = await import("./edit-player-details-dialog");

const PLAYER = {
  id: "11111111-2222-3333-4444-555555555555",
  full_name: "Max Crocombe",
  current_club: "Burton Albion",
  parent_club: null,
  on_loan: false,
  league: "League One",
  nationality: "New Zealand",
  instagram_url: null,
  contract_until: "2027-06-30",
  tier: "Tier 1",
};

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EditDetailsButton
        player={PLAYER}
        playerId={PLAYER.id}
        playerName={PLAYER.full_name}
        currentClub={PLAYER.current_club}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  saveMocks.saveClub.mockReset();
  saveMocks.saveTier.mockReset();
  saveMocks.saveRecord.mockReset();
  saveMocks.refreshClub.mockReset();
  saveMocks.refreshDuty.mockReset();
});

describe("who is offered Edit Details", () => {
  it.each(["mentor_manager", "admin", "super_admin"] as const)("offers it to %s", (role) => {
    authState.role = role;
    renderButton();
    expect(screen.getByRole("button", { name: /edit details/i })).toBeTruthy();
  });

  it("does not offer it to a mentor", () => {
    authState.role = "mentor";
    renderButton();
    expect(screen.queryByRole("button", { name: /edit details/i })).toBeNull();
  });

  it("shows nothing without a canonical player record to correct", () => {
    authState.role = "super_admin";
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <EditDetailsButton
          player={null}
          playerId={null}
          playerName={PLAYER.full_name}
          currentClub=""
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("button", { name: /edit details/i })).toBeNull();
  });
});

describe("the permission the gate reads", () => {
  it("is held by exactly the three management roles", () => {
    expect(roleHasPermission("mentor_manager", "players.edit_club")).toBe(true);
    expect(roleHasPermission("admin", "players.edit_club")).toBe(true);
    expect(roleHasPermission("super_admin", "players.edit_club")).toBe(true);
    expect(roleHasPermission("mentor", "players.edit_club")).toBe(false);
  });
});

describe("what the form lets each role change", () => {
  it("holds Citizenship to Super Admin, matching the database guard", async () => {
    authState.role = "mentor_manager";
    renderButton();
    screen.getByRole("button", { name: /edit details/i }).click();

    const citizenship = await screen.findByLabelText("Citizenship");
    expect((citizenship as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Current club") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Tier") as HTMLSelectElement).disabled).toBe(false);
  });

  it("opens the whole record to a Super Admin", async () => {
    authState.role = "super_admin";
    renderButton();
    screen.getByRole("button", { name: /edit details/i }).click();

    for (const label of ["Citizenship", "League", "Parent club", "Contract until"]) {
      expect((await screen.findByLabelText(label)).hasAttribute("disabled")).toBe(false);
    }
  });

  it("shows Citizenship seeded from players.nationality", async () => {
    authState.role = "super_admin";
    renderButton();
    screen.getByRole("button", { name: /edit details/i }).click();

    expect(((await screen.findByLabelText("Citizenship")) as HTMLInputElement).value).toBe(
      "New Zealand",
    );
  });
});

describe("what a successful save refreshes", () => {
  it("re-reads duty of care after a tier change, not only the roster", async () => {
    authState.role = "mentor_manager";
    saveMocks.saveTier.mockResolvedValue({ ...PLAYER, tier: "Tier 4" });
    saveMocks.refreshClub.mockResolvedValue(undefined);
    saveMocks.refreshDuty.mockResolvedValue(undefined);
    renderButton();
    screen.getByRole("button", { name: /edit details/i }).click();

    fireEvent.change(await screen.findByLabelText("Tier"), { target: { value: "Tier 4" } });
    fireEvent.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() => {
      expect(saveMocks.saveTier).toHaveBeenCalled();
      expect(saveMocks.refreshDuty).toHaveBeenCalled();
    });
    expect(saveMocks.refreshDuty.mock.calls[0][1]).toBe(PLAYER.id);
    expect(saveMocks.refreshClub).toHaveBeenCalled();
  });
});
