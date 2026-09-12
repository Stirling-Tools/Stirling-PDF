import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import { Modal, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { useAuth } from "@app/auth/UseSession";
import { usePortalAccessState } from "@app/hooks/usePortalAccess";
import { isUserAnonymous } from "@app/auth/supabase";
import Overview from "@app/components/shared/config/configSections/Overview";
import { createSaasConfigNavSections } from "@app/components/shared/config/saasConfigNavSections";
import { withBasePath } from "@app/constants/app";
import { Z_INDEX_OVER_SETTINGS_MODAL } from "@app/styles/zIndex";
import type { SettingsNav } from "@app/components/settings/settingsNavTypes";
import {
  buildPortalSettingsSections,
  PORTAL_SECTION_ALIASES,
  PORTAL_SUPERSEDED_SECTION_KEYS,
} from "@app/components/settings/portalSettingsNav";
import { mergeSettingsGroups } from "@app/components/settings/mergeSettingsGroups";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";

const ConnectedInstancesSection = lazy(
  () => import("@app/components/settings/ConnectedInstancesSection"),
);

export type { SettingsNav };

/**
 * SaaS settings sections. The cloud nav is a plain factory rather than a hook,
 * and its Overview tab owns the sign-out action, so this seam also supplies the
 * confirm dialog as the page's overlay. Members with processor access also get
 * the processor's former Users / Infrastructure / Usage tabs here, the same way
 * self-hosted does; the processor's redirects for those routes rely on it.
 */
export function useSettingsNav(onLeave: () => void): SettingsNav {
  const { t } = useTranslation();
  const { signOut, user } = useAuth();
  const { isTeamLeader, loading: teamLoading } = useSaaSTeam();
  // Not from useAuth: the editor's Supabase context never carries permission
  // flags, so only this seam knows. The processor has its own auth context.
  const { granted: portalAccess, settled: accessSettled } =
    usePortalAccessState();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const openLogoutConfirm = useCallback(() => setConfirmOpen(true), []);
  const isAnonymous = user ? isUserAnonymous(user) : false;

  const sections = useMemo(() => {
    let own = createSaasConfigNavSections(Overview, openLogoutConfirm, {
      isAnonymous,
      t,
      onRequestClose: onLeave,
    });
    if (isTeamLeader && !teamLoading && !isAnonymous) {
      own = mergeSettingsGroups(
        own,
        [
          {
            id: "workspace",
            title: t("settings.workspace.title", "Workspace"),
            mergeAt: "append",
            items: [
              {
                key: "account-link",
                label: t(
                  "settings.connectedInstances.title",
                  "Connected instances",
                ),
                icon: "link-rounded",
                fullBleed: true,
                component: (
                  <Suspense fallback={<LoadingFallback />}>
                    <ConnectedInstancesSection />
                  </Suspense>
                ),
              },
            ],
          },
        ],
        [],
      );
    }
    if (!portalAccess) return own;
    const portal = buildPortalSettingsSections(t, {
      includeAccountLink: false,
      includeAudit: true,
    });
    if (portal.length === 0) return own;
    return mergeSettingsGroups(own, portal, PORTAL_SUPERSEDED_SECTION_KEYS);
  }, [
    openLogoutConfirm,
    isAnonymous,
    t,
    onLeave,
    portalAccess,
    isTeamLeader,
    teamLoading,
  ]);

  const overlay = (
    <Modal
      opened={confirmOpen}
      onClose={() => setConfirmOpen(false)}
      title={t("settings.signOut.title", "Sign out")}
      centered
      zIndex={Z_INDEX_OVER_SETTINGS_MODAL}
    >
      <div className="confirm-modal-content">
        <Text>
          {t("settings.signOut.confirm", "Are you sure you want to sign out?")}
        </Text>
        <div className="confirm-modal-buttons">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            accent="danger"
            onClick={async () => {
              try {
                await signOut();
              } finally {
                setConfirmOpen(false);
                window.location.href = withBasePath("/login");
              }
            }}
          >
            {t("settings.signOut.submit", "Sign out")}
          </Button>
        </div>
      </div>
    </Modal>
  );

  return {
    sections,
    overlay,
    aliases: portalAccess ? PORTAL_SECTION_ALIASES : undefined,
    pending: !accessSettled || teamLoading,
  };
}
