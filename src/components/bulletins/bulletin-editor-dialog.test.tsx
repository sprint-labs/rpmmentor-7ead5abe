// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BulletinEditorDialog } from "@/components/bulletins/bulletin-editor-dialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BulletinEditorDialog", () => {
  it("keeps mentor-created work Open and explains the rule", () => {
    const onSubmit = vi.fn();
    render(
      <BulletinEditorDialog
        open
        item={null}
        defaultKind="deal"
        canManage={false}
        owners={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const status = screen.getByRole("combobox", { name: "Status" }) as HTMLSelectElement;
    expect(status.value).toBe("open");
    expect(status.disabled).toBe(true);
    expect(
      screen.getByText("New mentor items start Open. A manager can change the status later."),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Club need" } });
    fireEvent.change(screen.getByLabelText(/Subject \*/), { target: { value: "EFL club" } });
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "deal",
        title: "Club need",
        subjectName: "EFL club",
        status: "open",
        ownerId: null,
      }),
    );
  });

  it("lets management assign an owner and choose a status", () => {
    const onSubmit = vi.fn();
    render(
      <BulletinEditorDialog
        open
        item={null}
        defaultKind="mandate"
        canManage
        owners={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Rich Lee",
            isManager: true,
          },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Keeper brief" } });
    fireEvent.change(screen.getByLabelText(/Subject \*/), {
      target: { value: "Championship club" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "blocked" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Owner" }), {
      target: { value: "11111111-1111-4111-8111-111111111111" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "mandate",
        status: "blocked",
        ownerId: "11111111-1111-4111-8111-111111111111",
      }),
    );
  });
});
