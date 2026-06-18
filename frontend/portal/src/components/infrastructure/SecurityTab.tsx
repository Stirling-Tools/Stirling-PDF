import { useState } from "react";
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

const ACCESS_OPTS: RadioOption<AccessPolicy>[] = [
  {
    value: "stirling",
    label: "Stirling-held keys",
    description:
      "Stirling manages encryption keys. Simplest — zero key ops on your side.",
  },
  {
    value: "byok",
    label: "Bring your own key (BYOK)",
    description:
      "Supply a key from your own KMS. Stirling encrypts with it but can still read.",
  },
  {
    value: "hyok",
    label: "Hold your own key (HYOK)",
    description: "Keys never leave your KMS. Stirling holds only ciphertext.",
  },
];

const RESIDENCY_OPTS: RadioOption<DataResidency>[] = [
  { value: "us", label: "United States", description: "us-east-1 · us-west-2" },
  {
    value: "eu",
    label: "European Union",
    description: "eu-west-1 · GDPR data boundary",
  },
  { value: "apac", label: "Asia Pacific", description: "ap-southeast-1" },
];

const ipCols: TableColumn<SecurityConfig["ipAllowlist"][number]>[] = [
  { key: "label", header: "Label", render: (e) => e.label },
  {
    key: "cidr",
    header: "CIDR",
    render: (e) => <code className="portal-infra__cell-code">{e.cidr}</code>,
  },
  {
    key: "addedBy",
    header: "Added by",
    render: (e) => <span className="portal-infra__mono">{e.addedBy}</span>,
  },
  {
    key: "added",
    header: "Added",
    align: "right",
    render: (e) => <span className="portal-infra__muted">{e.added}</span>,
  },
];

export function SecurityTab() {
  const { tier } = useTier();
  const state = useAsync<SecurityConfig>(() => fetchSecurity(tier), [tier]);
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

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
        title="Security posture unavailable"
        description="Your workspace's security configuration will appear here."
      />
    );
  }

  return (
    <div className="portal-infra__stack">
      <section className="portal-infra__split">
        <Card padding="loose">
          <SectionHeader
            title="Document access policy"
            sub="Controls who can decrypt processed documents at rest."
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
              title="Stirling cannot decrypt your documents"
              description="With HYOK, encryption keys never leave your KMS. Stirling stores and processes only ciphertext you can revoke at any time."
            />
          )}
        </Card>

        <Card padding="loose">
          <SectionHeader
            title="Data residency"
            sub="Where documents are stored and processed."
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
          title="Encryption key management"
          sub="Custody of the keys that encrypt documents at rest — who can decrypt, and how keys rotate."
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
              Rotate key
            </Button>
          </div>

          <dl className="portal-infra__kv">
            <div className="portal-infra__kv-wide">
              <dt>Key identifier</dt>
              <dd>
                <code className="portal-infra__cell-code">
                  {data.keyManagement.keyId}
                </code>
              </dd>
            </div>
            <div>
              <dt>Algorithm</dt>
              <dd className="portal-infra__mono">
                {data.keyManagement.algorithm}
              </dd>
            </div>
            <div>
              <dt>Last rotated</dt>
              <dd>{data.keyManagement.lastRotated}</dd>
            </div>
            <div>
              <dt>Rotation policy</dt>
              <dd>{data.keyManagement.rotationPolicy}</dd>
            </div>
          </dl>

          {!data.keyManagement.customerManaged && (
            <Banner
              tone="info"
              className="portal-infra__banner"
              title="Keys are managed by Stirling on your plan"
              description="Bring-your-own-key (BYOK) and hold-your-own-key (HYOK) custody are available on Enterprise. Upgrade to supply keys from your own KMS."
            />
          )}
        </Card>
      </section>

      <section>
        <SectionHeader
          title="Compliance"
          sub="Attestations and certifications covering the Stirling platform."
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
          title="Compliance attestations"
          sub="Framework-by-framework audit posture, with reports available on attested controls."
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
                  View report →
                </a>
              ) : (
                <span className="portal-infra__muted">No report available</span>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="IP allowlist"
          sub={
            tier === "free"
              ? "Restrict API access to known IP ranges — available on paid plans."
              : "API access is restricted to these CIDR ranges."
          }
        />
        {tier === "free" ? (
          <Banner
            tone="info"
            title="IP allowlisting is a paid feature"
            description="Upgrade to Pro to restrict API access to specific networks."
          />
        ) : (
          <Card padding="none">
            <Table
              columns={ipCols}
              rows={data.ipAllowlist}
              rowKey={(e) => e.id}
              empty="No IP ranges configured — all IPs allowed."
            />
          </Card>
        )}
      </section>
    </div>
  );
}
