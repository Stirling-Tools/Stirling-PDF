import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Tabs, type TabItem } from "@editor/ui";
import { useView } from "@processor/contexts/ViewContext";
import { DeploymentsTab } from "@processor/components/infrastructure/DeploymentsTab";
import { ApiKeysTab } from "@processor/components/infrastructure/ApiKeysTab";
import { SecurityTab } from "@processor/components/infrastructure/SecurityTab";
import { ModelsTab } from "@processor/components/infrastructure/ModelsTab";
import { StorageTab } from "@processor/components/infrastructure/StorageTab";
import { AuditTab } from "@processor/components/infrastructure/AuditTab";
import "@processor/views/Infrastructure.css";

type InfraTab =
  | "deployments"
  | "api-keys"
  | "security"
  | "models"
  | "storage"
  | "audit";

const INFRA_TABS: InfraTab[] = [
  "deployments",
  "api-keys",
  "security",
  "models",
  "storage",
  "audit",
];

export function Infrastructure() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<InfraTab>("deployments");
  const { setActiveView } = useView();
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link (?tab=<key>) from elsewhere (e.g. the home visualiser's outcome
  // cards → audit log): open that tab, then drop the param.
  useEffect(() => {
    const requested = searchParams.get("tab");
    if (!requested) return;
    if ((INFRA_TABS as string[]).includes(requested)) {
      setTab(requested as InfraTab);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("tab");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const tabs: TabItem<InfraTab>[] = [
    { key: "deployments", label: t("portal.infrastructure.tabs.deployments") },
    { key: "api-keys", label: t("portal.infrastructure.tabs.apiKeys") },
    { key: "security", label: t("portal.infrastructure.tabs.security") },
    { key: "models", label: t("portal.infrastructure.tabs.models") },
    { key: "storage", label: t("portal.infrastructure.tabs.storage") },
    { key: "audit", label: t("portal.infrastructure.tabs.audit") },
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setActiveView("editor")}
        >
          {t("portal.infrastructure.manageEditorDeployment")}
        </Button>
      </header>

      <Tabs<InfraTab>
        items={tabs}
        activeKey={tab}
        onChange={setTab}
        variant="underline"
        ariaLabel={t("portal.infrastructure.sectionsAriaLabel")}
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
