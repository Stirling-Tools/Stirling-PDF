import { useState } from "react";
import { useTranslation } from "react-i18next";
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

const TAB_KEYS: DetailTab[] = ["overview", "code", "props", "pricing"];

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
  const { t } = useTranslation();
  const [tab, setTab] = useState<DetailTab>("overview");

  // Reset to the first tab whenever a new component is opened.
  const open = component !== null;
  if (!component) {
    return (
      <Modal
        open={false}
        onClose={onClose}
        ariaLabel={t("catalogue.detail.ariaLabel")}
      />
    );
  }

  const tabs = TAB_KEYS.map((key) => ({
    key,
    label: t(`catalogue.detail.tabs.${key}`),
  }));

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
              {t("catalogue.detail.addToProject")}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            accent="purple"
            // TODO(backend): route to the upgrade / contact-sales flow.
            onClick={() => onClose()}
          >
            {t("catalogue.detail.upgradeToUnlock")}
          </Button>
        )
      }
    >
      {!unlocked && (
        <Banner
          tone="warning"
          title={t("catalogue.detail.locked.title")}
          description={t("catalogue.detail.locked.description", {
            name: component.name,
            tier: component.minTier,
          })}
        />
      )}

      {/* Live-preview sandbox — a styled placeholder until a real host mounts. */}
      <div className="portal-components__preview" aria-hidden>
        {/* TODO(backend)/host: mount the live <Sandbox> here, booting the
            component against a demo document and the dev's publishable key. */}
        <span className="portal-components__preview-badge">
          {t("catalogue.detail.preview.badge")}
        </span>
        <span className="portal-components__preview-note">
          {t("catalogue.detail.preview.note")}
        </span>
      </div>

      <Tabs<DetailTab>
        className="portal-components__tabs"
        items={tabs}
        activeKey={tab}
        onChange={setTab}
        variant="underline"
        ariaLabel={t("catalogue.detail.tabsAriaLabel")}
      />

      <div className="portal-components__tab-body">
        {tab === "overview" && (
          <div className="portal-components__overview">
            <p className="portal-components__overview-desc">
              {component.description}
            </p>
            <div className="portal-components__frameworks">
              {component.frameworks.map((fw) => (
                <Chip key={fw} size="sm" tone="blue">
                  {fw}
                </Chip>
              ))}
            </div>
            <div className="portal-components__stat-grid">
              <StatTile
                label={t("catalogue.detail.stats.maturity")}
                value={maturity.label}
              />
              <StatTile
                label={t("catalogue.detail.stats.price")}
                value={formatPrice(component.pricing)}
              />
              <StatTile
                label={t("catalogue.detail.stats.freeQuota")}
                value={
                  component.pricing.freeQuota > 0
                    ? t("catalogue.detail.stats.freeQuotaValue", {
                        amount: component.pricing.freeQuota.toLocaleString(),
                      })
                    : t("catalogue.detail.stats.none")
                }
              />
              <StatTile
                label={t("catalogue.detail.stats.embeds30d")}
                value={component.embeds30d.toLocaleString()}
              />
            </div>
          </div>
        )}

        {tab === "code" && (
          <div className="portal-components__code">
            <CodeBlock
              code={component.install}
              lang="bash"
              caption={t("catalogue.detail.code.install")}
            />
            <CodeBlock
              code={component.usage}
              lang="typescript"
              caption={t("catalogue.detail.code.usage")}
            />
          </div>
        )}

        {tab === "props" && <ComponentPropsTable props={component.props} />}

        {tab === "pricing" && (
          <div className="portal-components__pricing">
            <div className="portal-components__stat-grid">
              <StatTile
                label={t("catalogue.detail.stats.perAction")}
                value={formatPrice(component.pricing)}
              />
              <StatTile
                label={t("catalogue.detail.stats.billedOn")}
                value={component.pricing.unit}
              />
              <StatTile
                label={t("catalogue.detail.stats.freeQuota")}
                value={
                  component.pricing.freeQuota > 0
                    ? t("catalogue.detail.stats.freeQuotaValue", {
                        amount: component.pricing.freeQuota.toLocaleString(),
                      })
                    : t("catalogue.detail.stats.none")
                }
              />
            </div>
            <p className="portal-components__pricing-note">
              {t("catalogue.detail.pricing.note", {
                unit: component.pricing.unit,
              })}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
