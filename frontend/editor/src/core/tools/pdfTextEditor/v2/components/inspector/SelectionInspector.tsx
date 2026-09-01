import { useMemo } from "react";
import { Group, Stack, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import ImageIcon from "@mui/icons-material/ImageOutlined";
import CallMergeIcon from "@mui/icons-material/CallMergeOutlined";
import CallSplitIcon from "@mui/icons-material/CallSplitOutlined";
import RotateLeftIcon from "@mui/icons-material/RotateLeftOutlined";
import RotateRightIcon from "@mui/icons-material/RotateRightOutlined";
import FlipIcon from "@mui/icons-material/FlipOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNewOutlined";
import {
  Field,
  PointsInput,
  Section,
  SectionLabel,
} from "@app/tools/pdfTextEditor/v2/components/inspector/InspectorPrimitives";
import type { SelectionGeometry } from "@app/tools/pdfTextEditor/v2/hooks/useSelectionGeometry";
import type { useToolbarController } from "@app/tools/pdfTextEditor/v2/hooks/useToolbarController";
import type { SelectionState } from "@app/tools/pdfTextEditor/v2/types";

export type InspectorController = ReturnType<typeof useToolbarController>;

interface Props {
  controller: InspectorController;
  selection: SelectionState;
  geometry: SelectionGeometry;
  /** Font status for the selected runs, e.g. "Embedded · full alphabet". */
  fontNote: string | null;
  canGroup: boolean;
  canUngroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
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
  canGroup,
  canUngroup,
  onGroup,
  onUngroup,
}: Props) {
  const runCount = selection.runIds.length;
  const imageCount = selection.imageIds.length;
  const { hasRunSelection, hasImageSelection } = controller;

  return (
    <Stack gap={0} data-testid="v2-selection-inspector">
      <SelectionHeader
        runCount={runCount}
        imageCount={imageCount}
        fontNote={hasRunSelection ? fontNote : null}
      />
      <GeometrySection geometry={geometry} isImage={!hasRunSelection} />
      {hasRunSelection && (
        <ParagraphSection
          canGroup={canGroup}
          canUngroup={canUngroup}
          onGroup={onGroup}
          onUngroup={onUngroup}
        />
      )}
      {hasImageSelection && <ImageSection controller={controller} />}
    </Stack>
  );
}

/** Names what is selected, and how its font will treat new characters. */
function SelectionHeader({
  runCount,
  imageCount,
  fontNote,
}: {
  runCount: number;
  imageCount: number;
  fontNote: string | null;
}) {
  const { t } = useTranslation();
  let title: string;
  if (runCount > 0 && imageCount > 0) {
    title = t("pdfTextEditorV2.inspector.mixed", "{{count}} objects", {
      count: runCount + imageCount,
    });
  } else if (runCount > 0) {
    title =
      runCount === 1
        ? t("pdfTextEditorV2.inspector.oneText", "Text")
        : t("pdfTextEditorV2.inspector.manyText", "Text · {{count}} boxes", {
            count: runCount,
          });
  } else {
    title =
      imageCount === 1
        ? t("pdfTextEditorV2.inspector.oneImage", "Image")
        : t("pdfTextEditorV2.inspector.manyImages", "{{count}} images", {
            count: imageCount,
          });
  }
  return (
    <Section tinted first>
      {/* Doubles as the old sidebar's selection readout, moved from the very
          bottom of the panel to the top where the user is already looking. */}
      <Text size="sm" fw={600} data-testid="v2-selection-count">
        {title}
      </Text>
      {fontNote && (
        <Text size="xs" c="dimmed" mt={4} data-testid="v2-inspector-font-note">
          {fontNote}
        </Text>
      )}
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
    <Section testId="v2-paragraph-section">
      <SectionLabel>
        {t("pdfTextEditorV2.sidebar.paragraph", "Paragraph")}
      </SectionLabel>
      <Group grow gap="xs" wrap="nowrap">
        <Tooltip
          label={
            canGroup
              ? t(
                  "pdfTextEditorV2.sidebar.groupTooltip",
                  "Merge selected runs into one paragraph (Ctrl+M)",
                )
              : t(
                  "pdfTextEditorV2.sidebar.groupTooltipDisabled",
                  "Select 2+ runs to merge",
                )
          }
        >
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            leftSection={<CallMergeIcon fontSize="small" />}
            onClick={onGroup}
            disabled={!canGroup}
            data-testid="v2-group"
          >
            {t("pdfTextEditorV2.sidebar.group", "Group")}
          </Button>
        </Tooltip>
        <Tooltip
          label={
            canUngroup
              ? t(
                  "pdfTextEditorV2.sidebar.ungroupTooltip",
                  "Split this paragraph into one run per line",
                )
              : t(
                  "pdfTextEditorV2.sidebar.ungroupTooltipDisabled",
                  "Select a multi-line paragraph to ungroup",
                )
          }
        >
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            leftSection={<CallSplitIcon fontSize="small" />}
            onClick={onUngroup}
            disabled={!canUngroup}
            data-testid="v2-ungroup"
          >
            {t("pdfTextEditorV2.sidebar.ungroup", "Ungroup")}
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
}: {
  geometry: SelectionGeometry;
  isImage: boolean;
}) {
  const { t } = useTranslation();
  if (!geometry.single) {
    return (
      <Section>
        <SectionLabel>
          {t("pdfTextEditorV2.inspector.geometry", "Position & size")}
        </SectionLabel>
        <Text size="xs" c="dimmed">
          {t(
            "pdfTextEditorV2.inspector.multiGeometry",
            "Select a single object to edit its position and size.",
          )}
        </Text>
      </Section>
    );
  }
  const { bounds, setX, setY, setWidth, setHeight } = geometry.single;
  return (
    <Section testId="v2-geometry-section">
      <SectionLabel>
        {t("pdfTextEditorV2.inspector.geometry", "Position & size")}
      </SectionLabel>
      <Stack gap="xs">
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <Field label={t("pdfTextEditorV2.inspector.x", "X")}>
            <PointsInput
              value={bounds.x}
              onCommit={setX}
              label={t("pdfTextEditorV2.inspector.x", "X")}
              testId="v2-pos-x"
            />
          </Field>
          <Field label={t("pdfTextEditorV2.inspector.y", "Y")}>
            <PointsInput
              value={bounds.y}
              onCommit={setY}
              label={t("pdfTextEditorV2.inspector.y", "Y")}
              testId="v2-pos-y"
            />
          </Field>
        </Group>
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <Field
            label={t("pdfTextEditorV2.inspector.width", "Width")}
            hint={
              isImage
                ? undefined
                : t(
                    "pdfTextEditorV2.inspector.widthHint",
                    "A text box's width follows its content and wrapping.",
                  )
            }
          >
            {/* Read-only for text: setting a width goes through the reflow,
                which splits inside words on runs whose glyphs are positioned
                individually. Until that is token-aware this must not be a
                one-keystroke way to shred a heading. */}
            <PointsInput
              value={bounds.width}
              onCommit={isImage ? setWidth : () => undefined}
              min={1}
              disabled={!isImage}
              label={t("pdfTextEditorV2.inspector.width", "Width")}
              testId="v2-size-w"
            />
          </Field>
          <Field
            label={t("pdfTextEditorV2.inspector.height", "Height")}
            hint={
              setHeight
                ? undefined
                : t(
                    "pdfTextEditorV2.inspector.heightHint",
                    "A text box's height follows its type size and line count.",
                  )
            }
          >
            <PointsInput
              value={bounds.height}
              onCommit={setHeight ?? (() => undefined)}
              min={1}
              disabled={!setHeight}
              label={t("pdfTextEditorV2.inspector.height", "Height")}
              testId="v2-size-h"
            />
          </Field>
        </Group>
      </Stack>
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
  const transforms = useMemo(
    () =>
      [
        {
          mode: "rotate-ccw" as const,
          testId: "v2-imgop-rotate-ccw",
          icon: <RotateLeftIcon fontSize="small" />,
          label: t("pdfTextEditorV2.toolbar.rotateLeft", "Rotate 90° left"),
        },
        {
          mode: "rotate-cw" as const,
          testId: "v2-imgop-rotate-cw",
          icon: <RotateRightIcon fontSize="small" />,
          label: t("pdfTextEditorV2.toolbar.rotateRight", "Rotate 90° right"),
        },
        {
          mode: "flip-h" as const,
          testId: "v2-imgop-flip-h",
          icon: <FlipIcon fontSize="small" />,
          label: t("pdfTextEditorV2.toolbar.flipHorizontal", "Flip horizontal"),
        },
        {
          mode: "flip-v" as const,
          testId: "v2-imgop-flip-v",
          icon: (
            <FlipIcon fontSize="small" style={{ transform: "rotate(90deg)" }} />
          ),
          label: t("pdfTextEditorV2.toolbar.flipVertical", "Flip vertical"),
        },
      ] as const,
    [t],
  );

  return (
    <Section testId="v2-imgop-menu">
      <SectionLabel>
        {t("pdfTextEditorV2.inspector.image", "Image")}
      </SectionLabel>
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
          leftSection={<ImageIcon fontSize="small" />}
          onClick={onReplaceImage}
          data-testid="v2-imgop-replace"
        >
          {t(
            "pdfTextEditorV2.toolbar.replaceImage",
            "Replace, keeping placement",
          )}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          accent="neutral"
          fullWidth
          justify="start"
          leftSection={<OpenInNewIcon fontSize="small" />}
          onClick={onEditImageExternally}
          disabled={!externalEditSupported}
          data-testid="v2-imgop-edit-externally"
        >
          {t(
            "pdfTextEditorV2.toolbar.editImageExternally",
            "Edit in another app",
          )}
        </Button>
      </Stack>
    </Section>
  );
}
