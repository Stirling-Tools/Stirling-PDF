import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tabs, type TabItem } from "@app/ui";
import { useEnterpriseEnabled } from "@processor/hooks/useEnterpriseEnabled";
import { ApiKeysTab } from "@processor/components/infrastructure/ApiKeysTab";
import { AuditTab } from "@processor/components/infrastructure/AuditTab";
import { EncryptionPanel } from "@processor/components/infrastructure/EncryptionPanel";
import "@processor/views/Infrastructure.css";

type InfraTab = "api-keys" | "audit" | "storage";

/** Shown but inert: no backend behind these screens yet. */
type DisabledInfraTab = "deployments" | "security" | "models";

export function Infrastructure() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<InfraTab>("api-keys");
  const [searchParams, setSearchParams] = useSearchParams();
  // Audit is Enterprise-only; disabled (greyed, inert) on non-enterprise instances.
  const enterprise = useEnterpriseEnabled();
  const auditEnabled = enterprise.enabled;

  const canOpenTab = useCallback(
    (key: string) =>
      key === "api-keys" ||
      key === "storage" ||
      (key === "audit" && auditEnabled),
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
    // Enabled again: unlike the mock-backed tabs removed in #7497, this one
    // reads the real /api/v1/admin/storage-encryption surface.
    { key: "storage", label: t("processor.infrastructure.tabs.storage") },
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
        {tab === "storage" && (
          // Treat "still resolving" as available: flashing "your licence records
          // no audit trail" at an Enterprise operator is worse than the notice
          // arriving a beat late.
          <EncryptionPanel
            auditAvailable={enterprise.loading || enterprise.enabled}
          />
        )}
      </div>
    </div>
  );
}
