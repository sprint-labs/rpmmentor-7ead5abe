import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Check, Moon, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme, type Theme } from "@/lib/theme";
import { PageHeader, Card } from "@/components/primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings · Mentor Hub" },
      { name: "description", content: "Choose how Mentor Hub looks on this device." },
    ],
  }),
});

const APPEARANCES: { value: Theme; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", hint: "Bright background, dark text", icon: Sun },
  { value: "dark", label: "Dark", hint: "Carbon background, light text", icon: Moon },
];

function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  if (!user) return <Navigate to="/login" search={{ next: "" }} />;

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <PageHeader title="Settings" description="How Mentor Hub looks and behaves for you." />

      <Card className="p-4">
        <fieldset>
          <legend className="text-sm font-semibold">Appearance</legend>
          <p className="mt-0.5 text-xs text-muted-foreground">Saved on this device.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {APPEARANCES.map(({ value, label, hint, icon: Icon }) => {
              const selected = theme === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "relative flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors",
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
                    selected ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40",
                  )}
                >
                  <input
                    type="radio"
                    name="appearance"
                    value={value}
                    checked={selected}
                    onChange={() => setTheme(value)}
                    className="sr-only"
                  />
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      selected ? "text-primary-ink" : "text-muted-foreground",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-[11px] text-muted-foreground">{hint}</span>
                  </span>
                  {selected && (
                    <Check className="size-4 shrink-0 text-primary-ink" aria-hidden="true" />
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      </Card>
    </div>
  );
}
