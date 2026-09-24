import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { useConfigNavSections as useProprietaryConfigNavSections } from "@proprietary/components/shared/config/configNavSections";
import { ConfigNavSection } from "@core/components/shared/config/configNavSections";
import { ConnectionSettings } from "@app/components/ConnectionSettings";
import DesktopGeneralSection from "@app/components/shared/config/configSections/GeneralSection";
import { createCloudTeamNavItem } from "@app/components/shared/config/cloudConfigNavSections";
import { BillingSettingsSection } from "@app/components/settings/BillingSettingsSection";
import { connectionModeService } from "@app/services/connectionModeService";
import { authService } from "@app/services/authService";
import { useAuth } from "@app/auth/context";

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
  showSettingsWhenNoLogin: boolean = true,
): ConfigNavSection[] => {
  const { t } = useTranslation();
  const { isAdmin: authenticatedAdmin, user, loading } = useAuth();
  const isOwner = authenticatedAdmin && !loading && user?.orgOwner === true;

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
    showSettingsWhenNoLogin,
  );

  // Desktop adds file-association defaults and its own update controls to the
  // Preferences page; core builds the page, desktop supplies its extras.
  const preferences = sections.find((s) => s.id === "preferences");
  if (preferences) {
    preferences.items = preferences.items.map((item) =>
      item.key === "general"
        ? { ...item, component: <DesktopGeneralSection /> }
        : item,
    );
  }

  const connectionModeSection: ConfigNavSection = {
    title: t("settings.connection.title", "Connection Mode"),
    items: [
      {
        key: "connectionMode",
        label: t("settings.connection.title", "Connection Mode"),
        description: t(
          "settings.connection.description",
          "Work locally on this machine or connect the app to a Stirling server.",
        ),
        icon: "cloud",
        component: <ConnectionSettings />,
      },
    ],
  };

  // In local mode only show Preferences + Connection Mode + About — everything
  // else requires a server and will 500 or show irrelevant admin UI.
  if (isLocalMode) {
    const result: ConfigNavSection[] = [];
    if (sections.length > 0) result.push(sections[0]);
    result.push(connectionModeSection);
    // Matched on the group id: its items were four rows and are now one, and a
    // miss here drops the group silently.
    const aboutSection = sections.find((section) => section.id === "about");
    if (aboutSection) result.push(aboutSection);
    return result;
  }

  // Identifies self-hosted admin sections by their first item's stable key.
  // Using item keys avoids dependency on translated section titles (#17).
  const SELF_HOSTED_SECTION_FIRST_KEYS = new Set([
    "users", // Workspace section, once the roster supersedes People/Teams
    "people", // Workspace section, before it does
    "adminGeneral", // Server section
    "adminUsage", // Monitoring section
  ]);

  // Build the result array explicitly instead of splice with hardcoded indices (#18).
  const result: ConfigNavSection[] = [];

  // Preferences is always first
  if (sections.length > 0) result.push(sections[0]);

  // Connection Mode always sits immediately after Preferences
  result.push(connectionModeSection);

  if (
    isAuthenticated &&
    (isSaasMode || (connectionMode === "selfhosted" && isOwner))
  ) {
    result.push({
      id: "workspace",
      title: t("settings.workspace.title", "Workspace"),
      items: [
        {
          key: "billing",
          label: t("portal.nav.usage", "Usage & Billing"),
          icon: "credit-card",
          component: (
            <BillingSettingsSection mode={isSaasMode ? "saas" : "selfhosted"} />
          ),
        },
      ],
    });
  }
  if (isSaasMode && isAuthenticated) {
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
