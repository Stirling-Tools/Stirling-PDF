import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Stack,
  Text,
  Paper,
  Group,
  Button,
  Select,
  SegmentedControl,
  Switch,
  Progress,
  Alert,
  Loader,
  Badge,
  Spoiler,
  Code,
} from "@mantine/core";
import {
  useFormDetectionModelStatus,
  FormDetectionState,
  FormDetectionExecutionMode,
} from "@app/hooks/useFormDetectionModelStatus";
import { Z_INDEX_CONFIG_MODAL } from "@app/styles/zIndex";

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "size TBD";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${Math.round(mb)}MB`;
}

function badgeColor(s?: FormDetectionState): string {
  switch (s) {
    case "ready":
      return "green";
    case "downloading":
    case "verifying":
      return "blue";
    case "failed":
      return "red";
    default:
      return "gray";
  }
}

export default function AdminFormDetectionSection() {
  const { t } = useTranslation();
  const { status, loading, error, install, uninstall, setConfig } =
    useFormDetectionModelStatus();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const enabled = status?.enabled ?? true;
  const executionMode: FormDetectionExecutionMode =
    status?.executionMode ?? "auto";
  const serverEngineAvailable = status?.serverEngineAvailable ?? true;

  const catalog = status?.catalog ?? [];
  const selectData = useMemo(
    () =>
      catalog.map((c) => ({
        value: c.id,
        label: `${c.displayName} · ${formatSize(c.sizeBytes)}`,
      })),
    [catalog],
  );

  const effectiveId =
    selectedId ?? status?.activeModelId ?? catalog[0]?.id ?? null;
  const selectedEntry = catalog.find((c) => c.id === effectiveId);
  const installable = Boolean(selectedEntry?.onnxUrl && selectedEntry?.sha256);
  const st = status?.status;
  const inFlight = st === "downloading" || st === "verifying";
  const activeId = status?.activeModelId || null;
  const activeEntry = catalog.find((c) => c.id === activeId);
  const installedIds = status?.installed ?? [];
  // The action depends on the *selected* model, not just the overall status:
  // only the currently-active model can be uninstalled; any other selection installs/switches.
  const selectedIsActive =
    st === "ready" && effectiveId != null && effectiveId === activeId;
  const selectedIsInstalled =
    effectiveId != null && installedIds.includes(effectiveId);

  const doInstall = async () => {
    if (!effectiveId) return;
    setBusy(true);
    setActionError(null);
    try {
      await install(effectiveId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setBusy(false);
    }
  };

  const doUninstall = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await uninstall(status?.activeModelId || undefined);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Uninstall failed");
    } finally {
      setBusy(false);
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
      setActionError(e instanceof Error ? e.message : "Failed to save setting");
    } finally {
      setConfigBusy(false);
    }
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <div>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text fw={600} size="sm">
              {t("admin.formDetection.title", "AI Form Detection")}
            </Text>
            <Switch
              checked={enabled}
              onChange={(e) => doSetConfig({ enabled: e.currentTarget.checked })}
              disabled={configBusy || (loading && !status)}
              size="sm"
              aria-label={t(
                "admin.formDetection.enableFeature",
                "Enable feature",
              )}
            />
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            {t(
              "admin.formDetection.description",
              "Install the AI model used to auto-detect form fields. The selected model is downloaded on demand (about 40-100MB) into the configs volume and is not bundled with Stirling-PDF.",
            )}
          </Text>
        </div>

        {loading && !status ? (
          <Loader />
        ) : (
          <Stack gap="sm">
            <Group gap="xs">
              <Text fw={500}>
                {t("admin.formDetection.status", "Status")}:
              </Text>
              <Badge color={badgeColor(st)} variant="light" size="sm">
                {st ?? "unknown"}
              </Badge>
              {activeId ? (
                <Text size="sm">
                  {t("admin.formDetection.active", "Active")}:{" "}
                  {activeEntry?.displayName ?? activeId}
                </Text>
              ) : null}
            </Group>

            <div>
              <Text fw={500} size="sm">
                {t("admin.formDetection.engineLabel", "Where detection runs")}
              </Text>
              <Text size="xs" c="dimmed" mb={6}>
                {t(
                  "admin.formDetection.engineDescription",
                  "Browser keeps the PDF on the device (downloads a ~12MB runtime once, then cached); Server runs it on the backend; Auto prefers the browser and falls back to the server.",
                )}
              </Text>
              <SegmentedControl
                value={executionMode}
                onChange={(v) =>
                  doSetConfig({ executionMode: v as FormDetectionExecutionMode })
                }
                disabled={configBusy || !enabled}
                data={[
                  {
                    label: t("admin.formDetection.engine.auto", "Auto"),
                    value: "auto",
                  },
                  {
                    label: t("admin.formDetection.engine.browser", "Browser"),
                    value: "browser",
                  },
                  {
                    label: t("admin.formDetection.engine.server", "Server"),
                    value: "server",
                    disabled: !serverEngineAvailable,
                  },
                ]}
              />
              {!serverEngineAvailable ? (
                <Text size="xs" c="dimmed" mt={6}>
                  {t(
                    "admin.formDetection.engine.serverUnavailable",
                    "The server engine is not bundled in this build, so detection runs in the browser. Use Auto or Browser.",
                  )}
                </Text>
              ) : null}
            </div>

            {inFlight ? (
              <Progress value={status?.progress ?? 0} striped animated />
            ) : null}

            <Select
              label={t("admin.formDetection.selectModel", "Model")}
              data={selectData}
              value={effectiveId}
              onChange={setSelectedId}
              disabled={busy || inFlight}
              placeholder={t(
                "admin.formDetection.selectPlaceholder",
                "Select a model",
              )}
              comboboxProps={{ zIndex: Z_INDEX_CONFIG_MODAL }}
            />

            {selectedEntry?.description ? (
              <Text size="sm">{selectedEntry.description}</Text>
            ) : null}

            {selectedEntry?.license ? (
              <Text size="xs" c="dimmed">
                {t("admin.formDetection.license", "License")}:{" "}
                {selectedEntry.license}
              </Text>
            ) : null}

            {selectedEntry?.onnxUrl ? (
              <Spoiler
                maxHeight={0}
                showLabel={t(
                  "admin.formDetection.airgap.show",
                  "Air-gapped / offline install instructions",
                )}
                hideLabel={t(
                  "admin.formDetection.airgap.hide",
                  "Hide offline install instructions",
                )}
                styles={{
                  control: { fontSize: "var(--mantine-font-size-xs)" },
                }}
              >
                <Stack gap={4} mt={6}>
                  <Text size="xs" c="dimmed">
                    {t(
                      "admin.formDetection.airgap.intro",
                      "No internet on the server? Install the model manually:",
                    )}
                  </Text>
                  <Text size="xs">
                    {t(
                      "admin.formDetection.airgap.step1",
                      "1. On a machine with internet, download the model file:",
                    )}
                  </Text>
                  <Code block>{`curl -L -o ${selectedEntry.id}.onnx "${selectedEntry.onnxUrl}"`}</Code>
                  <Text size="xs">
                    {t(
                      "admin.formDetection.airgap.step2",
                      "2. Verify its SHA-256 checksum matches:",
                    )}
                  </Text>
                  <Code block>
                    {selectedEntry.sha256 ||
                      t("admin.formDetection.airgap.noSha", "(checksum not set)")}
                  </Code>
                  <Text size="xs">
                    {t(
                      "admin.formDetection.airgap.step3",
                      "3. Copy it onto the Stirling-PDF server into the model directory:",
                    )}
                  </Text>
                  <Code block>{`<configs>/models/form-detection/${selectedEntry.id}.onnx`}</Code>
                  <Text size="xs" c="dimmed">
                    {t(
                      "admin.formDetection.airgap.step4",
                      "4. Set formDetection.activeModelId to this model's id in settings.yml, then restart (an installed model is auto-detected on boot). <configs> is the configs volume (e.g. /configs in Docker). Alternatively, point the Install button at an internal mirror using an override URL + checksum.",
                    )}
                  </Text>
                </Stack>
              </Spoiler>
            ) : null}

            {selectedEntry && !installable ? (
              <Alert color="yellow" variant="light">
                {t(
                  "admin.formDetection.notAvailable",
                  "This catalog entry has no download URL/checksum configured yet, so it cannot be installed.",
                )}
              </Alert>
            ) : null}

            <Group>
              {selectedIsActive ? (
                <Button
                  color="red"
                  variant="light"
                  loading={busy}
                  onClick={doUninstall}
                >
                  {t("admin.formDetection.uninstall", "Uninstall")}
                </Button>
              ) : (
                <Button
                  loading={busy || inFlight}
                  disabled={!installable}
                  onClick={doInstall}
                >
                  {selectedIsInstalled
                    ? t("admin.formDetection.switch", "Switch to this model")
                    : t("admin.formDetection.install", "Install")}
                </Button>
              )}
            </Group>

            {actionError || error || status?.error ? (
              <Alert color="red" variant="light">
                {actionError || error || status?.error}
              </Alert>
            ) : null}

            {status && !status.writable ? (
              <Alert color="red" variant="light">
                {t(
                  "admin.formDetection.notWritable",
                  "The model directory is not writable; check the configs volume mount.",
                )}
              </Alert>
            ) : null}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
