// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_FILE_BYTES } from "@/lib/media-store";
import type { PlayerRosterRow } from "@/lib/players.functions";

const uploadMediaMock = vi.fn();
const listPlayersMock = vi.fn();
const onDoneMock = vi.fn();

const PLAYERS: PlayerRosterRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    full_name: "Zoe Keeper",
    current_club: "Northern FC",
    parent_club: null,
    on_loan: false,
    league: "Championship",
    nationality: "England",
    instagram_url: null,
    contract_until: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    full_name: "Alex Goalkeeper",
    current_club: "Southern United",
    parent_club: null,
    on_loan: false,
    league: "League One",
    nationality: "Wales",
    instagram_url: null,
    contract_until: null,
  },
];

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => {
    const chain: Record<string, unknown> = {};
    chain["middleware"] = () => chain;
    chain["validator"] = () => chain;
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

vi.mock("@/lib/media-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media-store")>()),
  uploadMedia: (...args: unknown[]) => uploadMediaMock(...args),
}));

vi.mock("@/lib/players.functions", () => ({
  listPlayers: () => listPlayersMock(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Mentor", role: "mentor" },
    can: () => true,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { MediaForm } = await import("./workflows");

function renderForm() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <MediaForm onDone={onDoneMock} />
    </QueryClientProvider>,
  );
}

function clip(name: string, type = "video/mp4", size?: number): File {
  const result = new File(["clip-bytes"], name, { type });
  if (size !== undefined) {
    Object.defineProperty(result, "size", { configurable: true, value: size });
  }
  return result;
}

function chooseClips(files: File[]) {
  fireEvent.change(screen.getByLabelText("Clips"), { target: { files } });
}

async function waitForRoster() {
  await waitFor(() => {
    expect(
      (screen.getByRole("combobox", { name: "Goalkeeper" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
}

beforeEach(() => {
  uploadMediaMock.mockReset();
  listPlayersMock.mockReset();
  listPlayersMock.mockResolvedValue(PLAYERS);
  onDoneMock.mockReset();

  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MediaForm bulk clip upload", () => {
  it("selects many files once, preserves each exact filename, and uploads unlinked by default", async () => {
    uploadMediaMock.mockImplementation(async ({ file }: { file: File }) => ({
      id: `asset:${file.name}`,
    }));
    renderForm();
    await waitForRoster();

    const input = screen.getByLabelText("Clips") as HTMLInputElement;
    expect(input.multiple).toBe(true);
    expect(screen.getByRole("combobox", { name: "Goalkeeper" }).textContent).toContain(
      "No goalkeeper linked",
    );

    const files = [
      clip("Rhys Byrne 20-08-2026.mp4"),
      clip("PLAYER NAME + DATE.MOV", "video/quicktime"),
    ];
    chooseClips(files);

    expect(screen.getByText("2 files selected")).toBeTruthy();
    expect(screen.getByText(files[0]!.name)).toBeTruthy();
    expect(screen.getByText(files[1]!.name)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Upload 2 clips" }));

    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalledTimes(2));
    const calls = uploadMediaMock.mock.calls.map(
      ([options]) =>
        options as {
          file: File;
          gkId: string | null;
          title: string;
        },
    );
    expect(calls.map((options) => options.file)).toEqual(files);
    expect(calls.map((options) => options.title)).toEqual(files.map((file) => file.name));
    expect(calls.map((options) => options.gkId)).toEqual([null, null]);

    await waitFor(() => {
      expect(screen.getByText("2 clips uploaded to the central media repository.")).toBeTruthy();
    });
  });

  it("shows accessible progress per file and lets another file finish after one fails", async () => {
    let resolveSuccessfulUpload!: (value: { id: string }) => void;
    uploadMediaMock.mockImplementation(
      ({ file, onProgress }: { file: File; onProgress: (fraction: number) => void }) => {
        if (file.name === "network-failure.mp4") {
          onProgress(0.2);
          return Promise.reject(new Error("Network dropped"));
        }

        onProgress(0.42);
        return new Promise<{ id: string }>((resolve) => {
          resolveSuccessfulUpload = resolve;
        });
      },
    );
    renderForm();
    chooseClips([clip("network-failure.mp4"), clip("still-uploads.mp4")]);

    fireEvent.click(screen.getByRole("button", { name: "Upload 2 clips" }));

    const progress = await screen.findByRole("progressbar", {
      name: "still-uploads.mp4 upload progress",
    });
    expect(progress.getAttribute("aria-valuemin")).toBe("0");
    expect(progress.getAttribute("aria-valuemax")).toBe("100");
    expect(progress.getAttribute("aria-valuenow")).toBe("42");
    await waitFor(() => expect(screen.getByText("Network dropped")).toBeTruthy());

    await act(async () => {
      resolveSuccessfulUpload({ id: "asset:still-uploads" });
    });

    await waitFor(() => {
      expect(screen.getByText("1 uploaded · 1 failed")).toBeTruthy();
      expect(screen.getByText("Uploaded")).toBeTruthy();
    });
    expect(uploadMediaMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an oversized file without preventing a valid clip from uploading", async () => {
    uploadMediaMock.mockResolvedValue({ id: "asset:valid" });
    renderForm();
    chooseClips([clip("too-large.mp4", "video/mp4", MAX_FILE_BYTES + 1), clip("valid.mp4")]);

    expect(screen.getByText("File exceeds the 1 GB upload limit.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Upload 1 clip" }));

    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalledTimes(1));
    const options = uploadMediaMock.mock.calls[0]![0] as { file: File; title: string };
    expect(options.file.name).toBe("valid.mp4");
    expect(options.title).toBe("valid.mp4");
    await waitFor(() => expect(screen.getByText("1 uploaded · 1 failed")).toBeTruthy());
  });

  it("searches canonical names only, passes players.id, and locks Club to current_club", async () => {
    uploadMediaMock.mockResolvedValue({ id: "asset:linked" });
    renderForm();
    await waitForRoster();

    fireEvent.click(screen.getByRole("combobox", { name: "Goalkeeper" }));
    fireEvent.change(screen.getByPlaceholderText("Search goalkeepers…"), {
      target: { value: "alex" },
    });

    await waitFor(() => {
      expect(screen.getByText("Alex Goalkeeper")).toBeTruthy();
      expect(screen.queryByText("Zoe Keeper")).toBeNull();
    });
    expect(screen.queryByText("Southern United")).toBeNull();
    expect(screen.queryByText("League One")).toBeNull();

    fireEvent.click(screen.getByText("Alex Goalkeeper"));

    const club = screen.getByLabelText("Club") as HTMLInputElement;
    expect(club.value).toBe("Southern United");
    expect(club.readOnly).toBe(true);
    expect(club.getAttribute("aria-readonly")).toBe("true");

    chooseClips([clip("Alex Goalkeeper 20-08-2026.mp4")]);
    fireEvent.click(screen.getByRole("button", { name: "Upload 1 clip" }));

    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalledTimes(1));
    const options = uploadMediaMock.mock.calls[0]![0] as {
      gkId: string | null;
      title: string;
    };
    expect(options.gkId).toBe(PLAYERS[1]!.id);
    expect(options.title).toBe("Alex Goalkeeper 20-08-2026.mp4");
  });

  it("shows the shared 1 GB limit and accepts a file of exactly that size", async () => {
    uploadMediaMock.mockResolvedValue({ id: "asset:max" });
    renderForm();

    expect(screen.getByText(/Up to 1 GB per file/)).toBeTruthy();

    chooseClips([clip("exact-limit.mp4", "video/mp4", MAX_FILE_BYTES)]);
    expect(screen.queryByText("File exceeds the 1 GB upload limit.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Upload 1 clip" }));

    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalledTimes(1));
    expect((uploadMediaMock.mock.calls[0]![0] as { file: File }).file.name).toBe("exact-limit.mp4");
  });

  it("retries only failed clips and leaves successful ones untouched", async () => {
    uploadMediaMock.mockImplementation(async ({ file }: { file: File }) => {
      if (file.name === "fails.mp4") throw new Error("Network dropped");
      return { id: `asset:${file.name}` };
    });
    renderForm();
    chooseClips([clip("fails.mp4"), clip("ok.mp4")]);
    fireEvent.click(screen.getByRole("button", { name: "Upload 2 clips" }));

    await waitFor(() => expect(screen.getByText("1 uploaded · 1 failed")).toBeTruthy());
    expect(uploadMediaMock).toHaveBeenCalledTimes(2);

    uploadMediaMock.mockClear();
    uploadMediaMock.mockResolvedValue({ id: "asset:retry" });
    fireEvent.click(screen.getByRole("button", { name: "Retry 1 failed" }));

    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalledTimes(1));
    expect((uploadMediaMock.mock.calls[0]![0] as { file: File }).file.name).toBe("fails.mp4");
    await waitFor(() => {
      expect(screen.getByText("2 clips uploaded to the central media repository.")).toBeTruthy();
    });
  });
});
