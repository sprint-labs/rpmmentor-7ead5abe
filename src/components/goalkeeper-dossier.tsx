/**
 * The dossier on screen.
 *
 * Renders the same `GoalkeeperDossier` the PDF writer renders, so the HTML a
 * mentor reads and the file they send are one document. Everything here is
 * presentation: no fetching, no arithmetic, no identity matching.
 *
 * Laid out as paper rather than as a dashboard — one column, A4-ish measure,
 * printable. `src/styles.css` already flips the whole app to the print theme
 * under `@media print` and hides `.no-print`, so Ctrl-P on this component gives
 * the same document as the PDF export without a second stylesheet.
 */
import { Avatar, Card, Pill, TierBadge } from "@/components/primitives";
import { scoreTone } from "@/lib/score-band";
import { cn } from "@/lib/utils";
import type { DossierFact, GoalkeeperDossier } from "@/lib/dossier/goalkeeper-dossier";
import type { Tier } from "@/lib/mock-data";

function FactGrid({ facts }: { facts: readonly DossierFact[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {fact.label}
          </dt>
          <dd className="text-sm font-medium text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DossierSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid border-t border-border pt-4">
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] font-mono text-primary-ink">
        {title}
      </h2>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function GoalkeeperDossierDocument({
  dossier,
  className,
}: {
  dossier: GoalkeeperDossier;
  className?: string;
}) {
  const { headline } = dossier;
  return (
    <article
      className={cn("mx-auto w-full max-w-3xl space-y-5", className)}
      aria-label={`Goalkeeper dossier for ${dossier.name}`}
    >
      <header className="flex items-start gap-4">
        <Avatar
          initials={dossier.initials}
          size={72}
          imageUrl={dossier.profileImage ?? undefined}
          alt={`${dossier.name} portrait`}
        />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] font-mono text-primary-ink">
            Goalkeeper dossier
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{dossier.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dossier.clubLine} · {dossier.league}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TierBadge tier={dossier.tier as Tier | null} />
            {dossier.tags.map((tag) => (
              <TierBadge key={tag} tier={tag as Tier} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Generated {dossier.generatedAtLabel} · Mentor Hub by RPM
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            { label: "Av. Rating", value: headline.averageRatingLabel },
            { label: "Recommendation", value: headline.recommendation },
            { label: "Match reports", value: String(headline.reportsTotal) },
            { label: "Interactions", value: String(headline.interactionsTotal) },
          ] as const
        ).map((stat) => (
          <Card key={stat.label} className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </div>
            <div className="text-sm font-semibold">{stat.value}</div>
          </Card>
        ))}
      </div>

      <DossierSection title="Profile">
        <FactGrid facts={dossier.facts} />
      </DossierSection>

      {dossier.biography ? (
        <DossierSection title="Biography">
          <p className="text-sm leading-relaxed text-muted-foreground">{dossier.biography}</p>
        </DossierSection>
      ) : null}

      {dossier.developmentPlan.length ? (
        <DossierSection title="Development plan">
          <ul className="space-y-1.5">
            {dossier.developmentPlan.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-relaxed">
                <span aria-hidden className="text-primary-ink">
                  •
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </DossierSection>
      ) : null}

      {dossier.seasonStats ? (
        <DossierSection title={`Season stats — ${dossier.seasonStats.seasonLabel}`}>
          <FactGrid facts={dossier.seasonStats.rows} />
        </DossierSection>
      ) : null}

      <DossierSection
        title="Skill scores"
        hint={
          dossier.pillarWindowSize
            ? `Mean of the ${dossier.pillarWindowSize} most recent Match Report${dossier.pillarWindowSize === 1 ? "" : "s"}.`
            : "No Match Reports scored yet."
        }
      >
        <ul className="divide-y divide-border">
          {dossier.pillars.map((pillar) => (
            <li key={pillar.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="text-sm">{pillar.label}</span>
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  pillar.score == null ? "text-muted-foreground" : scoreTone(pillar.score).ink,
                )}
              >
                {pillar.score == null ? "—" : `${pillar.score.toFixed(1)}/5`}
              </span>
            </li>
          ))}
        </ul>
      </DossierSection>

      <DossierSection
        title={`Recent match reports (${dossier.reports.length} of ${headline.reportsTotal})`}
      >
        {dossier.reports.length ? (
          <ul className="space-y-3">
            {dossier.reports.map((report) => (
              <li key={report.id} className="break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {report.dateLabel} — {report.fixture}
                  </span>
                  <Pill>{report.averageLabel}</Pill>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Competition: {report.competition} · Coach: {report.coach}
                </p>
                {report.comments ? (
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {report.comments}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No Match Reports on file.</p>
        )}
      </DossierSection>

      <DossierSection
        title={`Recent interactions (${dossier.interactions.length} of ${headline.interactionsTotal})`}
      >
        {dossier.interactions.length ? (
          <ul className="space-y-3">
            {dossier.interactions.map((interaction) => (
              <li key={interaction.id} className="break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {interaction.dateLabel} — {interaction.type}
                  </span>
                  <Pill>{interaction.outcome}</Pill>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Mentor: {interaction.mentor}
                </p>
                {interaction.notes ? (
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {interaction.notes}
                  </p>
                ) : null}
                {interaction.followUp ? (
                  <p className="mt-1 text-sm leading-relaxed">
                    <span className="text-muted-foreground">Follow-up: </span>
                    {interaction.followUp}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No interactions logged.</p>
        )}
      </DossierSection>
    </article>
  );
}
