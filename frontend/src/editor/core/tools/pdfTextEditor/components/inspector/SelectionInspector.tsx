import { useMemo } from "react";
import { Group, SimpleGrid, Stack, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import {
  PointsInput,
  Section,
  SectionLabel,
} from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import type { SelectionGeometry } from "@editor/tools/pdfTextEditor/hooks/useSelectionGeometry";
import type { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import { modShortcut } from "@editor/utils/hotkeys";
import { ScanFontMatchRow } from "@editor/tools/pdfTextEditor/components/inspector/ScanFontMatchModal";
import type { ScanFontMatch } from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";
import { imageTransforms } from "@editor/tools/pdfTextEditor/components/toolbar/ImageGroup";

export type InspectorController = ReturnType<typeof useToolbarController>;

interface Props {
  controller: InspectorController;
  selection: SelectionState;
  geometry: SelectionGeometry;
  /** Why typing into the selected text will not come out as expected, if it won't. */
  fontNote: string | null;
  scanFontMatch?: ScanFontMatch | null;
  canGroup: boolean;
  canUngroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  /** False where the floating selection bar carries the image tools instead. */
  showImageTools?: boolean;
}

/**
 * Properties of whatever is selected right now.
 *
 * Deliberately NOT the whole of the selection's UI: character formatting and
 * the arrange/lock/delete verbs sit in the canvas toolbar, where document
 * editors have always put them. What lands here is what needs a label and a
 * number - geometry and paragraph structure.
 */
export function SelectionInspector({
  controller,
  selection,
  geometry,
  fontNote,
  scanFontMatch,
  canGroup,
  canUngroup,
  onGroup,
  onUngroup,
  showImageTools = true,
}: Props) {
  const runCount = selection.runIds.length;
  const imageCount = selection.imageIds.length;
  const { hasRunSelection, hasImageSelection } = controller;
  const note = hasRunSelection ? fontNote : null;
  const showScanFont = !!scanFontMatch?.canShow;

  return (
    <Stack gap={0} data-testid="pdf-editor-selection-inspector">
      {note && <FontWarning note={note} />}
      {showScanFont && <ScanFontMatchRow match={scanFontMatch} />}
      {runCount + imageCount > 0 && (
        <GeometrySection
          geometry={geometry}
          isImage={!hasRunSelection}
          first={!note && !showScanFont}
        />
      )}
      {hasRunSelection && (
        <ParagraphSection
          canGroup={canGroup}
          canUngroup={canUngroup}
          onGroup={onGroup}
          onUngroup={onUngroup}
        />
      )}
      {hasImageSelection && showImageTools && (
        <ImageSection controller={controller} />
      )}
    </Stack>
  );
}

/** Shown only when typing into the selection will not come out as expected. */
function FontWarning({ note }: { note: string }) {
  return (
    <Section first testId="pdf-editor-inspector-font-note">
      <Group gap={6} wrap="nowrap" align="flex-start">
        <Icon
          name="circle-alert"
          size={16}
          style={{ flexShrink: 0, marginTop: 1, color: "var(--c-warning)" }}
        />
        <Text size="xs">{note}</Text>
      </Group>
    </Section>
  );
}

/** Merge selected runs into a paragraph, or split one back into lines. */
function ParagraphSection({
  canGroup,
  canUngroup,
  onGroup,
  onUngroup,
}: {
  canGroup: boolean;
  canUngroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Section testId="pdf-editor-paragraph-section">
      <SectionLabel>
        {t("pdfTextEditor.sidebar.paragraph", "Paragraph")}
      </SectionLabel>
      <Group grow gap="xs" wrap="nowrap">
        <Tooltip
          label={
            canGroup
              ? t("pdfTextEditor.sidebar.groupTooltip", {
                  defaultValue:
                    "Merge selected runs into one paragraph ({{shortcut}})",
                  shortcut: modShortcut("M"),
                })
              : t(
                  "pdfTextEditor.sidebar.groupTooltipDisabled",
                  "Select 2+ runs to merge",
                )
          }
        >
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            leftSection={<Icon name="merge" size={20} />}
            onClick={onGroup}
            disabled={!canGroup}
            data-testid="pdf-editor-group"
          >
            {t("pdfTextEditor.sidebar.group", "Group")}
          </Button>
        </Tooltip>
        <Tooltip
          label={
            canUngroup
              ? t(
                  "pdfTextEditor.sidebar.ungroupTooltip",
                  "Split this paragraph into one run per line",
                )
              : t(
                  "pdfTextEditor.sidebar.ungroupTooltipDisabled",
                  "Select a multi-line paragraph to ungroup",
                )
          }
        >
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            leftSection={<Icon name="split" size={20} />}
            onClick={onUngroup}
            disabled={!canUngroup}
            data-testid="pdf-editor-ungroup"
          >
            {t("pdfTextEditor.sidebar.ungroup", "Ungroup")}
          </Button>
        </Tooltip>
      </Group>
    </Section>
  );
}

/** Position and size, in PDF points, for a single selected object. */
function GeometrySection({
  geometry,
  isImage,
  first,
}: {
  geometry: SelectionGeometry;
  isImage: boolean;
  first: boolean;
}) {
  const { t } = useTranslation();
  if (!geometry.single) {
    return (
      <Section first={first}>
        <SectionLabel>
          {t("pdfTextEditor.inspector.geometry", "Position & size")}
        </SectionLabel>
        <Text size="xs" c="dimmed">
          {t(
            "pdfTextEditor.inspector.multiGeometry",
            "Select a single object to edit its position and size.",
          )}
        </Text>
      </Section>
    );
  }
  const { bounds, setX, setY, setWidth, setHeight } = geometry.single;
  return (
    <Section testId="pdf-editor-geometry-section" first={first}>
      <SectionLabel>
        {t("pdfTextEditor.inspector.geometry", "Position & size")}
      </SectionLabel>
      <SimpleGrid cols={2} spacing="xs" verticalSpacing="xs">
        <PointsInput
          value={bounds.x}
          onCommit={setX}
          label={t("pdfTextEditor.inspector.x", "X")}
          prefix={t("pdfTextEditor.inspector.x", "X")}
          testId="pdf-editor-pos-x"
        />
        <PointsInput
          value={bounds.y}
          onCommit={setY}
          label={t("pdfTextEditor.inspector.y", "Y")}
          prefix={t("pdfTextEditor.inspector.y", "Y")}
          testId="pdf-editor-pos-y"
        />
        <Tooltip
          label={t(
            "pdfTextEditor.inspector.widthHint",
            "Text re-wraps to fit the width.",
          )}
          disabled={isImage || !setWidth}
          multiline
          w={200}
        >
          <div>
            <PointsInput
              value={bounds.width}
              onCommit={setWidth ?? (() => undefined)}
              min={1}
              disabled={!setWidth}
              label={t("pdfTextEditor.inspector.width", "Width")}
              prefix={t("pdfTextEditor.inspector.widthShort", "W")}
              testId="pdf-editor-size-w"
            />
          </div>
        </Tooltip>
        <Tooltip
          label={t(
            "pdfTextEditor.inspector.heightHint",
            "A text box's height follows its type size and line count.",
          )}
          disabled={!!setHeight}
          multiline
          w={200}
        >
          <div>
            <PointsInput
              value={bounds.height}
              onCommit={setHeight ?? (() => undefined)}
              min={1}
              disabled={!setHeight}
              label={t("pdfTextEditor.inspector.height", "Height")}
              prefix={t("pdfTextEditor.inspector.heightShort", "H")}
              testId="pdf-editor-size-h"
            />
          </div>
        </Tooltip>
      </SimpleGrid>
    </Section>
  );
}

/** Rotate/flip plus the two ways to swap an image's pixels. */
function ImageSection({ controller }: { controller: InspectorController }) {
  const { t } = useTranslation();
  const {
    onTransformImage,
    onReplaceImage,
    onEditImageExternally,
    externalEditSupported,
  } = controller;
  const transforms = useMemo(() => imageTransforms(t), [t]);

  return (
    <Section testId="pdf-editor-imgop-menu">
      <SectionLabel>{t("pdfTextEditor.inspector.image", "Image")}</SectionLabel>
      <Stack gap="xs">
        <Group gap={4} wrap="nowrap">
          {transforms.map((tr) => (
            <Tooltip key={tr.mode} label={tr.label}>
              <Button
                size="sm"
                variant="secondary"
                accent="neutral"
                aria-label={tr.label}
                data-testid={tr.testId}
                onClick={() => onTransformImage(tr.mode)}
                leftSection={tr.icon}
              />
            </Tooltip>
          ))}
        </Group>
        <Button
          size="sm"
          variant="secondary"
          accent="neutral"
          fullWidth
          justify="start"
          leftSection={<Icon name="image" size={20} />}
          onClick={onReplaceImage}
          data-testid="pdf-editor-imgop-replace"
        >
          {t(
            "pdfTextEditor.toolbar.replaceImage",
            "Replace, keeping placement",
          )}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          accent="neutral"
          fullWidth
          justify="start"
          leftSection={<Icon name="external-link" size={20} />}
          onClick={onEditImageExternally}
          disabled={!externalEditSupported}
          data-testid="pdf-editor-imgop-edit-externally"
        >
          {t(
            "pdfTextEditor.toolbar.editImageExternally",
            "Edit in another app",
          )}
        </Button>
      </Stack>
    </Section>
  );
}
