import { Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { Section } from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import type { ScanFontMatch } from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";

const lineImage = {
  display: "block",
  width: "100%",
  height: "auto",
  boxSizing: "border-box",
  padding: "4px 6px",
  background: "white",
  borderRadius: 4,
  border: "1px solid var(--c-border-subtle)",
} as const;

export function ScanFontMatchModal({ match }: { match: ScanFontMatch }) {
  const { t } = useTranslation();
  const choicesLabelId = useId();
  return (
    <Modal
      opened={match.open}
      onClose={match.close}
      title={t("pdfTextEditor.scanFont.title", "Match the scanned font")}
      size="md"
      data-testid="pdf-editor-scan-font-match"
    >
      <Stack gap="sm">
        {match.status !== "noFont" && (
          <Text size="sm" c="dimmed">
            {t(
              "pdfTextEditor.scanFont.hint",
              "Your typing is drawn in the closest font found. Pick another if it looks more like the scan.",
            )}
          </Text>
        )}
        {match.status === "matching" && (
          <Group gap="xs" data-testid="pdf-editor-scan-font-matching">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
              {t("pdfTextEditor.scanFont.matching", "Matching fonts…")}
            </Text>
          </Group>
        )}
        {match.status === "noFont" && (
          <Text size="sm" c="dimmed" data-testid="pdf-editor-scan-font-none">
            {t(
              "pdfTextEditor.scanFont.noFont",
              "None of the available fonts can draw this script, so typed text cannot be redrawn yet. Allow fonts on this computer to add one.",
            )}
          </Text>
        )}
        {match.status === "unmeasurable" && (
          <Text size="sm" c="dimmed">
            {t(
              "pdfTextEditor.scanFont.unmeasurable",
              "This scan is too faint or small to match a font to.",
            )}
          </Text>
        )}
        {match.status === "ready" && (
          <Stack gap="md">
            {match.scan && (
              <Stack
                gap={6}
                p="sm"
                style={{
                  background: "var(--c-surface-sunken)",
                  borderRadius: 6,
                }}
                data-testid="pdf-editor-scan-font-original"
              >
                <Group gap={6} wrap="nowrap">
                  <Icon name="scan-text" size={14} />
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                    {t("pdfTextEditor.scanFont.scan", "Original scan")}
                  </Text>
                </Group>
                <img
                  src={match.scan}
                  alt={t("pdfTextEditor.scanFont.scanAlt", "The scanned line")}
                  style={lineImage}
                />
                <Text
                  size="xs"
                  c="dimmed"
                  data-testid="pdf-editor-scan-font-note"
                >
                  {t(
                    "pdfTextEditor.scanFont.scanNote",
                    "Scans often look blurrier or bolder than the font really is. Compare letter shapes rather than thickness.",
                  )}
                </Text>
              </Stack>
            )}
            <Stack gap={6} role="radiogroup" aria-labelledby={choicesLabelId}>
              <Text
                id={choicesLabelId}
                size="xs"
                fw={600}
                c="dimmed"
                tt="uppercase"
              >
                {t("pdfTextEditor.scanFont.choose", "Choose a font")}
              </Text>
              {match.choices.map((choice, i) => (
                <button
                  type="button"
                  role="radio"
                  key={choice.label}
                  onClick={() => match.choose(i)}
                  aria-checked={choice.active}
                  data-testid="pdf-editor-scan-font-choice"
                  data-active={choice.active || undefined}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    width: "100%",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "inherit",
                    font: "inherit",
                    padding: 10,
                    borderRadius: 6,
                    border: `1px solid ${choice.active ? "var(--c-primary)" : "var(--c-border)"}`,
                    background: choice.active
                      ? "var(--c-primary-subtle)"
                      : "var(--c-surface)",
                  }}
                >
                  <Icon
                    name={choice.active ? "circle-check" : "circle"}
                    size={18}
                    style={{
                      flexShrink: 0,
                      color: choice.active
                        ? "var(--c-accent-fg, var(--c-primary))"
                        : "var(--c-text-subtle)",
                    }}
                  />
                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Group justify="space-between" gap="xs" wrap="nowrap">
                      <Text size="sm" fw={600} truncate>
                        {choice.label}
                      </Text>
                      <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                        {t("pdfTextEditor.scanFont.score", "{{match}}% alike", {
                          match: choice.match,
                        })}
                      </Text>
                    </Group>
                    {choice.preview && (
                      <img
                        src={choice.preview}
                        alt={t(
                          "pdfTextEditor.scanFont.previewAlt",
                          "The scanned line redrawn in {{font}}",
                          { font: choice.label },
                        )}
                        style={lineImage}
                      />
                    )}
                  </Stack>
                </button>
              ))}
            </Stack>
          </Stack>
        )}
        <DeviceFontsNote deviceFonts={match.deviceFonts} />
        <Group justify="flex-end">
          <Button
            variant="primary"
            onClick={match.close}
            data-testid="pdf-editor-scan-font-done"
          >
            {t("pdfTextEditor.scanFont.done", "Done")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function DeviceFontsNote({
  deviceFonts,
}: {
  deviceFonts: ScanFontMatch["deviceFonts"];
}) {
  const { t } = useTranslation();
  const { permission, count, loading, load } = deviceFonts;
  if (permission === "unsupported") return null;
  if (count !== null && count > 0)
    return (
      <Group gap={6} wrap="nowrap" data-testid="pdf-editor-scan-font-device-on">
        <Icon
          name="circle-check"
          size={14}
          style={{ color: "var(--c-success)" }}
        />
        <Text size="xs" c="dimmed">
          {t("pdfTextEditor.scanFont.deviceOn", {
            count,
            defaultValue_one:
              "Also compared with {{count}} font on this computer.",
            defaultValue_other:
              "Also compared with {{count}} fonts on this computer.",
          })}
        </Text>
      </Group>
    );
  if (permission === "granted")
    return (
      <Text size="xs" c="dimmed">
        {loading
          ? t(
              "pdfTextEditor.scanFont.deviceReading",
              "Reading fonts on this computer…",
            )
          : t(
              "pdfTextEditor.scanFont.deviceNone",
              "None of the usual document fonts are installed on this computer.",
            )}
      </Text>
    );
  const denied = permission === "denied";
  return (
    <Stack
      gap={6}
      p="sm"
      style={{ border: "1px solid var(--c-border)", borderRadius: 6 }}
      data-testid="pdf-editor-scan-font-device"
    >
      <Text size="sm" fw={600}>
        {denied
          ? t(
              "pdfTextEditor.scanFont.deviceBlockedTitle",
              "Font access is blocked",
            )
          : t(
              "pdfTextEditor.scanFont.deviceTitle",
              "Compare with fonts on this computer?",
            )}
      </Text>
      <Text size="xs" c="dimmed">
        {denied
          ? t(
              "pdfTextEditor.scanFont.deviceBlocked",
              "Your browser won't ask again. To allow it, click the icon left of the address bar, turn on Fonts, then try again.",
            )
          : t(
              "pdfTextEditor.scanFont.deviceHint",
              "Fonts like Arial or Georgia may match better than the ones above. Your browser asks first. Fonts stay on this device, and only a font you use is embedded in the PDF.",
            )}
      </Text>
      <Group>
        <Button
          size="sm"
          variant="secondary"
          accent="neutral"
          loading={loading}
          disabled={loading}
          leftSection={<Icon name="case-sensitive" size={18} />}
          onClick={load}
          data-testid="pdf-editor-scan-font-device-allow"
        >
          {denied
            ? t("pdfTextEditor.scanFont.deviceRetry", "Try again")
            : t("pdfTextEditor.scanFont.useDevice", "Allow font access")}
        </Button>
      </Group>
    </Stack>
  );
}

export function ScanFontMatchRow({ match }: { match: ScanFontMatch }) {
  const { t } = useTranslation();
  return (
    <Section testId="pdf-editor-scan-font-row">
      <Button
        size="sm"
        variant="tertiary"
        accent="neutral"
        justify="start"
        leftSection={<Icon name="case-sensitive" size={18} />}
        onClick={match.show}
        data-testid="pdf-editor-scan-font-open"
      >
        {match.undrawable
          ? t(
              "pdfTextEditor.scanFont.chooseMissing",
              "Choose a font for this text…",
            )
          : t("pdfTextEditor.scanFont.change", "Font not looking right?")}
      </Button>
    </Section>
  );
}
