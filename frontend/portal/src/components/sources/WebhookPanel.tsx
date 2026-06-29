import { useTranslation } from "react-i18next";
import { Button, StatTile, StatusBadge } from "@shared/components";
import type { WebhookDetail } from "@portal/api/sources";
import { pct } from "@portal/components/sources/format";
import "@portal/views/Sources.css";

export function WebhookPanel({ d }: { d: WebhookDetail }) {
  const { t } = useTranslation();
  const rateTone =
    d.successRate >= 0.99
      ? "success"
      : d.successRate >= 0.95
        ? "warning"
        : "danger";
  return (
    <div className="portal-sources__detail">
      <div className="portal-sources__stat-grid">
        <StatTile
          label={t("sources.webhook.endpointUrl")}
          value={<code className="portal-sources__url">{d.url}</code>}
        />
        <StatTile label={t("sources.webhook.authType")} value={d.authType} />
        <StatTile
          label={t("sources.webhook.successRate")}
          value={
            <StatusBadge tone={rateTone} size="sm">
              {pct(d.successRate)}
            </StatusBadge>
          }
        />
        <StatTile
          label={t("sources.webhook.retries24h")}
          value={d.retries24h}
        />
      </div>

      <div className="portal-sources__detail-section">
        <span className="portal-sources__detail-heading">
          {t("sources.webhook.recentDeliveries")}
        </span>
        <div className="portal-sources__endpoints">
          {d.recentDeliveries.map((r, i) => (
            <div key={i} className="portal-sources__endpoint">
              <StatusBadge
                tone={r.status < 300 ? "success" : "danger"}
                size="sm"
                showDot={false}
              >
                {r.status}
              </StatusBadge>
              <code className="portal-sources__endpoint-path">{r.event}</code>
              <span className="portal-sources__endpoint-calls">{r.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* TODO(backend): wire to POST /v1/sources/{id}/test-event and
          GET /v1/sources/{id}/signing-secret — currently inert demo controls. */}
      <div className="portal-sources__detail-actions">
        <Button size="sm" variant="secondary">
          {t("sources.webhook.sendTestEvent", "Send test event")}
        </Button>
        <Button size="sm" variant="tertiary">
          {t("sources.webhook.viewSigningSecret")}
        </Button>
      </div>
    </div>
  );
}
