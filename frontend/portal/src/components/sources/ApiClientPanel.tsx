import { Button, Chip, ProgressBar, StatTile } from "@shared/components";
import type { ApiClientDetail } from "@portal/api/sources";
import { pct } from "@portal/components/sources/format";
import "@portal/views/Sources.css";

export function ApiClientPanel({ d }: { d: ApiClientDetail }) {
  return (
    <div className="portal-sources__detail">
      <div className="portal-sources__stat-grid">
        <StatTile label="Secret key" value={<code>{d.maskedKey}</code>} />
        <StatTile label="Rate limit" value={d.rateLimit} />
        <StatTile label="Created by" value={d.createdBy} />
        <StatTile label="Last rotated" value={d.lastRotated} />
      </div>

      <div className="portal-sources__bar-row">
        <div className="portal-sources__bar-head">
          <span>Rate-limit window</span>
          <strong>{pct(d.rateUsedPct)} used</strong>
        </div>
        <ProgressBar
          value={d.rateUsedPct}
          thresholded
          label="Rate-limit usage"
        />
      </div>

      <div className="portal-sources__detail-section">
        <span className="portal-sources__detail-heading">Top endpoints</span>
        <div className="portal-sources__endpoints">
          {d.endpoints.map((e) => (
            <div key={e.path} className="portal-sources__endpoint">
              <Chip
                tone={e.method === "GET" ? "green" : "blue"}
                size="sm"
                className="portal-sources__method"
              >
                {e.method}
              </Chip>
              <code className="portal-sources__endpoint-path">{e.path}</code>
              <span className="portal-sources__endpoint-calls">
                {e.calls24h.toLocaleString()} / 24h
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* TODO(backend): wire to POST /v1/sources/{id}/rotate-key and
          DELETE /v1/sources/{id} — currently inert demo controls. */}
      <div className="portal-sources__detail-actions">
        <Button size="sm" variant="outline" accent="amber">
          Rotate key
        </Button>
        <Button size="sm" variant="ghost" accent="red">
          Revoke
        </Button>
      </div>
    </div>
  );
}
