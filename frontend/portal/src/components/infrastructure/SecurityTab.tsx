import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  RadioGroup,
  Skeleton,
  StatusBadge,
  Table,
  type RadioOption,
  type TableColumn,
} from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchSecurity,
  type AccessPolicy,
  type DataResidency,
  type SecurityConfig,
} from "@portal/api/infrastructure";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";
import {
  ATTESTATION_LABEL,
  ATTESTATION_TONE,
  CERT_LABEL,
  CERT_TONE,
  KEY_MODE_LABEL,
  KEY_MODE_TONE,
} from "@portal/components/infrastructure/infraFormat";

export function SecurityTab() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<SecurityConfig>(() => fetchSecurity(tier), [tier]);
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const ACCESS_OPTS: RadioOption<AccessPolicy>[] = [
    {
      value: "stirling",
      label: t("infrastructure.security.access.stirling.label"),
      description: t("infrastructure.security.access.stirling.description"),
    },
    {
      value: "byok",
      label: t("infrastructure.security.access.byok.label"),
      description: t("infrastructure.security.access.byok.description"),
    },
    {
      value: "hyok",
      label: t("infrastructure.security.access.hyok.label"),
      description: t("infrastructure.security.access.hyok.description"),
    },
  ];

  const RESIDENCY_OPTS: RadioOption<DataResidency>[] = [
    {
      value: "us",
      label: t("infrastructure.security.residency.us.label"),
      description: t("infrastructure.security.residency.us.description"),
    },
    {
      value: "eu",
      label: t("infrastructure.security.residency.eu.label"),
      description: t("infrastructure.security.residency.eu.description"),
    },
    {
      value: "apac",
      label: t("infrastructure.security.residency.apac.label"),
      description: t("infrastructure.security.residency.apac.description"),
    },
  ];

  const ipCols: TableColumn<SecurityConfig["ipAllowlist"][number]>[] = [
    {
      key: "label",
      header: t("infrastructure.security.ipColumns.label"),
      render: (e) => e.label,
    },
    {
      key: "cidr",
      header: t("infrastructure.security.ipColumns.cidr"),
      render: (e) => <code className="portal-infra__cell-code">{e.cidr}</code>,
    },
    {
      key: "addedBy",
      header: t("infrastructure.security.ipColumns.addedBy"),
      render: (e) => <span className="portal-infra__mono">{e.addedBy}</span>,
    },
    {
      key: "added",
      header: t("infrastructure.security.ipColumns.added"),
      align: "right",
      render: (e) => <span className="portal-infra__muted">{e.added}</span>,
    },
  ];

  // Local mirrors so the radios are interactive without a backend round-trip,
  // seeded from the fetched config once it lands.
  // TODO(backend): PATCH /v1/infrastructure/security { accessPolicy, dataResidency }
  const [access, setAccess] = useState<AccessPolicy | null>(null);
  const [residency, setResidency] = useState<DataResidency | null>(null);

  const accessValue = access ?? data?.accessPolicy ?? "stirling";
  const residencyValue = residency ?? data?.dataResidency ?? "us";

  if (isLoading) {
    return (
      <div className="portal-infra__stack" aria-hidden>
        <Skeleton height="11rem" />
        <Skeleton height="7rem" />
      </div>
    );
  }

  if (isEmpty || !data) {
    return (
      <EmptyState
        size="compact"
        title={t("infrastructure.security.empty.title")}
        description={t("infrastructure.security.empty.description")}
      />
    );
  }

  return (
    <div className="portal-infra__stack">
      <section className="portal-infra__split">
        <Card padding="loose">
          <SectionHeader
            title={t("infrastructure.security.accessPolicy.heading")}
            sub={t("infrastructure.security.accessPolicy.subheading")}
          />
          <RadioGroup
            name="access-policy"
            value={accessValue}
            onChange={setAccess}
            options={ACCESS_OPTS}
          />
          {accessValue === "hyok" && (
            <Banner
              tone="success"
              className="portal-infra__banner"
              title={t("infrastructure.security.hyokBanner.title")}
              description={t("infrastructure.security.hyokBanner.description")}
            />
          )}
        </Card>

        <Card padding="loose">
          <SectionHeader
            title={t("infrastructure.security.residencyHeader.heading")}
            sub={t("infrastructure.security.residencyHeader.subheading")}
          />
          <RadioGroup
            name="data-residency"
            value={residencyValue}
            onChange={setResidency}
            options={RESIDENCY_OPTS}
          />
        </Card>
      </section>

      <section>
        <SectionHeader
          title={t("infrastructure.security.keyManagement.heading")}
          sub={t("infrastructure.security.keyManagement.subheading")}
        />
        <Card padding="loose" className="portal-infra__keymgmt">
          <div className="portal-infra__keymgmt-head">
            <div className="portal-infra__keymgmt-title">
              <span className="portal-infra__cell-strong">
                {data.keyManagement.provider}
              </span>
              <StatusBadge
                tone={KEY_MODE_TONE[data.keyManagement.mode]}
                size="sm"
              >
                {KEY_MODE_LABEL[data.keyManagement.mode]}
              </StatusBadge>
            </div>
            {/* Rotation is a privileged backend action; disabled where Stirling
                holds the keys (managed tiers can't rotate customer keys). */}
            <Button
              variant="outline"
              size="sm"
              disabled={!data.keyManagement.customerManaged}
              onClick={() => {
                // TODO(backend): POST /v1/infrastructure/security/keys/rotate
              }}
            >
              {t("infrastructure.security.keyManagement.rotateKey")}
            </Button>
          </div>

          <dl className="portal-infra__kv">
            <div className="portal-infra__kv-wide">
              <dt>{t("infrastructure.security.keyManagement.keyId")}</dt>
              <dd>
                <code className="portal-infra__cell-code">
                  {data.keyManagement.keyId}
                </code>
              </dd>
            </div>
            <div>
              <dt>{t("infrastructure.security.keyManagement.algorithm")}</dt>
              <dd className="portal-infra__mono">
                {data.keyManagement.algorithm}
              </dd>
            </div>
            <div>
              <dt>{t("infrastructure.security.keyManagement.lastRotated")}</dt>
              <dd>{data.keyManagement.lastRotated}</dd>
            </div>
            <div>
              <dt>
                {t("infrastructure.security.keyManagement.rotationPolicy")}
              </dt>
              <dd>{data.keyManagement.rotationPolicy}</dd>
            </div>
          </dl>

          {!data.keyManagement.customerManaged && (
            <Banner
              tone="info"
              className="portal-infra__banner"
              title={t("infrastructure.security.managedBanner.title")}
              description={t(
                "infrastructure.security.managedBanner.description",
              )}
            />
          )}
        </Card>
      </section>

      <section>
        <SectionHeader
          title={t("infrastructure.security.compliance.heading")}
          sub={t("infrastructure.security.compliance.subheading")}
        />
        <div className="portal-infra__certs">
          {data.certs.map((c) => (
            <Card key={c.id} padding="default" className="portal-infra__cert">
              <div className="portal-infra__cert-head">
                <span className="portal-infra__cell-strong">{c.name}</span>
                <StatusBadge tone={CERT_TONE[c.status]} size="sm">
                  {CERT_LABEL[c.status]}
                </StatusBadge>
              </div>
              <p className="portal-infra__cert-detail">{c.detail}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title={t("infrastructure.security.attestations.heading")}
          sub={t("infrastructure.security.attestations.subheading")}
        />
        <div className="portal-infra__attestations">
          {data.attestations.map((a) => (
            <Card
              key={a.id}
              padding="default"
              className="portal-infra__attestation"
            >
              <div className="portal-infra__cert-head">
                <span className="portal-infra__cell-strong">{a.name}</span>
                <StatusBadge tone={ATTESTATION_TONE[a.status]} size="sm">
                  {ATTESTATION_LABEL[a.status]}
                </StatusBadge>
              </div>
              <Chip tone="neutral" size="sm">
                {a.framework}
              </Chip>
              <p className="portal-infra__cert-detail">{a.detail}</p>
              {a.reportUrl ? (
                <a
                  className="portal-infra__attestation-link"
                  href={a.reportUrl}
                  // TODO(backend): GET /v1/infrastructure/security/reports/:id
                  onClick={(e) => e.preventDefault()}
                >
                  {t("infrastructure.security.attestations.viewReport")}
                </a>
              ) : (
                <span className="portal-infra__muted">
                  {t("infrastructure.security.attestations.noReport")}
                </span>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title={t("infrastructure.security.ipAllowlist.heading")}
          sub={
            tier === "free"
              ? t("infrastructure.security.ipAllowlist.subLocked")
              : t("infrastructure.security.ipAllowlist.sub")
          }
        />
        {tier === "free" ? (
          <Banner
            tone="info"
            title={t("infrastructure.security.ipAllowlist.lockedBanner.title")}
            description={t(
              "infrastructure.security.ipAllowlist.lockedBanner.description",
            )}
          />
        ) : (
          <Card padding="none">
            <Table
              columns={ipCols}
              rows={data.ipAllowlist}
              rowKey={(e) => e.id}
              empty={t("infrastructure.security.ipAllowlist.empty")}
            />
          </Card>
        )}
      </section>
    </div>
  );
}
