import { useState } from "react";
import { Button, Card, StatusBadge } from "@app/ui";
import { useTranslation } from "react-i18next";
import type { ApiKey } from "@processor/api/infrastructure";
import {
  KEY_LABEL,
  KEY_TONE,
} from "@processor/components/infrastructure/infraFormat";

/** Collapsible row for a single API key: header summary + expandable detail grid. */
export function ApiKeyCard({
  apiKey,
  onRevoke,
}: {
  apiKey: ApiKey;
  /** Ask to revoke this key; the parent confirms before the destructive call. */
  onRevoke: (key: ApiKey) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const revocable = apiKey.status === "active";
  return (
    <Card padding="default" className="processor-infra__key">
      <Button
        variant="tertiary"
        fullWidth
        justify="between"
        className="processor-infra__key-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        rightSection={
          <span className="processor-infra__key-head-right">
            <StatusBadge tone={KEY_TONE[apiKey.status]} size="sm">
              {t(KEY_LABEL[apiKey.status])}
            </StatusBadge>
            <span
              className={"processor-infra__chevron" + (open ? " is-open" : "")}
              aria-hidden
            >
              ›
            </span>
          </span>
        }
      >
        <span className="processor-infra__key-id">
          <span className="processor-infra__cell-strong">{apiKey.name}</span>
          <code className="processor-infra__cell-code">{apiKey.prefix}</code>
        </span>
      </Button>

      {open && (
        <div className="processor-infra__key-body">
          <dl className="processor-infra__kv">
            <div>
              <dt>{t("processor.infrastructure.apiKeys.card.created")}</dt>
              <dd>{apiKey.created}</dd>
            </div>
            <div>
              <dt>{t("processor.infrastructure.apiKeys.card.lastUsed")}</dt>
              <dd>{apiKey.lastUsed}</dd>
            </div>
            <div>
              <dt>{t("processor.infrastructure.apiKeys.card.usageToday")}</dt>
              <dd className="processor-infra__mono">
                {apiKey.usageToday.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>{t("processor.infrastructure.apiKeys.card.usageMonth")}</dt>
              <dd className="processor-infra__mono">
                {apiKey.usageMonth.toLocaleString()}
              </dd>
            </div>
          </dl>

          {revocable && (
            <div className="processor-infra__modal-actions">
              <Button
                variant="secondary"
                accent="danger"
                size="sm"
                onClick={() => onRevoke(apiKey)}
              >
                {t("processor.infrastructure.apiKeys.card.revoke")}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
