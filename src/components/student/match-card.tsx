import { RequestIntroForm } from "@/components/request-actions";
import { Badge, DemoBadge, TagList } from "@/components/ui";
import type { Match } from "@/lib/domain/matching";
import { formatReason, getMessages, slotLabel } from "@/lib/i18n";

const m = getMessages();

export function ScoreMeter({ score }: { score: number }) {
  const tone = score >= 75 ? "bg-emerald-600" : score >= 50 ? "bg-brand-600" : "bg-amber-500";
  return (
    <div className="w-28 text-right" role="img" aria-label={m.matching.scoreLabel(score)}>
      <p className="font-serif text-3xl font-semibold leading-none text-brand-900">
        {score}
        <span className="text-base font-normal text-muted">/100</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className={`h-full ${tone}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function MatchCard({ match, requested }: { match: Match; requested: boolean }) {
  const p = match.provider;
  const headingId = `match-${p.userId}-${match.service}`;
  return (
    <article className="card" aria-labelledby={headingId}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={match.service === "tutoring" ? "warning" : "brand"}>{m.services[match.service]}</Badge>
            <DemoBadge show={p.isDemo} />
          </div>
          <h3 id={headingId} className="mt-2 font-serif text-xl font-semibold text-brand-900">
            {p.fullName}
          </h3>
          {p.headline && <p className="text-sm text-muted">{p.headline}</p>}
        </div>
        <ScoreMeter score={match.score} />
      </div>

      <p className="mt-4 line-clamp-3 text-sm text-ink">{p.bio}</p>

      <div className="mt-4 rounded-xl bg-brand-50/60 p-4">
        <h4 className="text-sm font-semibold text-brand-900">{m.matching.howScored}</h4>
        <ul className="mt-2 space-y-1.5">
          {match.reasons.map((r) => (
            <li key={r.factor} className="flex items-start justify-between gap-3 text-sm">
              <span>{formatReason(r)}</span>
              <span className="shrink-0 tabular-nums text-muted" aria-label={`${r.points} of ${r.max} points`}>
                +{r.points}
                <span className="text-xs">/{r.max}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold">Languages</dt>
          <dd className="mt-1">
            <TagList items={p.languages.map((l) => m.languages[l])} />
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Usually available ({p.timeZone.replace(/_/g, " ")})</dt>
          <dd className="mt-1">
            <TagList items={p.availability.map((s) => slotLabel(m, s))} />
          </dd>
        </div>
        {p.expertise.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="font-semibold">Expertise</dt>
            <dd className="mt-1">
              <TagList items={p.expertise} />
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-5">
        {requested ? (
          <p className="text-sm font-medium text-brand-800">
            ✓ You have an open request with {p.fullName} for {m.services[match.service].toLowerCase()}. Track it under &ldquo;Your requests&rdquo;.
          </p>
        ) : (
          <RequestIntroForm providerId={p.userId} service={match.service} providerName={p.fullName} />
        )}
      </div>
    </article>
  );
}
