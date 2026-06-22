import { Avatar, Card } from "@shared/components";
import type { Deal } from "@portal/api/procurement";
import { USD, formatDealDate } from "@portal/components/procurement/format";

/**
 * Deal header: the company + assigned solutions engineer, with the trial key
 * and contract figures laid out as a meta grid. Anchors "from trial to live"
 * so the buyer always knows who to talk to and where the paperwork stands.
 */
export function DealSummary({ deal }: { deal: Deal }) {
  const { engineer, trial, quote } = deal;
  return (
    <Card padding="loose" className="portal-proc__deal">
      <div className="portal-proc__deal-top">
        <div>
          <span className="portal-proc__deal-eyebrow">Your deal</span>
          <h2 className="portal-proc__deal-company">{deal.company}</h2>
        </div>
        <div className="portal-proc__se">
          <Avatar name={engineer.name} size="md" tone="purple" />
          <div className="portal-proc__se-text">
            <span className="portal-proc__se-name">{engineer.name}</span>
            <span className="portal-proc__se-title">{engineer.title}</span>
            <a
              className="portal-proc__se-email"
              href={`mailto:${engineer.email}`}
            >
              {engineer.email}
            </a>
          </div>
        </div>
      </div>

      <dl className="portal-proc__deal-meta">
        <div className="portal-proc__deal-meta-item">
          <dt>Trial key</dt>
          <dd className="portal-proc__mono">{trial.key}</dd>
        </div>
        <div className="portal-proc__deal-meta-item">
          <dt>Trial window</dt>
          <dd>
            {formatDealDate(trial.startedOn)} → {formatDealDate(trial.endsOn)}
          </dd>
        </div>
        <div className="portal-proc__deal-meta-item">
          <dt>Extensions used</dt>
          <dd>
            {trial.extensionsUsed} of {trial.maxExtensions}
          </dd>
        </div>
        <div className="portal-proc__deal-meta-item">
          <dt>Quote</dt>
          <dd>
            {quote.number} · {USD.format(quote.amount)} / {quote.term}
          </dd>
        </div>
        <div className="portal-proc__deal-meta-item">
          <dt>Quote valid until</dt>
          <dd>{formatDealDate(quote.validUntil)}</dd>
        </div>
      </dl>
    </Card>
  );
}
