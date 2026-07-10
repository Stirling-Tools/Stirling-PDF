import { useEffect, useState } from "react";
import { Paper, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";
import type { LoginLandingView } from "@app/services/preferencesService";
import {
  isPortalAvailable,
  landsOnProcessor,
  loginLandingMode,
} from "@app/utils/loginLanding";

/**
 * Processor-user preference: where to land after signing in (processor vs
 * editor). Shown only to users who default to the processor (admins and
 * non-personal team leads); hidden for members and solo users.
 */
export function SaasLoginLandingSetting() {
  const { t } = useTranslation();
  const { preferences, updatePreference } = usePreferences();
  const { teams } = useSaaSTeam();
  const [role, setRole] = useState<string | null>(null);

  // Backend role (for the admin case) - team leadership alone can't tell an admin
  // apart, since every user leads their personal team. Best-effort.
  useEffect(() => {
    let cancelled = false;
    void apiClient
      .get<{ user?: { role?: string } }>("/api/v1/auth/me", {
        suppressErrorToast: true,
      })
      .then((r) => {
        if (!cancelled) setRole(r.data?.user?.role ?? null);
      })
      .catch(() => {
        // Keep role null → fall back to team-leadership visibility.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hidden unless the role-based landing is switched on (soft-release flag), the
  // processor is available, and the user is processor-bound (admin or real lead).
  if (
    loginLandingMode() !== "dynamic" ||
    !isPortalAvailable() ||
    !landsOnProcessor(role, teams)
  ) {
    return null;
  }

  return (
    <Paper withBorder p="md" radius="md">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text fw={500} size="sm">
            {t("settings.general.loginLanding.title", "After signing in")}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            {t(
              "settings.general.loginLanding.description",
              "Choose which app opens when you sign in to Stirling Cloud.",
            )}
          </Text>
        </div>
        <SegmentedControl
          value={preferences.loginLandingView}
          onChange={(val: string) =>
            updatePreference("loginLandingView", val as LoginLandingView)
          }
          options={[
            {
              label: t("settings.general.loginLanding.processor", "Processor"),
              value: "processor",
            },
            {
              label: t("settings.general.loginLanding.editor", "Editor"),
              value: "editor",
            },
          ]}
        />
      </div>
    </Paper>
  );
}

export default SaasLoginLandingSetting;
