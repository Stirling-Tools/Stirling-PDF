import { Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { Section } from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import type {
  ScanFontChoice,
  ScanFontMatch,
} from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";

const lineImage = {
  display: "block",
  width: "100%",
  height: "auto",
  boxSizing: "border-box",
  padding: "4px 6px",
  // Page pixels sit on paper in either theme.
  background: "var(--c-document-bg)",
  borderRadius: 4,
  border: "1px solid var(--c-border-subtle)",
} as const;

export function ScanFontMatchModal({ match }: { match: ScanFontMatch }) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={match.open}
      onClose={match.close}
      title={t("pdfTextEditor.scanFont.title", "Match the scanned font")}
      size="md"
      data-testid="pdf-editor-scan-font-match"
    >
      <Stack gap="sm">
        <ScanFontHint
          status={match.status}
          typedFromScan={match.typedFromScan}
        />
        {match.status === "ready" && (
          <Stack gap="md">
            {match.scan && <OriginalScanPreview scan={match.scan} />}
            <ScanFontChoices choices={match.choices} choose={match.choose} />
          </Stack>
        )}
        <DeviceFontsNote
          deviceFonts={match.deviceFonts}
          status={match.status}
        />
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

function ScanFontHint({
  status,
  typedFromScan,
}: {
  status: ScanFontMatch["status"];
  typedFromScan: boolean;
}) {
  const { t } = useTranslation();
  if (status === "noFont")
    return (
      <Text size="sm" c="dimmed" data-testid="pdf-editor-scan-font-none">
        {t(
          "pdfTextEditor.scanFont.noFont",
          "None of the available fonts can draw this script, so typed text cannot be redrawn yet.",
        )}
      </Text>
    );
  if (status === "unmeasurable")
    return (
      <Text size="sm" c="dimmed">
        {t(
          "pdfTextEditor.scanFont.unmeasurable",
          "This scan is too faint or small to match a font to.",
        )}
      </Text>
    );
  return (
    <>
      <Stack gap={4}>
        <Text size="sm" c="dimmed" data-testid="pdf-editor-scan-font-hint">
          {typedFromScan
            ? t(
                "pdfTextEditor.scanFont.hintFromScan",
                "Your typing is built from letters found in the scan. Pick a font to draw it in that font instead.",
              )
            : t(
                "pdfTextEditor.scanFont.hint",
                "Your typing is drawn in the closest font found. Pick another if it looks more like the scan.",
              )}
        </Text>
        <Text size="xs" c="dimmed">
          {t(
            "pdfTextEditor.scanFont.hintOthers",
            "Your pick is also used for scanned text you have not edited yet.",
          )}
        </Text>
      </Stack>
      {status === "matching" && (
        <Group
          gap="xs"
          role="status"
          data-testid="pdf-editor-scan-font-matching"
        >
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            {t("pdfTextEditor.scanFont.matching", "Matching fonts…")}
          </Text>
        </Group>
      )}
    </>
  );
}

function OriginalScanPreview({ scan }: { scan: string }) {
  const { t } = useTranslation();
  return (
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
        src={scan}
        alt={t("pdfTextEditor.scanFont.scanAlt", "The scanned line")}
        style={lineImage}
      />
      <Text size="xs" c="dimmed" data-testid="pdf-editor-scan-font-note">
        {t(
          "pdfTextEditor.scanFont.scanNote",
          "Scans often look blurrier or bolder than the font really is. Compare letter shapes rather than thickness.",
        )}
      </Text>
    </Stack>
  );
}

function ScanFontChoices({
  choices,
  choose,
}: {
  choices: ScanFontChoice[];
  choose: (index: number) => void;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <Stack gap={6} role="group" aria-labelledby={labelId}>
      <Text id={labelId} size="xs" fw={600} c="dimmed" tt="uppercase">
        {t("pdfTextEditor.scanFont.choose", "Choose a font")}
      </Text>
      {choices.map((choice, i) => (
        <ScanFontChoiceButton
          key={choice.label}
          choice={choice}
          onChoose={() => choose(i)}
        />
      ))}
    </Stack>
  );
}

function choiceTone(choice: ScanFontChoice) {
  if (!choice.active)
    return {
      icon: "circle",
      iconColor: "var(--c-text-subtle)",
      border: "var(--c-border)",
      background: "var(--c-surface)",
    } as const;
  if (choice.approximate)
    return {
      icon: "circle-alert",
      iconColor: "var(--c-warning)",
      border: "var(--c-warning)",
      background: "var(--c-warning-subtle)",
    } as const;
  return {
    icon: "circle-check",
    iconColor: "var(--c-accent-fg, var(--c-primary))",
    border: "var(--c-primary)",
    background: "var(--c-primary-subtle)",
  } as const;
}

function ScanFontChoiceButton({
  choice,
  onChoose,
}: {
  choice: ScanFontChoice;
  onChoose: () => void;
}) {
  const { t } = useTranslation();
  const tone = choiceTone(choice);
  const flagged = choice.active && choice.approximate;
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={choice.active}
      data-testid="pdf-editor-scan-font-choice"
      data-active={choice.active || undefined}
      data-approximate={flagged || undefined}
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
        border: `1px solid ${tone.border}`,
        background: tone.background,
      }}
    >
      <Icon
        name={tone.icon}
        size={18}
        style={{ flexShrink: 0, color: tone.iconColor }}
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
        {flagged && (
          <Text
            size="xs"
            fw={600}
            data-testid="pdf-editor-scan-font-choice-approximate"
          >
            {t("pdfTextEditor.scanFont.approximate", "Approximate match")}
          </Text>
        )}
        {choice.preview && (
          <img src={choice.preview} alt="" style={lineImage} />
        )}
      </Stack>
    </button>
  );
}

function DeviceFontsNote({
  deviceFonts,
  status,
}: {
  deviceFonts: ScanFontMatch["deviceFonts"];
  status: ScanFontMatch["status"];
}) {
  const { t } = useTranslation();
  const { available, permission, count, loading, load } = deviceFonts;
  if (!available || permission === "unsupported" || status === "unmeasurable")
    return null;
  if (count !== null && count > 0)
    return (
      <Group
        gap={6}
        wrap="nowrap"
        role="status"
        data-testid="pdf-editor-scan-font-device-on"
      >
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
      <Text size="xs" c="dimmed" role="status">
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
  const allow = (
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
      {permission === "denied"
        ? t("pdfTextEditor.scanFont.deviceRetry", "Try again")
        : t(
            "pdfTextEditor.scanFont.deviceAllow",
            "Allow font access for better matching",
          )}
    </Button>
  );
  if (permission === "denied")
    return (
      <Stack
        gap={6}
        p="sm"
        style={{ border: "1px solid var(--c-border)", borderRadius: 6 }}
        data-testid="pdf-editor-scan-font-device"
      >
        <Text size="sm" fw={600}>
          {t(
            "pdfTextEditor.scanFont.deviceBlockedTitle",
            "Font access is blocked",
          )}
        </Text>
        <Text size="xs" c="dimmed">
          {t(
            "pdfTextEditor.scanFont.deviceBlocked",
            "Your browser won't ask again. To allow it, click the icon left of the address bar, turn on Fonts, then try again.",
          )}
        </Text>
        <Group>{allow}</Group>
      </Stack>
    );
  return (
    <Stack
      gap={6}
      p="sm"
      align="center"
      style={{ border: "1px solid var(--c-border)", borderRadius: 6 }}
      data-testid="pdf-editor-scan-font-device"
    >
      {allow}
      <Text size="xs" c="dimmed" ta="center">
        {t(
          "pdfTextEditor.scanFont.deviceNote",
          "Your browser asks first. Fonts stay on this device.",
        )}
      </Text>
    </Stack>
  );
}

export function ScanFontMatchRow({ match }: { match: ScanFontMatch }) {
  const { t } = useTranslation();
  if (match.approximate)
    return (
      <Section testId="pdf-editor-scan-font-row">
        <Stack gap={6} data-testid="pdf-editor-scan-font-approximate">
          <Group gap={6} wrap="nowrap">
            <Icon
              name="circle-alert"
              size={16}
              style={{ flexShrink: 0, color: "var(--c-warning)" }}
            />
            <Text size="sm" fw={600}>
              {t("pdfTextEditor.scanFont.approximate", "Approximate match")}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            {t(
              "pdfTextEditor.scanFont.approximateHint",
              "The closest font found may not match the scan.",
            )}
          </Text>
          <Group>
            <Button
              size="sm"
              variant="secondary"
              accent="neutral"
              leftSection={<Icon name="case-sensitive" size={18} />}
              onClick={match.show}
              data-testid="pdf-editor-scan-font-open"
            >
              {t("pdfTextEditor.scanFont.compare", "Compare fonts…")}
            </Button>
          </Group>
        </Stack>
      </Section>
    );
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
