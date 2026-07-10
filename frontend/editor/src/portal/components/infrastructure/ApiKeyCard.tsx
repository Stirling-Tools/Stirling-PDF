import { useState } from "react";
import { Button, Card, Chip, StatusBadge } from "@app/ui";
import { useTranslation } from "react-i18next";
import type { ApiKey } from "@portal/api/infrastructure";
import {
  KEY_LABEL,
  KEY_SCOPE_LABEL,
  KEY_SCOPE_TONE,
  KEY_TONE,
} from "@portal/components/infrastructure/infraFormat";

/** Collapsible row for a single API key: header summary + expandable detail grid. */
export function ApiKeyCard({
  apiKey,
  onRevoke,
}: {
  apiKey: ApiKey;
  onRevoke: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const revocable = apiKey.canManage && apiKey.status === "active";
  return (
    <Card padding="default" className="portal-infra__key">
      <Button
        variant="tertiary"
        className="portal-infra__key-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="portal-infra__key-id">
          <span className="portal-infra__cell-strong">{apiKey.name}</span>
          <code className="portal-infra__cell-code">{apiKey.prefix}</code>
        </span>
        <span className="portal-infra__key-head-right">
          <Chip size="sm" accent={KEY_SCOPE_TONE[apiKey.scope]}>
            {apiKey.scope === "personal" || !apiKey.teamName
              ? t(KEY_SCOPE_LABEL[apiKey.scope])
              : `${t(KEY_SCOPE_LABEL[apiKey.scope])} · ${apiKey.teamName}`}
          </Chip>
          <StatusBadge tone={KEY_TONE[apiKey.status]} size="sm">
            {t(KEY_LABEL[apiKey.status])}
          </StatusBadge>
          <span
            className={"portal-infra__chevron" + (open ? " is-open" : "")}
            aria-hidden
          >
            ›
          </span>
        </span>
      </Button>

      {open && (
        <div className="portal-infra__key-body">
          <dl className="portal-infra__kv">
            <div>
              <dt>{t("portal.infrastructure.apiKeys.card.created")}</dt>
              <dd>{apiKey.created}</dd>
            </div>
            <div>
              <dt>{t("portal.infrastructure.apiKeys.card.lastUsed")}</dt>
              <dd>{apiKey.lastUsed}</dd>
            </div>
            <div>
              <dt>{t("portal.infrastructure.apiKeys.card.usageToday")}</dt>
              <dd className="portal-infra__mono">
                {apiKey.usageToday.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>{t("portal.infrastructure.apiKeys.card.usageMonth")}</dt>
              <dd className="portal-infra__mono">
                {apiKey.usageMonth.toLocaleString()}
              </dd>
            </div>
          </dl>

          {revocable && (
            <div className="portal-infra__modal-actions">
              <Button
                variant="secondary"
                accent="danger"
                size="sm"
                onClick={() => onRevoke(apiKey.id)}
              >
                {t("portal.infrastructure.apiKeys.card.revoke")}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
