import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Download,
  Share,
  Plus,
  MoreVertical,
  CheckCircle2,
  Smartphone,
  Monitor,
} from "lucide-react";

export const Route = createFileRoute("/install")({
  component: InstallPage,
  head: () => ({
    meta: [
      { title: "Install Mentor Hub" },
      {
        name: "description",
        content:
          "Install Mentor Hub on iOS, Android, or desktop for a fullscreen app experience with offline support.",
      },
      { property: "og:title", content: "Install Mentor Hub" },
      {
        property: "og:description",
        content: "Step-by-step install guide for iOS, Android and desktop.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://rpmmentor.com/install" }],
  }),
});

type Platform = "ios" | "android" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
  if (/iPad|iPhone|iPod/.test(ua) || iPadOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function InstallPage() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function triggerInstall() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  const tabs: { id: Platform; label: string; icon: typeof Smartphone }[] = [
    { id: "ios", label: "iOS", icon: Smartphone },
    { id: "android", label: "Android", icon: Smartphone },
    { id: "desktop", label: "Desktop", icon: Monitor },
  ];
  const active: Platform = platform === "unknown" ? "desktop" : platform;
  const [tab, setTab] = useState<Platform>(active);
  useEffect(() => {
    setTab(active);
  }, [active]);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <div className="flex size-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Download className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Install Mentor Hub
        </h1>
        <p className="text-sm text-muted-foreground">
          Add Mentor Hub to your home screen for a fullscreen, app-like experience with offline
          access to core screens.
        </p>
      </header>

      {installed && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-foreground">
          <CheckCircle2 className="size-4 text-primary" />
          You're using the installed app. Nothing more to do.
        </div>
      )}

      {!installed && deferred && (
        <button
          type="button"
          onClick={triggerInstall}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Download className="size-4" /> Install now
        </button>
      )}

      <div role="tablist" className="flex gap-1 rounded-md border border-border bg-card p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              className={
                "flex-1 inline-flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] " +
                (isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <Icon className="size-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "ios" && (
        <Section title="Install on iPhone or iPad">
          <Note>
            Open this page in <strong>Safari</strong>. Chrome and Firefox on iOS cannot install
            PWAs.
          </Note>
          <Steps>
            <Step n={1} label="Tap the Share button">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                at the bottom of Safari <Share className="size-4" />
              </span>
            </Step>
            <Step n={2} label="Scroll and tap">
              <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-foreground">
                <Plus className="size-3" /> Add to Home Screen
              </span>
            </Step>
            <Step
              n={3}
              label="Tap Add"
              description="Confirm the name and Mentor Hub will appear on your home screen."
            />
          </Steps>
        </Section>
      )}

      {tab === "android" && (
        <Section title="Install on Android">
          <Note>
            Best supported in <strong>Chrome</strong>, Edge, or Samsung Internet.
          </Note>
          <Steps>
            <Step n={1} label="Tap the menu">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                top-right of the browser <MoreVertical className="size-4" />
              </span>
            </Step>
            <Step
              n={2}
              label="Choose Install app"
              description="Or 'Add to Home screen' depending on your browser."
            />
            <Step
              n={3}
              label="Tap Install"
              description="Mentor Hub will install and open like a native app."
            />
          </Steps>
          {!installed && !deferred && (
            <p className="text-xs text-muted-foreground">
              Not seeing a prompt? Use the browser menu above — Chrome only surfaces the native
              prompt after a short visit.
            </p>
          )}
        </Section>
      )}

      {tab === "desktop" && (
        <Section title="Install on Desktop">
          <Note>
            Works in <strong>Chrome</strong>, Edge, and Brave on macOS, Windows and Linux.
          </Note>
          <Steps>
            <Step
              n={1}
              label="Click the install icon"
              description="In the address bar (a small monitor with a down arrow), or open the browser menu."
            />
            <Step
              n={2}
              label="Click Install"
              description="Mentor Hub opens in its own window, separate from browser tabs."
            />
          </Steps>
        </Section>
      )}

      <Section title="What you get">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> Fullscreen app window
            without browser chrome
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> Offline access to core
            dashboards during brief outages
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> Faster launch from your
            home screen or dock
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> Automatic updates when
            a new version ships
          </li>
        </ul>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-border/60 bg-background/50 p-2 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="space-y-3">{children}</ol>;
}

function Step({
  n,
  label,
  description,
  children,
}: {
  n: number;
  label: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
        {n}
      </span>
      <div className="min-w-0 space-y-1 text-sm">
        <p className="font-medium text-foreground">{label}</p>
        {children && <div className="text-xs">{children}</div>}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </li>
  );
}
