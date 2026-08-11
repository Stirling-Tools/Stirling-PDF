import { useState, type ComponentType, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import CloudRounded from "@mui/icons-material/CloudRounded";
import StorageRounded from "@mui/icons-material/StorageRounded";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  ProgressBar,
  Select,
  Skeleton,
  StatusBadge,
} from "@app/ui";
import { useTier } from "@processor/contexts/TierContext";
import { useAsync, useSectionFlags } from "@processor/hooks/useAsync";
import {
  fetchStorage,
  type RetentionWindow,
  type StorageConfig,
} from "@processor/api/infrastructure";
import { SectionHeader } from "@processor/components/infrastructure/SectionHeader";
import { pct } from "@processor/components/infrastructure/infraFormat";

const PROVIDER_ICON: Record<
  StorageConfig["providers"][number]["kind"],
  ComponentType<{ style?: CSSProperties }>
> = {
  stirling: StorageRounded,
  s3: CloudRounded,
  azure: CloudRounded,
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
      label: t("processor.infrastructure.storage.retentionOption.days", {
        count: 30,
      }),
    },
    {
      value: "60",
      label: t("processor.infrastructure.storage.retentionOption.days", {
        count: 60,
      }),
    },
    {
      value: "90",
      label: t("processor.infrastructure.storage.retentionOption.days", {
        count: 90,
      }),
    },
    {
      value: "180",
      label: t("processor.infrastructure.storage.retentionOption.days", {
        count: 180,
      }),
    },
    {
      value: "never",
      label: t("processor.infrastructure.storage.retentionOption.never"),
    },
  ];

  // TODO(backend): PATCH /v1/infrastructure/storage { retention }
  const [retention, setRetention] = useState<RetentionWindow | null>(null);
  const retentionValue = retention ?? data?.retention ?? "90";

  if (isLoading) {
    return (
      <div className="processor-infra__stack" aria-hidden>
        <Skeleton height="6rem" />
        <Skeleton height="9rem" />
      </div>
    );
  }

  if (isEmpty || !data) {
    return (
      <EmptyState
        size="compact"
        title={t("processor.infrastructure.storage.empty.title")}
        description={t("processor.infrastructure.storage.empty.description")}
      />
    );
  }

  const usedFrac = data.quotaGb > 0 ? data.usedGb / data.quotaGb : 0;
  const overThreshold = usedFrac > USAGE_DANGER_FRAC;

  return (
    <div className="processor-infra__stack">
      <section>
        <SectionHeader
          title={t("processor.infrastructure.storage.totalUsage.heading")}
          sub={t("processor.infrastructure.storage.totalUsage.subheading")}
        />
        <Card padding="loose">
          <div className="processor-infra__usage-head">
            <span className="processor-infra__usage-value">
              {t("processor.infrastructure.storage.gbValue", {
                value: data.usedGb.toLocaleString(),
              })}
              <span className="processor-infra__muted">
                {" "}
                /{" "}
                {t("processor.infrastructure.storage.gbValue", {
                  value: data.quotaGb.toLocaleString(),
                })}
              </span>
            </span>
            <StatusBadge tone={overThreshold ? "danger" : "success"} size="sm">
              {t("processor.infrastructure.storage.percentUsed", {
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
            label={t(
              "processor.infrastructure.storage.totalUsage.progressLabel",
            )}
          />
        </Card>
      </section>

      <section className="processor-infra__split">
        <Card padding="loose">
          <SectionHeader
            title={t("processor.infrastructure.storage.providers.heading")}
            sub={t("processor.infrastructure.storage.providers.subheading")}
          />
          <ul className="processor-infra__providers">
            {data.providers.map((p) => {
              const ProviderIcon = PROVIDER_ICON[p.kind];
              return (
                <li key={p.id} className="processor-infra__provider">
                  <span className="processor-infra__provider-glyph" aria-hidden>
                    <ProviderIcon style={{ fontSize: "1.2rem" }} />
                  </span>
                  <span className="processor-infra__provider-text">
                    <span className="processor-infra__cell-strong">
                      {p.name}
                    </span>
                    <span className="processor-infra__muted">{p.detail}</span>
                  </span>
                  {p.connected ? (
                    <span className="processor-infra__provider-meta">
                      <span className="processor-infra__mono">
                        {t("processor.infrastructure.storage.gbValue", {
                          value: p.usedGb,
                        })}
                      </span>
                      <StatusBadge tone="success" size="sm">
                        {t(
                          "processor.infrastructure.storage.providers.connected",
                        )}
                      </StatusBadge>
                    </span>
                  ) : (
                    // TODO(backend): launch the provider OAuth/credential flow,
                    // then POST /v1/infrastructure/storage/providers/{id}/connect
                    <Button variant="secondary" size="sm">
                      {t("processor.infrastructure.storage.providers.connect")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card padding="loose">
          <SectionHeader
            title={t("processor.infrastructure.storage.retention.heading")}
            sub={t("processor.infrastructure.storage.retention.subheading")}
          />
          <FormField
            label={t("processor.infrastructure.storage.retention.windowLabel")}
          >
            <Select
              options={RETENTION_OPTS}
              value={retentionValue}
              onChange={(value) =>
                setRetention((value ?? "") as RetentionWindow)
              }
            />
          </FormField>

          <div className="processor-infra__lifecycle">
            <div className="processor-infra__lifecycle-stage is-active">
              <span className="processor-infra__lifecycle-dot" />
              <span className="processor-infra__lifecycle-label">
                {t("processor.infrastructure.storage.lifecycle.active")}
              </span>
              <span className="processor-infra__muted">
                {t("processor.infrastructure.storage.lifecycle.activeRange", {
                  value: retentionValue === "never" ? "∞" : retentionValue,
                })}
              </span>
            </div>
            <span className="processor-infra__lifecycle-arrow" aria-hidden>
              <ArrowForwardRounded style={{ fontSize: "1.2rem" }} />
            </span>
            <div className="processor-infra__lifecycle-stage">
              <span className="processor-infra__lifecycle-dot" />
              <span className="processor-infra__lifecycle-label">
                {t("processor.infrastructure.storage.lifecycle.archived")}
              </span>
              <span className="processor-infra__muted">
                {t("processor.infrastructure.storage.lifecycle.coldStorage")}
              </span>
            </div>
            <span className="processor-infra__lifecycle-arrow" aria-hidden>
              <ArrowForwardRounded style={{ fontSize: "1.2rem" }} />
            </span>
            <div className="processor-infra__lifecycle-stage">
              <span className="processor-infra__lifecycle-dot" />
              <span className="processor-infra__lifecycle-label">
                {t("processor.infrastructure.storage.lifecycle.deleted")}
              </span>
              <span className="processor-infra__muted">
                {retentionValue === "never"
                  ? t("processor.infrastructure.storage.lifecycle.never")
                  : t("processor.infrastructure.storage.lifecycle.purged")}
              </span>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
