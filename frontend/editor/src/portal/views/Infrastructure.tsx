import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Tabs, type TabItem } from "@app/ui";
import { useView } from "@portal/contexts/ViewContext";
import { useEnterpriseEnabled } from "@portal/hooks/useEnterpriseEnabled";
import { ApiKeysTab } from "@portal/components/infrastructure/ApiKeysTab";
import { AuditTab } from "@portal/components/infrastructure/AuditTab";
import "@portal/views/Infrastructure.css";

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
    { key: "api-keys", label: t("portal.infrastructure.tabs.apiKeys") },
    {
      key: "audit",
      label: t("portal.infrastructure.tabs.audit"),
      disabled: !auditEnabled,
    },
    {
      key: "deployments",
      label: t("portal.infrastructure.tabs.deployments"),
      disabled: true,
    },
    {
      key: "security",
      label: t("portal.infrastructure.tabs.security"),
      disabled: true,
    },
    {
      key: "models",
      label: t("portal.infrastructure.tabs.models"),
      disabled: true,
    },
    {
      key: "storage",
      label: t("portal.infrastructure.tabs.storage"),
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
        <Button fat onClick={() => setActiveView("editor")}>
          {t("portal.infrastructure.manageEditorDeployment")}
        </Button>
      </header>

      <Tabs<InfraTab | DisabledInfraTab>
        items={tabs}
        activeKey={tab}
        onChange={(key) => {
          if (canOpenTab(key)) setTab(key as InfraTab);
        }}
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
