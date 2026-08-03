import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./error-boundary";

const BadChild = () => {
  throw new Error("boom");
};

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div data-testid="ok">content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("ok")).toBeInTheDocument();
  });

  it("catches render errors and renders the fallback UI", () => {
    // Suppress expected error noise in test output.
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <BadChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("supports a render-prop fallback and resets when requested", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const resetHandler = vi.fn();

    function MaybeBad({ explode }: { explode: boolean }) {
      if (explode) throw new Error("boom");
      return <div data-testid="ok">content</div>;
    }

    const { rerender } = render(
      <ErrorBoundary
        fallback={(reset) => (
          <div>
            <p>custom fallback</p>
            <button onClick={() => { resetHandler(); reset(); }}>Reset</button>
          </div>
        )}
      >
        <MaybeBad explode={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("custom fallback")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(resetHandler).toHaveBeenCalled();

    // After the child is fixed, a reset re-renders children.
    rerender(
      <ErrorBoundary
        fallback={(reset) => (
          <div>
            <p>custom fallback</p>
            <button onClick={() => { resetHandler(); reset(); }}>Reset</button>
          </div>
        )}
      >
        <MaybeBad explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("ok")).toBeInTheDocument();
  });
});
