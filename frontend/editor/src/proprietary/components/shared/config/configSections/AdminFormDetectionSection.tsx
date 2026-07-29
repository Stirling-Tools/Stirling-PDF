import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text, Paper, Group, Switch, Loader, Divider } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { StatusBadge, type StatusTone } from "@app/ui/StatusBadge";
import { ProgressBar } from "@app/ui/ProgressBar";
import { Banner } from "@app/ui/Banner";
import { Collapsible } from "@app/ui/Collapsible";
import LocalIcon from "@app/components/shared/LocalIcon";
import {
  useFormDetectionModelStatus,
  FormDetectionCatalogEntry,
  FormDetectionExecutionMode,
} from "@app/hooks/useFormDetectionModelStatus";

function formatSize(t: (k: string, d: string) => string, bytes: number): string {
  if (!bytes || bytes <= 0)
    return t("admin.formDetection.sizeUnknown", "size unknown");
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

function CommandRow({ code, copyLabel }: { code: string; copyLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Group
      gap={6}
      wrap="nowrap"
      style={{
        background: "var(--c-surface-sunken)",
        border: "1px solid var(--c-border-subtle)",
        borderRadius: "var(--mantine-radius-sm)",
        padding: "0.2rem 0.3rem 0.2rem 0.6rem",
      }}
    >
      <Text
        size="xs"
        ff="monospace"
        style={{ overflowX: "auto", whiteSpace: "nowrap", flex: 1 }}
      >
        {code}
      </Text>
      <ActionIcon
        variant="tertiary"
        accent="neutral"
        size="sm"
        aria-label={copyLabel}
        title={copyLabel}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
      >
        <LocalIcon
          icon={copied ? "check-rounded" : "content-copy-outline-rounded"}
          width="0.9rem"
          height="0.9rem"
        />
      </ActionIcon>
    </Group>
  );
}

export default function AdminFormDetectionSection() {
  const { t } = useTranslation();
  const { status, loading, error, install, uninstall, setConfig } =
    useFormDetectionModelStatus();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmUninstallId, setConfirmUninstallId] = useState<string | null>(
    null,
  );
  const [configBusy, setConfigBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [airgapOpen, setAirgapOpen] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  const enabled = status?.enabled ?? true;
  const executionMode: FormDetectionExecutionMode =
    status?.executionMode ?? "auto";
  const serverEngineAvailable = status?.serverEngineAvailable ?? true;
  const catalog = status?.catalog ?? [];
  const st = status?.status;
  const inFlight = st === "downloading" || st === "verifying";
  const activeId = status?.activeModelId || null;
  const installedIds = status?.installed ?? [];
  const downloadingId = status?.downloadingModelId || (inFlight ? busyId : null);

  const statusTone: StatusTone =
    st === "ready"
      ? "success"
      : st === "failed"
        ? "danger"
        : inFlight
          ? "info"
          : "neutral";
  const statusLabel =
    st === "ready"
      ? t("admin.formDetection.state.ready", "Ready")
      : st === "downloading"
        ? t("admin.formDetection.state.downloading", "Downloading...")
        : st === "verifying"
          ? t("admin.formDetection.state.verifying", "Verifying...")
          : st === "failed"
            ? t("admin.formDetection.state.failed", "Failed")
            : t("admin.formDetection.state.notInstalled", "No model installed");

  const armUninstall = (id: string) => {
    setConfirmUninstallId(id);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmUninstallId(null), 4000);
  };

  const doInstall = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    setConfirmUninstallId(null);
    try {
      await install(id);
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : t("admin.formDetection.installFailed", "Install failed"),
      );
    } finally {
      setBusyId(null);
    }
  };

  const doUninstall = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    setConfirmUninstallId(null);
    try {
      await uninstall(id);
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : t("admin.formDetection.uninstallFailed", "Uninstall failed"),
      );
    } finally {
      setBusyId(null);
    }
  };

  const doSetConfig = async (config: {
    enabled?: boolean;
    executionMode?: FormDetectionExecutionMode;
  }) => {
    setConfigBusy(true);
    setActionError(null);
    try {
      await setConfig(config);
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : t("admin.formDetection.saveFailed", "Failed to save setting"),
      );
    } finally {
      setConfigBusy(false);
    }
  };

  const engineHint: Record<FormDetectionExecutionMode, string> = {
    auto: t(
      "admin.formDetection.engine.autoHint",
      "Prefers the user's browser (PDFs stay on their device) and falls back to this server if that fails.",
    ),
    browser: t(
      "admin.formDetection.engine.browserHint",
      "Always in the user's browser - PDFs never reach this server. Each device downloads a ~12 MB runtime once.",
    ),
    server: t(
      "admin.formDetection.engine.serverHint",
      "Always on this server - PDFs are uploaded for detection. Best for weak client devices.",
    ),
  };

  const anyError = actionError || error || status?.error;
  const copyLabel = t("common.copy", "Copy");

  const renderModelCard = (entry: FormDetectionCatalogEntry) => {
    const isActive = entry.id === activeId && st === "ready";
    const isInstalled = installedIds.includes(entry.id);
    const isDownloading = inFlight && downloadingId === entry.id;
    const installable = Boolean(entry.onnxUrl && entry.sha256);
    const isBusy = busyId === entry.id;

    return (
      <Paper
        key={entry.id}
        withBorder
        radius="md"
        p="sm"
        style={
          isActive
            ? { borderColor: "var(--c-primary)", background: "var(--c-primary-subtle)" }
            : undefined
        }
      >
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <div style={{ minWidth: 0 }}>
            <Group gap={6} wrap="wrap">
              <Text fw={600} size="sm">
                {entry.displayName}
              </Text>
              <Text size="xs" c="dimmed">
                {formatSize(t, entry.sizeBytes)}
              </Text>
              {isActive ? (
                <StatusBadge tone="success" size="sm">
                  {t("admin.formDetection.badge.active", "Active")}
                </StatusBadge>
              ) : isInstalled ? (
                <StatusBadge tone="neutral" size="sm">
                  {t("admin.formDetection.badge.installed", "Installed")}
                </StatusBadge>
              ) : null}
            </Group>
            <Text size="xs" c="dimmed" mt={2}>
              {entry.description}
            </Text>
          </div>

          <div style={{ flexShrink: 0 }}>
            {isActive ? (
              <Button
                variant="secondary"
                accent="danger"
                size="sm"
                loading={isBusy}
                onClick={() =>
                  confirmUninstallId === entry.id
                    ? doUninstall(entry.id)
                    : armUninstall(entry.id)
                }
              >
                {confirmUninstallId === entry.id
                  ? t("admin.formDetection.confirmUninstall", "Click to confirm")
                  : t("admin.formDetection.uninstall", "Uninstall")}
              </Button>
            ) : (
              <Group gap={4} wrap="nowrap">
                <Button
                  size="sm"
                  variant={isInstalled ? "secondary" : "primary"}
                  loading={isBusy || isDownloading}
                  disabled={!installable || inFlight || !enabled}
                  onClick={() => doInstall(entry.id)}
                >
                  {isInstalled
                    ? t("admin.formDetection.switch", "Use this model")
                    : t("admin.formDetection.install", "Install")}
                </Button>
                {isInstalled && !isBusy ? (
                  <ActionIcon
                    variant="tertiary"
                    accent="danger"
                    size="sm"
                    aria-label={
                      confirmUninstallId === entry.id
                        ? t(
                            "admin.formDetection.confirmUninstall",
                            "Click to confirm",
                          )
                        : t("admin.formDetection.uninstall", "Uninstall")
                    }
                    title={
                      confirmUninstallId === entry.id
                        ? t(
                            "admin.formDetection.confirmUninstall",
                            "Click to confirm",
                          )
                        : t("admin.formDetection.uninstall", "Uninstall")
                    }
                    onClick={() =>
                      confirmUninstallId === entry.id
                        ? doUninstall(entry.id)
                        : armUninstall(entry.id)
                    }
                  >
                    <LocalIcon
                      icon="delete-outline-rounded"
                      width="1rem"
                      height="1rem"
                    />
                  </ActionIcon>
                ) : null}
              </Group>
            )}
          </div>
        </Group>

        {isDownloading ? (
          <Stack gap={4} mt="xs">
            <ProgressBar
              value={(status?.progress ?? 0) / 100}
              label={statusLabel}
            />
            <Text size="xs" c="dimmed">
              {st === "verifying"
                ? t(
                    "admin.formDetection.verifyingNote",
                    "Verifying SHA-256 checksum...",
                  )
                : t(
                    "admin.formDetection.downloadingNote",
                    "{{percent}}% of {{size}}",
                    {
                      percent: status?.progress ?? 0,
                      size: formatSize(t, entry.sizeBytes),
                    },
                  )}
            </Text>
          </Stack>
        ) : null}

        {!installable ? (
          <Text size="xs" c="dimmed" mt={6}>
            {t(
              "admin.formDetection.notAvailable",
              "No download URL/checksum configured yet, so this model cannot be installed.",
            )}
          </Text>
        ) : null}
      </Paper>
    );
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <div>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} size="sm">
                {t("admin.formDetection.title", "AI Form Detection")}
              </Text>
              {status ? (
                <StatusBadge tone={statusTone} size="sm" pulse={inFlight}>
                  {statusLabel}
                </StatusBadge>
              ) : null}
            </Group>
            <Switch
              checked={enabled}
              onChange={(e) => doSetConfig({ enabled: e.currentTarget.checked })}
              disabled={configBusy || (loading && !status)}
              size="sm"
              aria-label={t("admin.formDetection.enableFeature", "Enable feature")}
            />
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            {t(
              "admin.formDetection.description",
              "Lets users make PDFs fillable by detecting text fields, checkboxes and signature areas with a local AI model. No data leaves your deployment.",
            )}
          </Text>
        </div>

        {loading && !status ? (
          <Loader />
        ) : (
          <Stack gap="md">
            {anyError ? (
              <Banner
                tone="danger"
                icon={
                  <LocalIcon
                    icon="error-outline-rounded"
                    width="1.1rem"
                    height="1.1rem"
                  />
                }
                title={t("admin.formDetection.errorTitle", "Something went wrong")}
                description={anyError}
              />
            ) : null}

            {status && !status.writable ? (
              <Banner
                tone="warning"
                icon={
                  <LocalIcon
                    icon="warning-rounded"
                    width="1.1rem"
                    height="1.1rem"
                  />
                }
                description={t(
                  "admin.formDetection.notWritable",
                  "The model directory is not writable; check the configs volume mount.",
                )}
              />
            ) : null}

            <div>
              <Text fw={500} size="sm" mb={4}>
                {t("admin.formDetection.engineLabel", "Where detection runs")}
              </Text>
              <SegmentedControl<FormDetectionExecutionMode>
                value={executionMode}
                onChange={(v) => doSetConfig({ executionMode: v })}
                disabled={configBusy || !enabled}
                options={[
                  {
                    label: t("admin.formDetection.engine.auto", "Auto"),
                    value: "auto",
                  },
                  {
                    label: t(
                      "admin.formDetection.engine.browser",
                      "User's browser",
                    ),
                    value: "browser",
                  },
                  {
                    label: t("admin.formDetection.engine.server", "This server"),
                    value: "server",
                    disabled: !serverEngineAvailable,
                  },
                ]}
              />
              <Text size="xs" c="dimmed" mt={4}>
                {engineHint[executionMode]}
                {!serverEngineAvailable
                  ? ` ${t(
                      "admin.formDetection.engine.serverUnavailable",
                      "(The server engine is not bundled in this build, so detection always runs in the browser.)",
                    )}`
                  : ""}
              </Text>
            </div>

            <div>
              <Text fw={500} size="sm" mb={4}>
                {t("admin.formDetection.modelsLabel", "Detection model")}
              </Text>
              <Stack gap="xs">{catalog.map(renderModelCard)}</Stack>
            </div>

            <Divider />

            <Collapsible
              open={airgapOpen}
              onToggle={() => setAirgapOpen((o) => !o)}
              header={
                <Group gap={6} wrap="nowrap">
                  <LocalIcon
                    icon="download-rounded"
                    width="1rem"
                    height="1rem"
                  />
                  <Text size="sm">
                    {t(
                      "admin.formDetection.airgap.show",
                      "Offline / air-gapped install",
                    )}
                  </Text>
                </Group>
              }
            >
              <Stack gap="sm" p="sm">
                <Text size="xs" c="dimmed">
                  {t(
                    "admin.formDetection.airgap.intro",
                    "No internet on the server? Download the model elsewhere, verify it, and copy it into the model directory. It is picked up on restart.",
                  )}
                </Text>
                {catalog
                  .filter((c) => c.onnxUrl)
                  .map((c) => (
                    <Stack gap={6} key={c.id}>
                      <Text size="xs" fw={600}>
                        {c.displayName}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t(
                          "admin.formDetection.airgap.step1",
                          "1. Download on a machine with internet:",
                        )}
                      </Text>
                      <CommandRow
                        code={`curl -L -o ${c.id}.onnx "${c.onnxUrl}"`}
                        copyLabel={copyLabel}
                      />
                      <Text size="xs" c="dimmed">
                        {t(
                          "admin.formDetection.airgap.step2",
                          "2. Check the SHA-256 checksum matches:",
                        )}
                      </Text>
                      <CommandRow
                        code={
                          c.sha256 ||
                          t(
                            "admin.formDetection.airgap.noSha",
                            "(checksum not set)",
                          )
                        }
                        copyLabel={copyLabel}
                      />
                      <Text size="xs" c="dimmed">
                        {t(
                          "admin.formDetection.airgap.step3",
                          "3. Copy it into the model directory on this server:",
                        )}
                      </Text>
                      <CommandRow
                        code={`<configs>/models/form-detection/${c.id}.onnx`}
                        copyLabel={copyLabel}
                      />
                    </Stack>
                  ))}
                <Text size="xs" c="dimmed">
                  {t(
                    "admin.formDetection.airgap.step4",
                    "4. Set formDetection.activeModelId to the model's id in settings.yml and restart. <configs> is the configs volume (e.g. /configs in Docker). The Docker image already pre-bundles the small model.",
                  )}
                </Text>
              </Stack>
            </Collapsible>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
