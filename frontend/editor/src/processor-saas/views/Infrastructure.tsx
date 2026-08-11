import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, type TabItem } from "@app/ui";
import { ApiKeysTab } from "@processor/components/infrastructure/ApiKeysTab";
import { AuditTab } from "@processor/components/infrastructure/AuditTab";
import "@processor/views/Infrastructure.css";

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
        · {t("processor.comingSoon", "Coming soon")}
      </span>
    </>
  );

  const tabs: TabItem<InfraTab>[] = [
    { key: "api-keys", label: t("processor.infrastructure.tabs.apiKeys") },
    { key: "audit", label: t("processor.infrastructure.tabs.audit") },
    {
      key: "deployments",
      label: comingSoon("processor.infrastructure.tabs.deployments"),
      disabled: true,
    },
    {
      key: "security",
      label: comingSoon("processor.infrastructure.tabs.security"),
      disabled: true,
    },
    {
      key: "models",
      label: comingSoon("processor.infrastructure.tabs.models"),
      disabled: true,
    },
    {
      key: "storage",
      label: comingSoon("processor.infrastructure.tabs.storage"),
      disabled: true,
    },
  ];

  return (
    <div className="processor-infra">
      <header className="processor-infra__head">
        <div className="processor-infra__head-text">
          <h1 className="processor-infra__title">
            {t("processor.infrastructure.title")}
          </h1>
          <p className="processor-infra__sub">
            {t("processor.infrastructure.subtitle")}
          </p>
        </div>
      </header>

      <Tabs<InfraTab>
        items={tabs}
        activeKey={tab}
        onChange={setTab}
        variant="underline"
        ariaLabel={t("processor.infrastructure.sectionsAriaLabel")}
      />

      <div className="processor-infra__panel">
        {tab === "api-keys" && <ApiKeysTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </div>
  );
}
