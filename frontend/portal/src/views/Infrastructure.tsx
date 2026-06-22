import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Tabs, type TabItem } from "@shared/components";
import { useView } from "@portal/contexts/ViewContext";
import { DeploymentsTab } from "@portal/components/infrastructure/DeploymentsTab";
import { ApiKeysTab } from "@portal/components/infrastructure/ApiKeysTab";
import { SecurityTab } from "@portal/components/infrastructure/SecurityTab";
import { ModelsTab } from "@portal/components/infrastructure/ModelsTab";
import { StorageTab } from "@portal/components/infrastructure/StorageTab";
import { AuditTab } from "@portal/components/infrastructure/AuditTab";
import "@portal/views/Infrastructure.css";

type InfraTab =
  | "deployments"
  | "api-keys"
  | "security"
  | "models"
  | "storage"
  | "audit";

export function Infrastructure() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<InfraTab>("deployments");
  const { setActiveView } = useView();

  const tabs: TabItem<InfraTab>[] = [
    { key: "deployments", label: t("infrastructure.tabs.deployments") },
    { key: "api-keys", label: t("infrastructure.tabs.apiKeys") },
    { key: "security", label: t("infrastructure.tabs.security") },
    { key: "models", label: t("infrastructure.tabs.models") },
    { key: "storage", label: t("infrastructure.tabs.storage") },
    { key: "audit", label: t("infrastructure.tabs.audit") },
  ];

  return (
    <div className="portal-infra">
      <header className="portal-infra__head">
        <div className="portal-infra__head-text">
          <h1 className="portal-infra__title">{t("infrastructure.title")}</h1>
          <p className="portal-infra__sub">{t("infrastructure.subtitle")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setActiveView("editor")}
        >
          {t("infrastructure.manageEditorDeployment")}
        </Button>
      </header>

      <Tabs<InfraTab>
        items={tabs}
        activeKey={tab}
        onChange={setTab}
        variant="underline"
        ariaLabel={t("infrastructure.sectionsAriaLabel")}
      />

      <div className="portal-infra__panel">
        {tab === "deployments" && <DeploymentsTab />}
        {tab === "api-keys" && <ApiKeysTab />}
        {tab === "security" && <SecurityTab />}
        {tab === "models" && <ModelsTab />}
        {tab === "storage" && <StorageTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </div>
  );
}
