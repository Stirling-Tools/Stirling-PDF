import { useMemo } from "react";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import { Group, Stack, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import {
  Field,
  PointsInput,
  lengthUnitFor,
  Section,
  SectionLabel,
} from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import type { SelectionGeometry } from "@editor/tools/pdfTextEditor/hooks/useSelectionGeometry";
import type { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import { modShortcut } from "@editor/utils/hotkeys";
import { ACCESSIBILITY_EDITING } from "@editor/constants/featureFlags";
import { FormFieldAccessibilitySection } from "@editor/tools/pdfTextEditor/components/inspector/FormFieldAccessibilitySection";
import { ImageAccessibilitySection } from "@editor/tools/pdfTextEditor/components/inspector/ImageAccessibilitySection";
import { TextAccessibilitySection } from "@editor/tools/pdfTextEditor/components/inspector/TextAccessibilitySection";
import { FormatGroup } from "@editor/tools/pdfTextEditor/components/toolbar/FormatGroup";
import { ScanFontMatchRow } from "@editor/tools/pdfTextEditor/components/inspector/ScanFontMatchModal";
import type { ScanFontMatch } from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";

export type InspectorController = ReturnType<typeof useToolbarController>;

interface Props {
  controller: InspectorController;
  selection: SelectionState;
  geometry: SelectionGeometry;
  /** Font status for the selected runs, e.g. "Embedded · full alphabet". */
  fontNote: string | null;
  scanFontMatch?: ScanFontMatch | null;
  showFormatting?: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
}

/**
 * Properties of whatever is selected right now.
 *
 * Character formatting moves here only when the canvas toolbar is too narrow
 * for it; the arrange/lock/delete verbs stay in the toolbar.
 */
export function SelectionInspector({
  controller,
  selection,
  geometry,
  fontNote,
  scanFontMatch,
  showFormatting = false,
  canGroup,
  canUngroup,
  onGroup,
  onUngroup,
}: Props) {
  const runCount = selection.runIds.length;
  const imageCount = selection.imageIds.length;
  const shapeCount = selection.shapeIds.length;
  const { hasRunSelection, hasImageSelection } = controller;

  return (
    <Stack gap={0} data-testid="pdf-editor-selection-inspector">
      <SelectionHeader
        runCount={runCount}
        imageCount={imageCount}
        shapeCount={shapeCount}
        formField={selection.formFieldId !== null}
        fontNote={hasRunSelection ? fontNote : null}
      />
      {scanFontMatch?.canShow && <ScanFontMatchRow match={scanFontMatch} />}
      {hasRunSelection && showFormatting && (
        <TextFormatSection controller={controller} />
      )}
      {runCount + imageCount > 0 && (
        <GeometrySection geometry={geometry} isImage={!hasRunSelection} />
      )}
      {hasRunSelection && (
        <ParagraphSection
          canGroup={canGroup}
          canUngroup={canUngroup}
          onGroup={onGroup}
          onUngroup={onUngroup}
        />
      )}
      {hasImageSelection && <ImageSection controller={controller} />}
      {ACCESSIBILITY_EDITING &&
        (controller.textTag || controller.textLanguage) && (
          <TextAccessibilitySection
            tag={controller.textTag}
            onSetTag={controller.onSetTextTag}
            inner={controller.innerTextTags}
            language={controller.textLanguage}
            otherPages={controller.textOtherPages}
            description={controller.textDescription}
            untaggedLinks={controller.textUntaggedLinks}
            review={controller.accessibilityReview}
            onNext={controller.onSelectNextToReview}
          />
        )}
      {ACCESSIBILITY_EDITING && controller.imageAccessibility && (
        <ImageAccessibilitySection
          accessibility={controller.imageAccessibility}
          onSetDescription={controller.onSetImageDescription}
          onSetType={controller.onSetImageType}
          onSetDecorative={controller.onSetImageDecorative}
          review={controller.accessibilityReview}
          onNext={controller.onSelectNextToReview}
        />
      )}
      {ACCESSIBILITY_EDITING && controller.formFieldAccessibility && (
        <FormFieldAccessibilitySection
          accessibility={controller.formFieldAccessibility}
          onTag={controller.onTagFormField}
          onSetDescription={controller.onSetFormFieldDescription}
        />
      )}
    </Stack>
  );
}

function TextFormatSection({
  controller,
}: {
  controller: InspectorController;
}) {
  const { t } = useTranslation();
  return (
    <Section testId="pdf-editor-format-section">
      <SectionLabel>{t("pdfTextEditor.inspector.text", "Text")}</SectionLabel>
      <Group gap="xs" wrap="wrap">
        <FormatGroup controller={controller} />
      </Group>
    </Section>
  );
}

/** Names what is selected, and how its font will treat new characters. */
function SelectionHeader({
  runCount,
  imageCount,
  shapeCount,
  formField,
  fontNote,
}: {
  runCount: number;
  imageCount: number;
  shapeCount: number;
  /** A form field is only ever selected alone. */
  formField: boolean;
  fontNote: string | null;
}) {
  const { t } = useTranslation();
  const kinds = [runCount, imageCount, shapeCount].filter((n) => n > 0).length;
  let title: string;
  if (formField) {
    title = t("pdfTextEditor.inspector.formField", "Form field");
  } else if (kinds > 1) {
    title = t("pdfTextEditor.inspector.mixed", "{{count}} objects", {
      count: runCount + imageCount + shapeCount,
    });
  } else if (shapeCount > 0) {
    title =
      shapeCount === 1
        ? t("pdfTextEditor.inspector.oneShape", "Shape")
        : t("pdfTextEditor.inspector.manyShapes", "{{count}} shapes", {
            count: shapeCount,
          });
  } else if (runCount > 0) {
    title =
      runCount === 1
        ? t("pdfTextEditor.inspector.oneText", "Text")
        : t("pdfTextEditor.inspector.manyText", "Text · {{count}} boxes", {
            count: runCount,
          });
  } else {
    title =
      imageCount === 1
        ? t("pdfTextEditor.inspector.oneImage", "Image")
        : t("pdfTextEditor.inspector.manyImages", "{{count}} images", {
            count: imageCount,
          });
  }
  return (
    <Section tinted first>
      {/* Doubles as the old sidebar's selection readout, moved from the very
          bottom of the panel to the top where the user is already looking. */}
      <Text size="sm" fw={600} data-testid="pdf-editor-selection-count">
        {title}
      </Text>
      {fontNote && (
        <Text
          size="xs"
          c="dimmed"
          mt={4}
          data-testid="pdf-editor-inspector-font-note"
        >
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
                    "Join the selected text into one paragraph ({{shortcut}})",
                  shortcut: modShortcut("M"),
                })
              : t(
                  "pdfTextEditor.sidebar.groupTooltipDisabled",
                  "Select two or more pieces of text to join",
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
            {t("pdfTextEditor.sidebar.group", "Join paragraph")}
          </Button>
        </Tooltip>
        <Tooltip
          label={
            canUngroup
              ? t(
                  "pdfTextEditor.sidebar.ungroupTooltip",
                  "Split this paragraph into separate lines",
                )
              : t(
                  "pdfTextEditor.sidebar.ungroupTooltipDisabled",
                  "Select a paragraph of several lines to split",
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
            {t("pdfTextEditor.sidebar.ungroup", "Split into lines")}
          </Button>
        </Tooltip>
      </Group>
    </Section>
  );
}

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
  const { bounds, display, setX, setY, setWidth, setHeight } = geometry.single;
  const unit = lengthUnitFor(navigator.language);
  const transform = DisplayTransform.fromData(display);
  const corners = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ].map(([x, y]) => transform.apply(x, y));
  const left = Math.min(...corners.map((c) => c.x));
  const top = transform.displayHeight - Math.max(...corners.map((c) => c.y));
  const moveTo = (nextLeft: number, nextTop: number) => {
    const from = transform.invert(left, transform.displayHeight - top);
    const to = transform.invert(nextLeft, transform.displayHeight - nextTop);
    if (Math.abs(to.x - from.x) > 1e-3) setX(bounds.x + to.x - from.x);
    if (Math.abs(to.y - from.y) > 1e-3) setY(bounds.y + to.y - from.y);
  };
  return (
    <Section testId="pdf-editor-geometry-section">
      <SectionLabel>
        {t("pdfTextEditor.inspector.geometry", "Position & size")}
      </SectionLabel>
      <Stack gap="xs">
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <Field label={t("pdfTextEditor.inspector.x", "X")}>
            <PointsInput
              unit={unit}
              value={left}
              onCommit={(next) => moveTo(next, top)}
              label={t("pdfTextEditor.inspector.x", "X")}
              testId="pdf-editor-pos-x"
            />
          </Field>
          <Field label={t("pdfTextEditor.inspector.y", "Y")}>
            <PointsInput
              unit={unit}
              value={top}
              onCommit={(next) => moveTo(left, next)}
              label={t("pdfTextEditor.inspector.y", "Y")}
              testId="pdf-editor-pos-y"
            />
          </Field>
        </Group>
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <Field
            label={t("pdfTextEditor.inspector.width", "Width")}
            hint={
              isImage || !setWidth
                ? undefined
                : t(
                    "pdfTextEditor.inspector.widthHint",
                    "Text re-wraps to fit the width.",
                  )
            }
          >
            <PointsInput
              unit={unit}
              value={bounds.width}
              onCommit={setWidth ?? (() => undefined)}
              min={1}
              disabled={!setWidth}
              label={t("pdfTextEditor.inspector.width", "Width")}
              testId="pdf-editor-size-w"
            />
          </Field>
          <Field
            label={t("pdfTextEditor.inspector.height", "Height")}
            hint={
              setHeight
                ? undefined
                : t(
                    "pdfTextEditor.inspector.heightHint",
                    "A text box's height follows its type size and line count.",
                  )
            }
          >
            <PointsInput
              unit={unit}
              value={bounds.height}
              onCommit={setHeight ?? (() => undefined)}
              min={1}
              disabled={!setHeight}
              label={t("pdfTextEditor.inspector.height", "Height")}
              testId="pdf-editor-size-h"
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
          testId: "pdf-editor-imgop-rotate-ccw",
          icon: <Icon name="rotate-ccw" size={20} />,
          label: t("pdfTextEditor.toolbar.rotateLeft", "Rotate 90° left"),
        },
        {
          mode: "rotate-cw" as const,
          testId: "pdf-editor-imgop-rotate-cw",
          icon: <Icon name="rotate-cw" size={20} />,
          label: t("pdfTextEditor.toolbar.rotateRight", "Rotate 90° right"),
        },
        {
          mode: "flip-h" as const,
          testId: "pdf-editor-imgop-flip-h",
          icon: <Icon name="flip-horizontal-2" size={20} />,
          label: t("pdfTextEditor.toolbar.flipHorizontal", "Flip horizontal"),
        },
        {
          mode: "flip-v" as const,
          testId: "pdf-editor-imgop-flip-v",
          icon: (
            <Icon
              name="flip-horizontal-2"
              size={20}
              style={{ transform: "rotate(90deg)" }}
            />
          ),
          label: t("pdfTextEditor.toolbar.flipVertical", "Flip vertical"),
        },
      ] as const,
    [t],
  );

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
