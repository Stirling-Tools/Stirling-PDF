import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, type TabItem } from "@app/ui";
import { ApiKeysTab } from "@portal/components/infrastructure/ApiKeysTab";
import { AuditTab } from "@portal/components/infrastructure/AuditTab";
import "@portal/views/Infrastructure.css";

// SaaS pre-release: only API keys + Audit are shipped. Deployments, Security,
// Models and Storage are shown as disabled "coming soon" tabs (greyed, to the
// right of the live ones), and the self-hosted-only "Manage editor deployment"
// header button is dropped. Selection is never one of the coming-soon keys — the
// Tabs primitive renders them as native-disabled buttons, so onChange can't fire.
type InfraTab =
  | "api-keys"
  | "audit"
  | "deployments"
  | "security"
  | "models"
  | "storage";

export function Infrastructure() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<InfraTab>("api-keys");

  const comingSoon = (labelKey: string) => (
    <>
      {t(labelKey)}{" "}
      <span style={{ opacity: 0.6, fontWeight: 400, fontSize: "0.8em" }}>
        · {t("portal.comingSoon", "Coming soon")}
      </span>
    </>
  );

  const tabs: TabItem<InfraTab>[] = [
    { key: "api-keys", label: t("portal.infrastructure.tabs.apiKeys") },
    { key: "audit", label: t("portal.infrastructure.tabs.audit") },
    {
      key: "deployments",
      label: comingSoon("portal.infrastructure.tabs.deployments"),
      disabled: true,
    },
    {
      key: "security",
      label: comingSoon("portal.infrastructure.tabs.security"),
      disabled: true,
    },
    {
      key: "models",
      label: comingSoon("portal.infrastructure.tabs.models"),
      disabled: true,
    },
    {
      key: "storage",
      label: comingSoon("portal.infrastructure.tabs.storage"),
      disabled: true,
    },
  ];

  return (
    <div className="portal-infra">
      <header className="portal-infra__head">
        <div className="portal-infra__head-text">
          <h1 className="portal-infra__title">
            {t("portal.infrastructure.title")}
          </h1>
          <p className="portal-infra__sub">
            {t("portal.infrastructure.subtitle")}
          </p>
        </div>
      </header>

      <Tabs<InfraTab>
        items={tabs}
        activeKey={tab}
        onChange={setTab}
        variant="underline"
        ariaLabel={t("portal.infrastructure.sectionsAriaLabel")}
      />

      <div className="portal-infra__panel">
        {tab === "api-keys" && <ApiKeysTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </div>
  );
}
