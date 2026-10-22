import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@app/ui/Icon";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { useTranslation } from "react-i18next";
import {
  TextInput,
  NumberInput,
  Radio,
  Stack,
  Paper,
  Text,
  Group,
} from "@mantine/core";
import { alert } from "@app/components/toast";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import apiClient from "@app/services/apiClient";
import { Button } from "@app/ui/Button";
import { StatusBadge } from "@app/ui/StatusBadge";
import { Switch, Anchor } from "@mantine/core";
import { useAuth } from "@app/auth/context";
import { HAS_PORTAL } from "@app/routes/hasPortal";
import { useAccountLinked } from "@app/components/shared/config/configSections/ai/useAiEngineStatus";
import type { AiCardProps } from "@app/components/shared/config/configSections/ai/aiCardProps";
import "@app/components/shared/config/configSections/ai/AiModeOption.css";

/** The three places AI could run. Only two of them exist. */
type AiMode = "off" | "self" | "cloud";

interface ModeOptionProps {
  mode: AiMode;
  selected: AiMode;
  title: string;
  description: string;
  onSelect: (mode: AiMode) => void;
  disabled?: boolean;
  badge?: ReactNode;
  icon?: IconName;
  /** Shown under the description even when the option cannot be selected. */
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * One row of the mode chooser. A real radio, so the group is arrow-navigable and screen readers
 * announce it as a choice rather than three unrelated switches.
 */
function ModeOption({
  mode,
  selected,
  title,
  description,
  onSelect,
  disabled = false,
  badge,
  icon,
  footer,
  children,
}: ModeOptionProps) {
  const active = selected === mode;
  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      className={[
        "ai-mode-option",
        active ? "ai-mode-option--selected" : "",
        disabled ? "ai-mode-option--disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      // Clicking anywhere on the card picks the mode; the radio stays the real control, so
      // keyboard and screen readers are unaffected.
      onClick={disabled ? undefined : () => onSelect(mode)}
    >
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Radio
          value={mode}
          checked={active}
          disabled={disabled}
          onChange={() => onSelect(mode)}
          aria-label={title}
          mt={2}
        />
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <Group gap="xs" align="center" wrap="nowrap">
            {icon && <Icon name={icon} size="1rem" />}
            <Text fw={600} size="sm">
              {title}
            </Text>
            {badge}
          </Group>
          <Text size="sm" c="dimmed" mt={2}>
            {description}
          </Text>
          {footer ? <div style={{ marginTop: "0.5rem" }}>{footer}</div> : null}
          {active && children ? (
            <div className="ai-mode-option__body">{children}</div>
          ) : null}
        </div>
      </Group>
    </Paper>
  );
}

/**
 * Where AI runs, and - for a self-hosted engine - how to reach it.
 *
 * Was a bare "Enable AI" switch above four always-visible fields, which gave the URL and timeouts
 * equal billing with the decision that makes them relevant. As a mode choice the engine fields sit
 * under the option that owns them, and Stirling Cloud stays visible but disabled until the server
 * is linked.
 *
 * Every key here is restart-required.
 */
export function AiConnectionCard({
  settings,
  setSettings,
  isFieldPending,
}: AiCardProps) {
  const { t } = useTranslation();
  const [testingConnection, setTestingConnection] = useState(false);
  const enabled = settings.enabled || false;
  const linked = useAccountLinked();
  const { isAdmin, user, portalAccess } = useAuth();
  const isOwner = isAdmin && user?.orgOwner === true;
  // Mirrors useSettingsNav, which lists the account-link page only for the owner in portal builds.
  const canOpenAccountLink = HAS_PORTAL && portalAccess && isOwner;
  const mode: AiMode = !enabled
    ? "off"
    : settings.mode === "CLOUD"
      ? "cloud"
      : "self";

  const selectMode = (next: AiMode) => {
    if (next === "cloud" && !linked) return;
    setSettings({
      ...settings,
      enabled: next !== "off",
      // Leave the stored mode alone when switching off, so turning AI back on returns the admin
      // to the engine they had rather than silently moving their traffic.
      mode:
        next === "off"
          ? settings.mode
          : next === "cloud"
            ? "CLOUD"
            : "SELF_HOSTED",
    });
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      await apiClient.get("/api/v1/ai/health");
      alert({
        alertType: "success",
        title: t(
          "admin.settings.ai.general.test.okTitle",
          "AI engine reachable",
        ),
        body: t(
          "admin.settings.ai.general.test.okBody",
          "The AI engine responded to a health check.",
        ),
      });
    } catch (error) {
      const detail =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ||
        t(
          "admin.settings.ai.general.test.failBody",
          "The AI engine did not respond. Check the URL, that the engine container is running, and that AI is enabled (a restart is needed after enabling).",
        );
      alert({
        alertType: "error",
        title: t(
          "admin.settings.ai.general.test.failTitle",
          "AI engine unreachable",
        ),
        body: detail,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <Radio.Group
      value={mode}
      onChange={(value) => selectMode(value as AiMode)}
      aria-label={t("admin.settings.ai.general.mode.label", "Where AI runs")}
    >
      <Stack gap="sm">
        <ModeOption
          mode="off"
          selected={mode}
          onSelect={selectMode}
          title={t("admin.settings.ai.general.mode.off.title", "Off")}
          description={t(
            "admin.settings.ai.general.mode.off.description",
            "No AI tools anywhere in the app, and nothing leaves this server.",
          )}
        />

        <ModeOption
          mode="self"
          selected={mode}
          onSelect={selectMode}
          title={t(
            "admin.settings.ai.general.mode.self.title",
            "Run your own engine",
          )}
          description={t(
            "admin.settings.ai.general.mode.self.description",
            "A container you host, pointed at a model provider of your choosing. Your key, your bill, your data path.",
          )}
          badge={<PendingBadge show={isFieldPending("enabled")} />}
        >
          <Stack gap="sm">
            <TextInput
              label={
                <Group gap="xs">
                  <span>
                    {t("admin.settings.ai.general.url.label", "AI engine URL")}
                  </span>
                  <PendingBadge show={isFieldPending("url")} />
                  <InfoTooltip
                    label={t(
                      "admin.settings.ai.general.url.description",
                      "Internal URL of the Python AI engine, e.g. http://stirling-pdf-engine:5001.",
                    )}
                  />
                </Group>
              }
              value={settings.url || ""}
              onChange={(e) =>
                setSettings({ ...settings, url: e.target.value })
              }
              placeholder="http://stirling-pdf-engine:5001"
            />

            <Group
              gap="sm"
              grow
              align="flex-start"
              style={{ alignItems: "flex-start" }}
            >
              <NumberInput
                label={
                  <Group gap="xs">
                    <span>
                      {t(
                        "admin.settings.ai.general.timeoutSeconds.label",
                        "Request timeout (seconds)",
                      )}
                    </span>
                    <PendingBadge show={isFieldPending("timeoutSeconds")} />
                    <InfoTooltip
                      label={t(
                        "admin.settings.ai.general.timeoutSeconds.description",
                        "Timeout for standard AI requests to the engine.",
                      )}
                    />
                  </Group>
                }
                value={settings.timeoutSeconds ?? 0}
                onChange={(value) =>
                  setSettings({ ...settings, timeoutSeconds: Number(value) })
                }
                min={1}
              />

              <NumberInput
                label={
                  <Group gap="xs">
                    <span>
                      {t(
                        "admin.settings.ai.general.longRunningTimeoutSeconds.label",
                        "Long-running timeout (seconds)",
                      )}
                    </span>
                    <PendingBadge
                      show={isFieldPending("longRunningTimeoutSeconds")}
                    />
                    <InfoTooltip
                      label={t(
                        "admin.settings.ai.general.longRunningTimeoutSeconds.description",
                        "Timeout for heavier agent operations such as document generation.",
                      )}
                    />
                  </Group>
                }
                value={settings.longRunningTimeoutSeconds ?? 0}
                onChange={(value) =>
                  setSettings({
                    ...settings,
                    longRunningTimeoutSeconds: Number(value),
                  })
                }
                min={1}
              />

              <NumberInput
                label={
                  <Group gap="xs">
                    <span>
                      {t(
                        "admin.settings.ai.general.streamTimeoutSeconds.label",
                        "Stream timeout (seconds)",
                      )}
                    </span>
                    <PendingBadge
                      show={isFieldPending("streamTimeoutSeconds")}
                    />
                    <InfoTooltip
                      label={t(
                        "admin.settings.ai.general.streamTimeoutSeconds.description",
                        "Timeout for streamed (token-by-token) chat responses.",
                      )}
                    />
                  </Group>
                }
                value={settings.streamTimeoutSeconds ?? 0}
                onChange={(value) =>
                  setSettings({
                    ...settings,
                    streamTimeoutSeconds: Number(value),
                  })
                }
                min={1}
              />
            </Group>

            <Group justify="space-between" align="center">
              <Text size="xs" c="dimmed">
                {t(
                  "admin.settings.ai.general.restartNote",
                  "Changing the URL or any timeout takes effect after a restart.",
                )}
              </Text>
              <Button
                variant="secondary"
                size="sm"
                loading={testingConnection}
                onClick={handleTestConnection}
              >
                {t("admin.settings.ai.general.test.button", "Test connection")}
              </Button>
            </Group>
          </Stack>
        </ModeOption>

        <ModeOption
          mode="cloud"
          selected={mode}
          onSelect={selectMode}
          disabled={linked !== true}
          icon="cloud"
          title={t(
            "admin.settings.ai.general.mode.cloud.title",
            "Use Stirling Cloud AI",
          )}
          description={t(
            "admin.settings.ai.general.mode.cloud.description",
            "No container, no provider key, no model choice - the work runs on Stirling Cloud and is billed to the account this server is linked to.",
          )}
          badge={
            linked === false ? (
              <StatusBadge tone="neutral" size="sm" showDot={false}>
                {t(
                  "admin.settings.ai.general.mode.cloud.notLinked",
                  "Link an account first",
                )}
              </StatusBadge>
            ) : null
          }
          footer={
            linked !== false ? null : canOpenAccountLink ? (
              <Anchor
                href="/settings/account-link"
                size="sm"
                c="var(--c-accent-text)"
                // Stop the card's own click handler swallowing the link.
                onClick={(event) => event.stopPropagation()}
              >
                {t(
                  "admin.settings.ai.general.mode.cloud.linkCta",
                  "Connect this server to a Stirling account",
                )}{" "}
                &rsaquo;
              </Anchor>
            ) : !isOwner ? (
              <Text size="sm" c="dimmed">
                {t(
                  "admin.settings.ai.general.mode.cloud.ownerOnly",
                  "Only the organization owner can link this server to a Stirling account.",
                )}
              </Text>
            ) : null
          }
        >
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div style={{ flexGrow: 1, minWidth: 0 }}>
                <Group gap={4} wrap="nowrap">
                  <Text fw={500} size="sm">
                    {t(
                      "admin.settings.ai.general.cloud.indexing.label",
                      "Let Stirling Cloud keep indexed documents",
                    )}
                  </Text>
                  <InfoTooltip
                    label={t(
                      "admin.settings.ai.general.cloud.indexing.description",
                      "Every AI tool sends the page text it needs to answer. This decides whether Stirling Cloud may also keep that text, indexed, so later questions can search across the document.",
                    )}
                  />
                </Group>
                <Text size="sm" c="dimmed" mt={2}>
                  {t(
                    "admin.settings.ai.general.cloud.indexing.help",
                    "Off means document questions are unavailable. It does not stop text being sent - only stored.",
                  )}
                </Text>
              </div>
              <Switch
                checked={settings.cloudDocumentIndexing ?? false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    cloudDocumentIndexing: e.target.checked,
                  })
                }
                aria-label={t(
                  "admin.settings.ai.general.cloud.indexing.label",
                  "Let Stirling Cloud keep indexed documents",
                )}
              />
            </Group>
            <Text size="xs" c="dimmed">
              {t(
                "admin.settings.ai.general.cloud.note",
                "Models and provider keys are managed by Stirling Cloud, so those settings do not apply in this mode.",
              )}
            </Text>
          </Stack>
        </ModeOption>
      </Stack>
    </Radio.Group>
  );
}
