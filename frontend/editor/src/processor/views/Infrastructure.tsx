import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Tabs, type TabItem } from "@app/ui";
import { useView } from "@processor/contexts/ViewContext";
import { useEnterpriseEnabled } from "@processor/hooks/useEnterpriseEnabled";
import { ApiKeysTab } from "@processor/components/infrastructure/ApiKeysTab";
import { AuditTab } from "@processor/components/infrastructure/AuditTab";
import "@processor/views/Infrastructure.css";

type InfraTab = "api-keys" | "audit";

/** Shown but inert: no backend behind these screens yet. */
type DisabledInfraTab = "deployments" | "security" | "models" | "storage";

export function Infrastructure() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<InfraTab>("api-keys");
  const { setActiveView } = useView();
  const [searchParams, setSearchParams] = useSearchParams();
  // Audit is Enterprise-only; disabled (greyed, inert) on non-enterprise instances.
  const auditEnabled = useEnterpriseEnabled().enabled;

  const canOpenTab = useCallback(
    (key: string) => key === "api-keys" || (key === "audit" && auditEnabled),
    [auditEnabled],
  );

  // Deep-link (?tab=<key>) from elsewhere (e.g. the home visualiser's outcome
  // cards → audit log): open that tab, then drop the param.
  useEffect(() => {
    const requested = searchParams.get("tab");
    if (!requested) return;
    if (canOpenTab(requested)) {
      setTab(requested as InfraTab);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("tab");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, canOpenTab]);

  const tabs: TabItem<InfraTab | DisabledInfraTab>[] = [
    { key: "api-keys", label: t("processor.infrastructure.tabs.apiKeys") },
    {
      key: "audit",
      label: t("processor.infrastructure.tabs.audit"),
      disabled: !auditEnabled,
    },
    {
      key: "deployments",
      label: t("processor.infrastructure.tabs.deployments"),
      disabled: true,
    },
    {
      key: "security",
      label: t("processor.infrastructure.tabs.security"),
      disabled: true,
    },
    {
      key: "models",
      label: t("processor.infrastructure.tabs.models"),
      disabled: true,
    },
    {
      key: "storage",
      label: t("processor.infrastructure.tabs.storage"),
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
        <Button fat onClick={() => setActiveView("editor")}>
          {t("processor.infrastructure.manageEditorDeployment")}
        </Button>
      </header>

      <Tabs<InfraTab | DisabledInfraTab>
        items={tabs}
        activeKey={tab}
        onChange={(key) => {
          if (canOpenTab(key)) setTab(key as InfraTab);
        }}
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
