import { useState } from "react";
import {
  Banner,
  Button,
  Chip,
  CodeBlock,
  Modal,
  StatTile,
  StatusBadge,
  Tabs,
} from "@shared/components";
import {
  type SdkComponent,
  MATURITY_META,
  formatPrice,
} from "@portal/api/sdkComponents";
import { ComponentPropsTable } from "@portal/components/catalogue/ComponentPropsTable";
import "@portal/views/Components.css";

type DetailTab = "overview" | "code" | "props" | "pricing";

const TABS: { key: DetailTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "code", label: "Code" },
  { key: "props", label: "Props / API" },
  { key: "pricing", label: "Pricing" },
];

interface ComponentDetailModalProps {
  component: SdkComponent | null;
  /** False when the open component sits above the active tier. */
  unlocked: boolean;
  onClose: () => void;
}

/**
 * Detail overlay for a catalogue component: a live-preview placeholder plus
 * Overview / Code / Props / Pricing tabs. Locked components swap the install
 * CTA for an upgrade nudge.
 */
export function ComponentDetailModal({
  component,
  unlocked,
  onClose,
}: ComponentDetailModalProps) {
  const [tab, setTab] = useState<DetailTab>("overview");

  // Reset to the first tab whenever a new component is opened.
  const open = component !== null;
  if (!component) {
    return (
      <Modal open={false} onClose={onClose} ariaLabel="Component detail" />
    );
  }

  const maturity = MATURITY_META[component.maturity];
  const npm = `@stirling/${component.package}`;

  return (
    <Modal
      key={component.id}
      open={open}
      onClose={() => {
        onClose();
        setTab("overview");
      }}
      width="xl"
      title={
        <span className="portal-components__modal-title">
          {component.name}
          <StatusBadge tone={maturity.tone} size="sm" showDot={false}>
            {maturity.label}
          </StatusBadge>
        </span>
      }
      subtitle={npm}
      footer={
        unlocked ? (
          <div className="portal-components__modal-footer">
            <span className="portal-components__price">
              {formatPrice(component.pricing)}
            </span>
            <Button
              size="sm"
              // TODO(backend): open the package quickstart / provision a
              // publishable key scoped to this component.
              onClick={() => onClose()}
            >
              Add to project
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            accent="neutral"
            // TODO(backend): route to the upgrade / contact-sales flow.
            onClick={() => onClose()}
          >
            Upgrade to unlock
          </Button>
        )
      }
    >
      {!unlocked && (
        <Banner
          tone="warning"
          title="Not available on your plan"
          description={`${component.name} is included from the ${component.minTier} plan. Upgrade to embed it.`}
        />
      )}

      {/* Live-preview sandbox — a styled placeholder until a real host mounts. */}
      <div className="portal-components__preview" aria-hidden>
        {/* TODO(backend)/host: mount the live <Sandbox> here, booting the
            component against a demo document and the dev's publishable key. */}
        <span className="portal-components__preview-badge">Live preview</span>
        <span className="portal-components__preview-note">
          Interactive sandbox renders here
        </span>
      </div>

      <Tabs<DetailTab>
        className="portal-components__tabs"
        items={TABS}
        activeKey={tab}
        onChange={setTab}
        variant="underline"
        ariaLabel="Component detail sections"
      />

      <div className="portal-components__tab-body">
        {tab === "overview" && (
          <div className="portal-components__overview">
            <p className="portal-components__overview-desc">
              {component.description}
            </p>
            <div className="portal-components__frameworks">
              {component.frameworks.map((fw) => (
                <Chip key={fw} size="sm" accent="blue">
                  {fw}
                </Chip>
              ))}
            </div>
            <div className="portal-components__stat-grid">
              <StatTile label="Maturity" value={maturity.label} />
              <StatTile label="Price" value={formatPrice(component.pricing)} />
              <StatTile
                label="Free quota"
                value={
                  component.pricing.freeQuota > 0
                    ? `${component.pricing.freeQuota.toLocaleString()} / mo`
                    : "None"
                }
              />
              <StatTile
                label="Embeds (30d)"
                value={component.embeds30d.toLocaleString()}
              />
            </div>
          </div>
        )}

        {tab === "code" && (
          <div className="portal-components__code">
            <CodeBlock code={component.install} lang="bash" caption="Install" />
            <CodeBlock
              code={component.usage}
              lang="typescript"
              caption="Usage"
            />
          </div>
        )}

        {tab === "props" && <ComponentPropsTable props={component.props} />}

        {tab === "pricing" && (
          <div className="portal-components__pricing">
            <div className="portal-components__stat-grid">
              <StatTile
                label="Per action"
                value={formatPrice(component.pricing)}
              />
              <StatTile label="Billed on" value={component.pricing.unit} />
              <StatTile
                label="Free quota"
                value={
                  component.pricing.freeQuota > 0
                    ? `${component.pricing.freeQuota.toLocaleString()} / mo`
                    : "None"
                }
              />
            </div>
            <p className="portal-components__pricing-note">
              Metered per {component.pricing.unit}. Usage beyond the monthly
              free quota is billed to your account and itemised under Usage
              &amp; Billing.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
