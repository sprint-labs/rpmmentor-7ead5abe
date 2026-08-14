import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Card, Pill, StatCard } from "@/components/primitives";
import { alerts, getGk, formatRelative } from "@/lib/mock-data";
import { AlertTriangle, Mail, Send, Check, Trash2 } from "lucide-react";
import { useNotifications, type EmailFrequency } from "@/lib/notifications";
import { useState } from "react";
import { withPermission } from "@/components/require-permission";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/alerts")({
  component: withPermission(AlertsPage, "alerts.view"),
});

const GROUPS = [
  "Overdue observation",
  "Overdue contact",
  "Missing report",
  "Upcoming match",
  "Expiring action",
] as const;
type Group = (typeof GROUPS)[number];
type Filter = "all" | Group;

function AlertsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const high = alerts.filter((a) => a.severity === "high").length;
  const med = alerts.filter((a) => a.severity === "medium").length;
  const low = alerts.filter((a) => a.severity === "low").length;

  const groups = GROUPS;
  const visibleGroups: readonly Group[] = filter === "all" ? groups : [filter];

  const filterTabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: alerts.length },
    ...groups.map((g) => ({
      id: g as Filter,
      label: g,
      count: alerts.filter((a) => a.kind === g).length,
    })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alerts Engine"
        description="Conditions across the platform that need attention, plus duty-of-care notifications and email summaries."
      />

      <DutyNotificationsPanel />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Alerts" value={alerts.length} />
        <StatCard label="High" value={high} accent="destructive" />
        <StatCard label="Medium" value={med} accent="warning" />
        <StatCard label="Low" value={low} accent="info" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filterTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors",
              filter === t.id
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent/40",
            )}
          >
            {t.label}
            <span className="tabular-nums font-mono text-[10px] text-muted-foreground">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {alerts.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="text-sm font-medium mb-1">No alerts to review</div>
            <div className="text-xs text-muted-foreground">
              Overdue observations, missing reports and upcoming-fixture warnings will appear here
              once they are generated from live data.
            </div>
          </Card>
        ) : (
          visibleGroups.map((g) => {
            const list = alerts.filter((a) => a.kind === g);
            if (!list.length) return null;
            return (
              <Card key={g} className="p-4">
                <div className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">
                  {g} <span className="text-foreground/60">({list.length})</span>
                </div>
                <div className="divide-y divide-border">
                  {list.map((a) => {
                    const gk = a.gkId ? getGk(a.gkId) : undefined;
                    return (
                      <div key={a.id} className="flex items-center gap-3 py-2.5">
                        <AlertTriangle
                          className={`size-4 ${a.severity === "high" ? "text-destructive" : a.severity === "medium" ? "text-warning" : "text-info"}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm">{a.message}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatRelative(a.date)}
                          </div>
                        </div>
                        <Pill
                          tone={
                            a.severity === "high"
                              ? "destructive"
                              : a.severity === "medium"
                                ? "warning"
                                : "info"
                          }
                        >
                          {a.severity}
                        </Pill>
                        {gk && (
                          <Link
                            to="/goalkeepers/$gkId"
                            params={{ gkId: gk.id }}
                            className="text-xs text-primary"
                          >
                            Open →
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function DutyNotificationsPanel() {
  const { items, unread, markAllRead, markRead, clearAll, prefs, setPrefs, sendSummaryNow } =
    useNotifications();
  const [recipientDraft, setRecipientDraft] = useState("");

  const addRecipient = () => {
    const v = recipientDraft.trim();
    if (!v || prefs.recipients.includes(v)) return;
    setPrefs({ ...prefs, recipients: [...prefs.recipients, v] });
    setRecipientDraft("");
  };
  const removeRecipient = (email: string) =>
    setPrefs({ ...prefs, recipients: prefs.recipients.filter((r) => r !== email) });

  const FREQS: { id: EmailFrequency; label: string; hint: string }[] = [
    { id: "off", label: "Off", hint: "No emails" },
    { id: "daily", label: "Daily", hint: "08:00 GMT digest" },
    { id: "weekly", label: "Weekly", hint: "Monday 08:00" },
  ];

  const attn = items.filter((i) => i.to === "overdue" || i.to === "due_soon").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="p-4 lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Duty Status Notifications
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Triggered when a goalkeeper's traffic light changes (e.g. green → amber).
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground tabular-nums font-mono">
              {unread} unread · {items.length} total
            </span>
            <button
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-accent"
            >
              <Check className="size-3" />
              Mark read
            </button>
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-accent"
            >
              <Trash2 className="size-3" />
              Clear
            </button>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto divide-y divide-border/60">
          {items.length === 0 && (
            <div className="text-xs text-muted-foreground py-8 text-center">
              No duty changes recorded yet.
            </div>
          )}
          {items.map((n) => {
            const tone =
              n.to === "overdue"
                ? "bg-destructive"
                : n.to === "due_soon"
                  ? "bg-warning"
                  : n.to === "up_to_date"
                    ? "bg-success"
                    : "bg-muted-foreground/50";
            const sev: "destructive" | "warning" | "info" | "muted" =
              n.to === "overdue"
                ? "destructive"
                : n.to === "due_soon"
                  ? "warning"
                  : n.to === "up_to_date"
                    ? "info"
                    : "muted";
            const label = (l: string) => l.replace(/_/g, " ");
            return (
              <div
                key={n.id}
                className={`flex items-center gap-3 py-2.5 ${!n.read ? "" : "opacity-70"}`}
              >
                <span className={`size-2.5 rounded-full ${tone} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-medium">{n.gkName}</span> · duty moved{" "}
                    <span className="uppercase text-muted-foreground">{label(n.from)}</span> →{" "}
                    <span className="uppercase font-medium">{label(n.to)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{formatRelative(n.date)}</div>
                </div>
                <Pill tone={sev === "muted" ? "muted" : sev}>{label(n.to)}</Pill>
                <Link
                  to="/goalkeepers/$gkId"
                  params={{ gkId: n.gkId }}
                  onClick={() => markRead(n.id)}
                  className="text-xs text-primary"
                >
                  Open →
                </Link>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Mail className="size-4" />
            Email Summaries
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Optional digest sent to operations leads when duty status changes.
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {FREQS.map((f) => (
            <button
              key={f.id}
              onClick={() => setPrefs({ ...prefs, frequency: f.id })}
              className={`rounded-md border px-2 py-2 text-left transition-colors ${prefs.frequency === f.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40"}`}
            >
              <div className="text-xs font-semibold">{f.label}</div>
              <div className="text-[10px] text-muted-foreground">{f.hint}</div>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Recipients
          </div>
          <div className="flex flex-wrap gap-1.5">
            {prefs.recipients.length === 0 && (
              <span className="text-xs text-muted-foreground">No recipients configured.</span>
            )}
            {prefs.recipients.map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-accent/40 border border-border"
              >
                {r}
                <button
                  onClick={() => removeRecipient(r)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={recipientDraft}
              onChange={(e) => setRecipientDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRecipient();
                }
              }}
              placeholder="name@refuelpm.com"
              type="email"
              className="flex-1 h-8 px-2 rounded-md bg-input/60 border border-border text-xs"
            />
            <button
              onClick={addRecipient}
              className="text-xs px-2 rounded-md border border-border hover:bg-accent"
            >
              Add
            </button>
          </div>
        </div>

        <div className="rounded-md border border-border p-2.5 bg-accent/20 text-[11px] text-muted-foreground space-y-1">
          <div>
            Current queue:{" "}
            <span className="text-foreground font-medium">{attn} needing attention</span>
          </div>
          {prefs.lastSent && <div>Last sent: {formatRelative(prefs.lastSent)}</div>}
        </div>

        <button
          onClick={sendSummaryNow}
          disabled={prefs.frequency === "off"}
          className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40"
        >
          <Send className="size-4" />
          Send summary now
        </button>
      </Card>
    </div>
  );
}
