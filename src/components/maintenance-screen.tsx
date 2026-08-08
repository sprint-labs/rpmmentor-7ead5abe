import { Clock3, LogOut, RefreshCw, Wrench } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

interface MaintenanceScreenProps {
  onSignOut: () => void | Promise<void>;
  onCheckAgain?: () => void;
}

export function MaintenanceScreen({ onSignOut, onCheckAgain }: MaintenanceScreenProps) {
  const checkAgain =
    onCheckAgain ??
    (() => {
      if (typeof window !== "undefined") window.location.reload();
    });

  return (
    <main className="relative min-h-dvh bg-background px-5 py-10 text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,229,160,0.12),transparent_42%)]"
      />

      <div className="relative mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-2xl items-center justify-center">
        <section
          aria-labelledby="maintenance-title"
          className="w-full rounded-2xl border border-border bg-card/90 p-6 shadow-2xl backdrop-blur sm:p-10"
        >
          <div className="flex items-center justify-between gap-4">
            <BrandMark className="size-12 shrink-0" alt="Mentor Hub" />
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
              <span
                className="size-2 rounded-full bg-primary motion-safe:animate-pulse"
                aria-hidden="true"
              />
              Temporary maintenance
            </div>
          </div>

          <div className="mt-10">
            <div className="mb-5 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <Wrench className="size-6" aria-hidden="true" />
            </div>
            <h1
              id="maintenance-title"
              className="max-w-xl font-display text-4xl font-bold uppercase leading-[1.05] tracking-[0.02em] sm:text-5xl"
            >
              Final updates in progress
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              Mentor Hub is temporarily unavailable while we complete final updates.
            </p>
          </div>

          <div className="mt-8 flex gap-3 rounded-xl border border-border bg-background/70 p-4">
            <Clock3 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Access will be restored shortly</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                We expect the platform to be live again within the next couple of hours.
              </p>
            </div>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            If you have any questions, please contact{" "}
            <span className="font-semibold text-foreground">Luke</span>.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={checkAgain}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold uppercase tracking-[0.06em] text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Check again
            </button>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-xs font-semibold uppercase tracking-[0.06em] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
