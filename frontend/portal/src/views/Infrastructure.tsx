import { useState } from "react";
import { Tabs, type TabItem } from "@shared/components";
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

const TABS: TabItem<InfraTab>[] = [
  { key: "deployments", label: "Deployments" },
  { key: "api-keys", label: "API Keys" },
  { key: "security", label: "Security" },
  { key: "models", label: "Models" },
  { key: "storage", label: "Storage" },
  { key: "audit", label: "Audit Logs" },
];

export function Infrastructure() {
  const [tab, setTab] = useState<InfraTab>("deployments");

  return (
    <div className="portal-infra">
      <header className="portal-infra__head">
        <h1 className="portal-infra__title">Infrastructure</h1>
        <p className="portal-infra__sub">
          Deployments, credentials, security posture, storage, and the audit
          trail for your Stirling workspace.
        </p>
      </header>

      <Tabs<InfraTab>
        items={TABS}
        activeKey={tab}
        onChange={setTab}
        variant="underline"
        ariaLabel="Infrastructure sections"
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
