import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { useConfigNavSections as useProprietaryConfigNavSections } from "@proprietary/components/shared/config/configNavSections";
import { ConfigNavSection } from "@core/components/shared/config/configNavSections";
import { ConnectionSettings } from "@app/components/ConnectionSettings";
import {
  createCloudPlanNavItem,
  createCloudTeamNavItem,
} from "@app/components/shared/config/cloudConfigNavSections";
import { connectionModeService } from "@app/services/connectionModeService";
import { authService } from "@app/services/authService";

export type {
  ConfigNavSection,
  ConfigNavItem,
} from "@core/components/shared/config/configNavSections";

/**
 * Hook version of desktop config nav sections with proper i18n support
 */
export const useConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false,
  onRequestClose: () => void = () => {},
): ConfigNavSection[] => {
  const { t } = useTranslation();

  const [connectionMode, setConnectionMode] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setConnectionMode);
    return connectionModeService.subscribeToModeChanges((config) =>
      setConnectionMode(config.mode),
    );
  }, []);

  // Subscribe to auth changes
  useEffect(() => {
    const unsubscribe = authService.subscribeToAuth((status) => {
      setIsAuthenticated(status === "authenticated");
    });
    return unsubscribe;
  }, []);

  const isSaasMode = connectionMode === "saas";
  const isLocalMode = connectionMode === "local";

  // Get the proprietary sections (includes core Preferences + admin sections)
  const sections = useProprietaryConfigNavSections(
    isAdmin,
    runningEE,
    loginEnabled,
    onRequestClose,
  );

  const connectionModeSection: ConfigNavSection = {
    title: t("settings.connection.title", "Connection Mode"),
    items: [
      {
        key: "connectionMode",
        label: t("settings.connection.title", "Connection Mode"),
        icon: "desktop-cloud-rounded",
        component: <ConnectionSettings />,
      },
    ],
  };

  // In local mode only show Preferences + Connection Mode + Legal — everything
  // else requires a server and will 500 or show irrelevant admin UI.
  if (isLocalMode) {
    const result: ConfigNavSection[] = [];
    if (sections.length > 0) result.push(sections[0]);
    result.push(connectionModeSection);
    const legalSection = sections.find((section) =>
      section.items.some((item) => item.key === "legal"),
    );
    if (legalSection) result.push(legalSection);
    return result;
  }

  // Identifies self-hosted admin sections by their first item's stable key.
  // Using item keys avoids dependency on translated section titles (#17).
  const SELF_HOSTED_SECTION_FIRST_KEYS = new Set([
    "people", // Workspace section
    "adminGeneral", // Configuration section
    "adminSecurity", // Security & Authentication section
    "adminPlan", // Licensing & Analytics section
    "adminLegal", // Policies & Privacy section
  ]);

  // Build the result array explicitly instead of splice with hardcoded indices (#18).
  const result: ConfigNavSection[] = [];

  // Preferences is always first
  if (sections.length > 0) result.push(sections[0]);

  // Connection Mode always sits immediately after Preferences
  result.push(connectionModeSection);

  // Plan & Billing and Team sections only when authenticated in SaaS mode.
  // These are the SHARED cloud sections — the wallet-driven PAYG Plan
  // (dashboard + spend cap) and the team management UI — so a desktop SaaS
  // user sees the same Plan / billing / team experience as the web app.
  if (isSaasMode && isAuthenticated) {
    result.push({
      title: t("settings.planBilling.title", "Plan & Billing"),
      items: [createCloudPlanNavItem(t)],
    });
    result.push({
      title: t("settings.team.title", "Team"),
      items: [createCloudTeamNavItem(t)],
    });
  }

  // Append remaining proprietary sections, skipping self-hosted admin sections in SaaS mode
  // and hiding the Account section when not authenticated.
  for (const section of sections.slice(1)) {
    const firstItemKey = section.items[0]?.key;
    if (
      isSaasMode &&
      firstItemKey &&
      SELF_HOSTED_SECTION_FIRST_KEYS.has(firstItemKey)
    ) {
      continue;
    }
    const filteredItems = isAuthenticated
      ? section.items
      : section.items.filter((item) => item.key !== "account");
    if (filteredItems.length === 0) continue;
    result.push({ ...section, items: filteredItems });
  }

  return result;
};
