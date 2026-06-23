import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  ProgressBar,
  Select,
  Skeleton,
  StatusBadge,
} from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchStorage,
  type RetentionWindow,
  type StorageConfig,
} from "@portal/api/infrastructure";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";
import { pct } from "@portal/components/infrastructure/infraFormat";

const PROVIDER_GLYPH: Record<
  StorageConfig["providers"][number]["kind"],
  string
> = {
  stirling: "◆",
  s3: "▣",
  azure: "▤",
};

/** Storage fills past this fraction of quota are surfaced in red. */
const USAGE_DANGER_FRAC = 0.8;

export function StorageTab() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<StorageConfig>(() => fetchStorage(tier), [tier]);
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const RETENTION_OPTS = [
    {
      value: "30",
      label: t("infrastructure.storage.retentionOption.days", { count: 30 }),
    },
    {
      value: "60",
      label: t("infrastructure.storage.retentionOption.days", { count: 60 }),
    },
    {
      value: "90",
      label: t("infrastructure.storage.retentionOption.days", { count: 90 }),
    },
    {
      value: "180",
      label: t("infrastructure.storage.retentionOption.days", { count: 180 }),
    },
    {
      value: "never",
      label: t("infrastructure.storage.retentionOption.never"),
    },
  ];

  // TODO(backend): PATCH /v1/infrastructure/storage { retention }
  const [retention, setRetention] = useState<RetentionWindow | null>(null);
  const retentionValue = retention ?? data?.retention ?? "90";

  if (isLoading) {
    return (
      <div className="portal-infra__stack" aria-hidden>
        <Skeleton height="6rem" />
        <Skeleton height="9rem" />
      </div>
    );
  }

  if (isEmpty || !data) {
    return (
      <EmptyState
        size="compact"
        title={t("infrastructure.storage.empty.title")}
        description={t("infrastructure.storage.empty.description")}
      />
    );
  }

  const usedFrac = data.quotaGb > 0 ? data.usedGb / data.quotaGb : 0;
  const overThreshold = usedFrac > USAGE_DANGER_FRAC;

  return (
    <div className="portal-infra__stack">
      <section>
        <SectionHeader
          title={t("infrastructure.storage.totalUsage.heading")}
          sub={t("infrastructure.storage.totalUsage.subheading")}
        />
        <Card padding="loose">
          <div className="portal-infra__usage-head">
            <span className="portal-infra__usage-value">
              {t("infrastructure.storage.gbValue", {
                value: data.usedGb.toLocaleString(),
              })}
              <span className="portal-infra__muted">
                {" "}
                /{" "}
                {t("infrastructure.storage.gbValue", {
                  value: data.quotaGb.toLocaleString(),
                })}
              </span>
            </span>
            <StatusBadge tone={overThreshold ? "danger" : "success"} size="sm">
              {t("infrastructure.storage.percentUsed", {
                value: pct(usedFrac),
              })}
            </StatusBadge>
          </div>
          <ProgressBar
            value={usedFrac}
            height={10}
            color={
              overThreshold
                ? "linear-gradient(90deg, var(--color-red), color-mix(in srgb, var(--color-red) 70%, white))"
                : "linear-gradient(90deg, var(--color-green), color-mix(in srgb, var(--color-green) 70%, white))"
            }
            label={t("infrastructure.storage.totalUsage.progressLabel")}
          />
        </Card>
      </section>

      <section className="portal-infra__split">
        <Card padding="loose">
          <SectionHeader
            title={t("infrastructure.storage.providers.heading")}
            sub={t("infrastructure.storage.providers.subheading")}
          />
          <ul className="portal-infra__providers">
            {data.providers.map((p) => (
              <li key={p.id} className="portal-infra__provider">
                <span className="portal-infra__provider-glyph" aria-hidden>
                  {PROVIDER_GLYPH[p.kind]}
                </span>
                <span className="portal-infra__provider-text">
                  <span className="portal-infra__cell-strong">{p.name}</span>
                  <span className="portal-infra__muted">{p.detail}</span>
                </span>
                {p.connected ? (
                  <span className="portal-infra__provider-meta">
                    <span className="portal-infra__mono">
                      {t("infrastructure.storage.gbValue", { value: p.usedGb })}
                    </span>
                    <StatusBadge tone="success" size="sm">
                      {t("infrastructure.storage.providers.connected")}
                    </StatusBadge>
                  </span>
                ) : (
                  // TODO(backend): launch the provider OAuth/credential flow,
                  // then POST /v1/infrastructure/storage/providers/{id}/connect
                  <Button variant="outline" size="sm">
                    {t("infrastructure.storage.providers.connect")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card padding="loose">
          <SectionHeader
            title={t("infrastructure.storage.retention.heading")}
            sub={t("infrastructure.storage.retention.subheading")}
          />
          <FormField label={t("infrastructure.storage.retention.windowLabel")}>
            <Select
              options={RETENTION_OPTS}
              value={retentionValue}
              onChange={(e) => setRetention(e.target.value as RetentionWindow)}
            />
          </FormField>

          <div className="portal-infra__lifecycle">
            <div className="portal-infra__lifecycle-stage is-active">
              <span className="portal-infra__lifecycle-dot" />
              <span className="portal-infra__lifecycle-label">
                {t("infrastructure.storage.lifecycle.active")}
              </span>
              <span className="portal-infra__muted">
                {t("infrastructure.storage.lifecycle.activeRange", {
                  value: retentionValue === "never" ? "∞" : retentionValue,
                })}
              </span>
            </div>
            <span className="portal-infra__lifecycle-arrow" aria-hidden>
              →
            </span>
            <div className="portal-infra__lifecycle-stage">
              <span className="portal-infra__lifecycle-dot" />
              <span className="portal-infra__lifecycle-label">
                {t("infrastructure.storage.lifecycle.archived")}
              </span>
              <span className="portal-infra__muted">
                {t("infrastructure.storage.lifecycle.coldStorage")}
              </span>
            </div>
            <span className="portal-infra__lifecycle-arrow" aria-hidden>
              →
            </span>
            <div className="portal-infra__lifecycle-stage">
              <span className="portal-infra__lifecycle-dot" />
              <span className="portal-infra__lifecycle-label">
                {t("infrastructure.storage.lifecycle.deleted")}
              </span>
              <span className="portal-infra__muted">
                {retentionValue === "never"
                  ? t("infrastructure.storage.lifecycle.never")
                  : t("infrastructure.storage.lifecycle.purged")}
              </span>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
