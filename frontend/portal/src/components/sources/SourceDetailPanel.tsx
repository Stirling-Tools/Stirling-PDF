import { StatTile } from "@shared/components";
import type { BasicDetail, Source } from "@portal/api/sources";
import { AgentPanel } from "@portal/components/sources/AgentPanel";
import { ApiClientPanel } from "@portal/components/sources/ApiClientPanel";
import { WebhookPanel } from "@portal/components/sources/WebhookPanel";
import "@portal/views/Sources.css";

/** Generic key/value grid for the simpler source types (editor, connector, …). */
function BasicPanel({ rows }: { rows: BasicDetail["rows"] }) {
  return (
    <div className="portal-sources__detail">
      <div className="portal-sources__stat-grid">
        {rows.map((r) => (
          <StatTile key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
    </div>
  );
}

/** Renders the detail payload for a source, dispatched on its discriminant. */
export function SourceDetailPanel({ source }: { source: Source }) {
  const { detail } = source;
  switch (detail.kind) {
    case "agent":
      return <AgentPanel d={detail} />;
    case "apiclient":
      return <ApiClientPanel d={detail} />;
    case "webhook":
      return <WebhookPanel d={detail} />;
    case "basic":
      return <BasicPanel rows={detail.rows} />;
  }
}
