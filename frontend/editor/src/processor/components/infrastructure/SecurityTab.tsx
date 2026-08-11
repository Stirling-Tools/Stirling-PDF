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
} from "@app/ui";
import { useTier } from "@processor/contexts/TierContext";
import { useAsync, useSectionFlags } from "@processor/hooks/useAsync";
import {
  fetchSecurity,
  type AccessPolicy,
  type DataResidency,
  type SecurityConfig,
} from "@processor/api/infrastructure";
import { SectionHeader } from "@processor/components/infrastructure/SectionHeader";
import {
  ATTESTATION_LABEL,
  ATTESTATION_TONE,
  CERT_LABEL,
  CERT_TONE,
  KEY_MODE_LABEL,
  KEY_MODE_TONE,
} from "@processor/components/infrastructure/infraFormat";

export function SecurityTab() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<SecurityConfig>(() => fetchSecurity(tier), [tier]);
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const ACCESS_OPTS: RadioOption<AccessPolicy>[] = [
    {
      value: "stirling",
      label: t("processor.infrastructure.security.access.stirling.label"),
      description: t(
        "processor.infrastructure.security.access.stirling.description",
      ),
    },
    {
      value: "byok",
      label: t("processor.infrastructure.security.access.byok.label"),
      description: t(
        "processor.infrastructure.security.access.byok.description",
      ),
    },
    {
      value: "hyok",
      label: t("processor.infrastructure.security.access.hyok.label"),
      description: t(
        "processor.infrastructure.security.access.hyok.description",
      ),
    },
  ];

  const RESIDENCY_OPTS: RadioOption<DataResidency>[] = [
    {
      value: "us",
      label: t("processor.infrastructure.security.residency.us.label"),
      description: t(
        "processor.infrastructure.security.residency.us.description",
      ),
    },
    {
      value: "eu",
      label: t("processor.infrastructure.security.residency.eu.label"),
      description: t(
        "processor.infrastructure.security.residency.eu.description",
      ),
    },
    {
      value: "apac",
      label: t("processor.infrastructure.security.residency.apac.label"),
      description: t(
        "processor.infrastructure.security.residency.apac.description",
      ),
    },
  ];

  const ipCols: TableColumn<SecurityConfig["ipAllowlist"][number]>[] = [
    {
      key: "label",
      header: t("processor.infrastructure.security.ipColumns.label"),
      render: (e) => e.label,
    },
    {
      key: "cidr",
      header: t("processor.infrastructure.security.ipColumns.cidr"),
      render: (e) => (
        <code className="processor-infra__cell-code">{e.cidr}</code>
      ),
    },
    {
      key: "addedBy",
      header: t("processor.infrastructure.security.ipColumns.addedBy"),
      render: (e) => <span className="processor-infra__mono">{e.addedBy}</span>,
    },
    {
      key: "added",
      header: t("processor.infrastructure.security.ipColumns.added"),
      align: "right",
      render: (e) => <span className="processor-infra__muted">{e.added}</span>,
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
      <div className="processor-infra__stack" aria-hidden>
        <Skeleton height="11rem" />
        <Skeleton height="7rem" />
      </div>
    );
  }

  if (isEmpty || !data) {
    return (
      <EmptyState
        size="compact"
        title={t("processor.infrastructure.security.empty.title")}
        description={t("processor.infrastructure.security.empty.description")}
      />
    );
  }

  return (
    <div className="processor-infra__stack">
      <section className="processor-infra__split">
        <Card padding="loose">
          <SectionHeader
            title={t("processor.infrastructure.security.accessPolicy.heading")}
            sub={t("processor.infrastructure.security.accessPolicy.subheading")}
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
              className="processor-infra__banner"
              title={t("processor.infrastructure.security.hyokBanner.title")}
              description={t(
                "processor.infrastructure.security.hyokBanner.description",
              )}
            />
          )}
        </Card>

        <Card padding="loose">
          <SectionHeader
            title={t(
              "processor.infrastructure.security.residencyHeader.heading",
            )}
            sub={t(
              "processor.infrastructure.security.residencyHeader.subheading",
            )}
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
          title={t("processor.infrastructure.security.keyManagement.heading")}
          sub={t("processor.infrastructure.security.keyManagement.subheading")}
        />
        <Card padding="loose" className="processor-infra__keymgmt">
          <div className="processor-infra__keymgmt-head">
            <div className="processor-infra__keymgmt-title">
              <span className="processor-infra__cell-strong">
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
              variant="secondary"
              size="sm"
              disabled={!data.keyManagement.customerManaged}
              onClick={() => {
                // TODO(backend): POST /v1/infrastructure/security/keys/rotate
              }}
            >
              {t("processor.infrastructure.security.keyManagement.rotateKey")}
            </Button>
          </div>

          <dl className="processor-infra__kv">
            <div className="processor-infra__kv-wide">
              <dt>
                {t("processor.infrastructure.security.keyManagement.keyId")}
              </dt>
              <dd>
                <code className="processor-infra__cell-code">
                  {data.keyManagement.keyId}
                </code>
              </dd>
            </div>
            <div>
              <dt>
                {t("processor.infrastructure.security.keyManagement.algorithm")}
              </dt>
              <dd className="processor-infra__mono">
                {data.keyManagement.algorithm}
              </dd>
            </div>
            <div>
              <dt>
                {t(
                  "processor.infrastructure.security.keyManagement.lastRotated",
                )}
              </dt>
              <dd>{data.keyManagement.lastRotated}</dd>
            </div>
            <div>
              <dt>
                {t(
                  "processor.infrastructure.security.keyManagement.rotationPolicy",
                )}
              </dt>
              <dd>{data.keyManagement.rotationPolicy}</dd>
            </div>
          </dl>

          {!data.keyManagement.customerManaged && (
            <Banner
              tone="info"
              className="processor-infra__banner"
              title={t("processor.infrastructure.security.managedBanner.title")}
              description={t(
                "processor.infrastructure.security.managedBanner.description",
              )}
            />
          )}
        </Card>
      </section>

      <section>
        <SectionHeader
          title={t("processor.infrastructure.security.compliance.heading")}
          sub={t("processor.infrastructure.security.compliance.subheading")}
        />
        <div className="processor-infra__certs">
          {data.certs.map((c) => (
            <Card
              key={c.id}
              padding="default"
              className="processor-infra__cert"
            >
              <div className="processor-infra__cert-head">
                <span className="processor-infra__cell-strong">{c.name}</span>
                <StatusBadge tone={CERT_TONE[c.status]} size="sm">
                  {t(CERT_LABEL[c.status])}
                </StatusBadge>
              </div>
              <p className="processor-infra__cert-detail">{c.detail}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title={t("processor.infrastructure.security.attestations.heading")}
          sub={t("processor.infrastructure.security.attestations.subheading")}
        />
        <div className="processor-infra__attestations">
          {data.attestations.map((a) => (
            <Card
              key={a.id}
              padding="default"
              className="processor-infra__attestation"
            >
              <div className="processor-infra__cert-head">
                <span className="processor-infra__cell-strong">{a.name}</span>
                <StatusBadge tone={ATTESTATION_TONE[a.status]} size="sm">
                  {t(ATTESTATION_LABEL[a.status])}
                </StatusBadge>
              </div>
              <Chip size="sm">{a.framework}</Chip>
              <p className="processor-infra__cert-detail">{a.detail}</p>
              {a.reportUrl ? (
                <a
                  className="processor-infra__attestation-link"
                  href={a.reportUrl}
                  // TODO(backend): GET /v1/infrastructure/security/reports/:id
                  onClick={(e) => e.preventDefault()}
                >
                  {t(
                    "processor.infrastructure.security.attestations.viewReport",
                  )}
                </a>
              ) : (
                <span className="processor-infra__muted">
                  {t("processor.infrastructure.security.attestations.noReport")}
                </span>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title={t("processor.infrastructure.security.ipAllowlist.heading")}
          sub={
            tier === "free"
              ? t("processor.infrastructure.security.ipAllowlist.subLocked")
              : t("processor.infrastructure.security.ipAllowlist.sub")
          }
        />
        {tier === "free" ? (
          <Banner
            tone="info"
            title={t(
              "processor.infrastructure.security.ipAllowlist.lockedBanner.title",
            )}
            description={t(
              "processor.infrastructure.security.ipAllowlist.lockedBanner.description",
            )}
          />
        ) : (
          <Card padding="none">
            <Table
              columns={ipCols}
              rows={data.ipAllowlist}
              rowKey={(e) => e.id}
              empty={t("processor.infrastructure.security.ipAllowlist.empty")}
            />
          </Card>
        )}
      </section>
    </div>
  );
}
