import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Paper, Stack, Group, Text, Loader } from "@mantine/core";
import { StatusBadge, type StatusTone } from "@app/ui/StatusBadge";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import type { AiEngineSettingsData } from "@app/components/shared/config/configSections/aiEngineSettings";
import {
  formatAge,
  healthOf,
  useAiEngineStatus,
  type AiEngineHealth,
} from "@app/components/shared/config/configSections/ai/useAiEngineStatus";

interface AiStatusCardProps {
  settings: AiEngineSettingsData;
}

const TONE: Record<AiEngineHealth, StatusTone> = {
  loading: "neutral",
  off: "neutral",
  down: "danger",
  degraded: "warning",
  ok: "success",
};

/** One labelled value in the strip under the headline. */
function Fact({
  label,
  value,
  title,
}: {
  label: string;
  value: React.ReactNode;
  title?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <Text
        size="xs"
        fw={600}
        tt="uppercase"
        c="dimmed"
        style={{ letterSpacing: "0.04em" }}
      >
        {label}
      </Text>
      <Text size="sm" truncate title={title}>
        {value}
      </Text>
    </div>
  );
}

/**
 * Whether the engine is actually working, at the top of the page.
 *
 * Deliberately does not key off the engine's own /health alone: that route is exempt from the
 * shared-secret check and never contacts the model provider, so it stays green while every real
 * request is refused. The backend probes a secret-gated route too, and a rejection paints amber
 * rather than green - the whole point of the card.
 */
export function AiStatusCard({ settings }: AiStatusCardProps) {
  const { t } = useTranslation();
  const enabled = settings.enabled ?? false;
  const cloud = settings.mode === "CLOUD";
  const { status, loading, checkedAt, refresh } = useAiEngineStatus(enabled);
  const [now, setNow] = useState(() => Date.now());

  // Re-render on a slow tick so "14s ago" does not silently go stale while the page is open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const health = healthOf(status, loading);
  const age = formatAge(checkedAt, now, t);

  const HEADLINE: Record<AiEngineHealth, string> = {
    loading: t("admin.settings.ai.status.checking", "Checking the engine…"),
    off: t("admin.settings.ai.status.off.title", "AI is switched off"),
    down: cloud
      ? t(
          "admin.settings.ai.status.cloud.down.title",
          "Stirling Cloud unreachable",
        )
      : t("admin.settings.ai.status.down.title", "Engine unreachable"),
    degraded: cloud
      ? t(
          "admin.settings.ai.status.cloud.degraded.title",
          "Stirling Cloud is refusing this server",
        )
      : t(
          "admin.settings.ai.status.degraded.title",
          "Engine is up, but refusing this server",
        ),
    ok: cloud
      ? t(
          "admin.settings.ai.status.cloud.ok.title",
          "Running on Stirling Cloud",
        )
      : t("admin.settings.ai.status.ok.title", "Engine running"),
  };

  const DETAIL: Record<AiEngineHealth, string> = {
    loading: "",
    off: t(
      "admin.settings.ai.status.off.body",
      "Choose how AI runs below, then save and restart.",
    ),
    down: cloud
      ? t(
          "admin.settings.ai.status.cloud.down.body",
          "This server could not reach Stirling Cloud. Check the account link and that this server can reach the internet.",
        )
      : t(
          "admin.settings.ai.status.down.body",
          "Check the URL, that the engine container is running, and that you restarted after enabling AI.",
        ),
    degraded: cloud
      ? t(
          "admin.settings.ai.status.cloud.degraded.body",
          "Stirling Cloud answered but refused this server. The account link may have been revoked.",
        )
      : t(
          "admin.settings.ai.status.degraded.body",
          "It answered the health check but rejected a real request. The two sides are using different shared secrets.",
        ),
    ok: cloud
      ? t(
          "admin.settings.ai.status.cloud.ok.body",
          "Stirling Cloud accepted this server.",
        )
      : t(
          "admin.settings.ai.status.ok.body",
          "Health check and an authenticated request both succeeded.",
        ),
  };

  const featuresOn = Object.values(settings.features ?? {}).filter(
    Boolean,
  ).length;
  const featuresTotal = 6;

  const authLabel =
    status?.authenticated === true
      ? t("admin.settings.ai.status.secret.yes", "Accepted")
      : status?.authenticated === false
        ? t("admin.settings.ai.status.secret.no", "Rejected")
        : t("admin.settings.ai.status.secret.unknown", "Unknown");

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Group
          gap="md"
          wrap="nowrap"
          align="flex-start"
          justify="space-between"
        >
          {/* Headline above detail, not beside it: the degraded headline is long enough to
              wrap, and beside the button it squeezed both onto two ragged lines. */}
          <Stack gap={6} style={{ minWidth: 0 }}>
            {loading && !status ? (
              <Loader size="xs" />
            ) : (
              <StatusBadge tone={TONE[health]} size="sm">
                {HEADLINE[health]}
              </StatusBadge>
            )}
            {DETAIL[health] && (
              <Text size="sm" c="dimmed">
                {DETAIL[health]}
              </Text>
            )}
          </Stack>
          <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
            {age && (
              <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                {t("admin.settings.ai.status.checked", "checked")} {age}
              </Text>
            )}
            <Button
              variant="secondary"
              size="sm"
              loading={loading}
              onClick={() => void refresh()}
              disabled={!enabled}
            >
              {t("admin.settings.ai.status.recheck", "Check again")}
            </Button>
          </Group>
        </Group>

        {status?.error && health !== "ok" && (
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <Icon
              name="circle-alert"
              size="1rem"
              style={{ flexShrink: 0, marginTop: "0.1rem" }}
            />
            <Text size="xs" c="dimmed">
              {status.error}
            </Text>
          </Group>
        )}

        {enabled && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
              gap: "1rem",
              borderTop: "1px solid var(--c-border)",
              paddingTop: "0.75rem",
            }}
          >
            <Fact
              label={
                cloud
                  ? t("admin.settings.ai.status.runningOn", "Running on")
                  : t("admin.settings.ai.status.url", "Engine URL")
              }
              value={
                cloud
                  ? t("admin.settings.ai.status.cloud.name", "Stirling Cloud")
                  : settings.url || "—"
              }
              title={cloud ? undefined : settings.url || undefined}
            />
            <Fact
              label={
                cloud
                  ? t("admin.settings.ai.status.linkLabel", "Account link")
                  : t("admin.settings.ai.status.secretLabel", "Shared secret")
              }
              value={authLabel}
            />
            {cloud && (
              <Fact
                label={t(
                  "admin.settings.ai.status.cloud.hostLabel",
                  "Stirling.com",
                )}
                value={
                  status?.cloudUp == null
                    ? "—"
                    : status.cloudUp
                      ? t("admin.settings.ai.status.cloud.hostUp", "Up")
                      : t("admin.settings.ai.status.cloud.hostDown", "Down")
                }
              />
            )}
            {cloud && (
              <Fact
                label={t(
                  "admin.settings.ai.status.cloud.sharingLabel",
                  "AI sharing",
                )}
                value={
                  status?.cloudSharingEnabled == null
                    ? "—"
                    : status.cloudSharingEnabled
                      ? t("admin.settings.ai.status.cloud.sharingOn", "Enabled")
                      : t(
                          "admin.settings.ai.status.cloud.sharingOff",
                          "Disabled",
                        )
                }
              />
            )}
            <Fact
              label={t("admin.settings.ai.status.smartModel", "Smart model")}
              value={status?.smartModel || "—"}
            />
            <Fact
              label={t("admin.settings.ai.status.fastModel", "Fast model")}
              value={status?.fastModel || "—"}
            />
            <Fact
              label={t("admin.settings.ai.status.capabilities", "Capabilities")}
              value={t(
                "admin.settings.ai.status.capabilitiesValue",
                "{{on}} of {{total}} on",
                { on: featuresOn, total: featuresTotal },
              )}
            />
            {status?.latencyMs != null && (
              <Fact
                label={t("admin.settings.ai.status.latency", "Response time")}
                value={`${status.latencyMs} ms`}
              />
            )}
          </div>
        )}
      </Stack>
    </Paper>
  );
}
