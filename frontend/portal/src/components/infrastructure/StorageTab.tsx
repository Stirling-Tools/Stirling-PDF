import { useState } from "react";
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

const RETENTION_OPTS = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "never", label: "Never delete" },
];

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
  const { tier } = useTier();
  const state = useAsync<StorageConfig>(() => fetchStorage(tier), [tier]);
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

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
        title="No storage configured"
        description="Connected storage and usage appear here."
      />
    );
  }

  const usedFrac = data.quotaGb > 0 ? data.usedGb / data.quotaGb : 0;
  const overThreshold = usedFrac > USAGE_DANGER_FRAC;

  return (
    <div className="portal-infra__stack">
      <section>
        <SectionHeader
          title="Total usage"
          sub="Storage consumed across all connected providers."
        />
        <Card padding="loose">
          <div className="portal-infra__usage-head">
            <span className="portal-infra__usage-value">
              {data.usedGb.toLocaleString()} GB
              <span className="portal-infra__muted">
                {" "}
                / {data.quotaGb.toLocaleString()} GB
              </span>
            </span>
            <StatusBadge tone={overThreshold ? "danger" : "success"} size="sm">
              {pct(usedFrac)} used
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
            label="Storage used"
          />
        </Card>
      </section>

      <section className="portal-infra__split">
        <Card padding="loose">
          <SectionHeader
            title="Connected providers"
            sub="Where processed artifacts are written."
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
                    <span className="portal-infra__mono">{p.usedGb} GB</span>
                    <StatusBadge tone="success" size="sm">
                      Connected
                    </StatusBadge>
                  </span>
                ) : (
                  // TODO(backend): launch the provider OAuth/credential flow,
                  // then POST /v1/infrastructure/storage/providers/{id}/connect
                  <Button variant="outlined" size="sm">
                    Connect
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card padding="loose">
          <SectionHeader
            title="Retention"
            sub="How long artifacts are kept before lifecycle deletion."
          />
          <FormField label="Default retention window">
            <Select
              options={RETENTION_OPTS}
              value={retentionValue}
              onChange={(e) => setRetention(e.target.value as RetentionWindow)}
            />
          </FormField>

          <div className="portal-infra__lifecycle">
            <div className="portal-infra__lifecycle-stage is-active">
              <span className="portal-infra__lifecycle-dot" />
              <span className="portal-infra__lifecycle-label">Active</span>
              <span className="portal-infra__muted">
                0–{retentionValue === "never" ? "∞" : retentionValue}d
              </span>
            </div>
            <span className="portal-infra__lifecycle-arrow" aria-hidden>
              →
            </span>
            <div className="portal-infra__lifecycle-stage">
              <span className="portal-infra__lifecycle-dot" />
              <span className="portal-infra__lifecycle-label">Archived</span>
              <span className="portal-infra__muted">cold storage</span>
            </div>
            <span className="portal-infra__lifecycle-arrow" aria-hidden>
              →
            </span>
            <div className="portal-infra__lifecycle-stage">
              <span className="portal-infra__lifecycle-dot" />
              <span className="portal-infra__lifecycle-label">Deleted</span>
              <span className="portal-infra__muted">
                {retentionValue === "never" ? "never" : "purged"}
              </span>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
