import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Chip, StatusBadge } from "@shared/components";
import type { ApiKey } from "@portal/api/infrastructure";
import {
  KEY_LABEL,
  KEY_TONE,
} from "@portal/components/infrastructure/infraFormat";

/** Collapsible row for a single API key: header summary + expandable detail grid. */
export function ApiKeyCard({ apiKey }: { apiKey: ApiKey }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Card padding="default" className="portal-infra__key">
      <button
        type="button"
        className="portal-infra__key-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="portal-infra__key-id">
          <span className="portal-infra__cell-strong">{apiKey.name}</span>
          <code className="portal-infra__cell-code">{apiKey.prefix}</code>
        </span>
        <span className="portal-infra__key-head-right">
          <StatusBadge tone={KEY_TONE[apiKey.status]} size="sm">
            {KEY_LABEL[apiKey.status]}
          </StatusBadge>
          <span
            className={"portal-infra__chevron" + (open ? " is-open" : "")}
            aria-hidden
          >
            ›
          </span>
        </span>
      </button>

      {open && (
        <div className="portal-infra__key-body">
          <dl className="portal-infra__kv">
            <div>
              <dt>{t("infrastructure.apiKeys.card.created")}</dt>
              <dd>{apiKey.created}</dd>
            </div>
            <div>
              <dt>{t("infrastructure.apiKeys.card.lastUsed")}</dt>
              <dd>{apiKey.lastUsed}</dd>
            </div>
            <div>
              <dt>{t("infrastructure.apiKeys.card.rateLimit")}</dt>
              <dd className="portal-infra__mono">
                {t("infrastructure.apiKeys.card.rateLimitValue", {
                  value: apiKey.rateLimit.toLocaleString(),
                })}
              </dd>
            </div>
            <div>
              <dt>{t("infrastructure.apiKeys.card.usageToday")}</dt>
              <dd className="portal-infra__mono">
                {apiKey.usageToday.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>{t("infrastructure.apiKeys.card.usageMonth")}</dt>
              <dd className="portal-infra__mono">
                {apiKey.usageMonth.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>{t("infrastructure.apiKeys.card.permissions")}</dt>
              <dd className="portal-infra__chips">
                {apiKey.permissions.map((p) => (
                  <Chip key={p} tone="blue" size="sm">
                    {p}
                  </Chip>
                ))}
              </dd>
            </div>
            <div className="portal-infra__kv-wide">
              <dt>{t("infrastructure.apiKeys.card.allowedIps")}</dt>
              <dd className="portal-infra__chips">
                {apiKey.allowedIps.length === 0 ? (
                  <span className="portal-infra__muted">
                    {t("infrastructure.apiKeys.card.anyIp")}
                  </span>
                ) : (
                  apiKey.allowedIps.map((ip) => (
                    <Chip key={ip} tone="neutral" size="sm">
                      <span className="portal-infra__mono">{ip}</span>
                    </Chip>
                  ))
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}
