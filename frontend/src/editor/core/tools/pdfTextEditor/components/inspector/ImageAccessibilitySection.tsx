import { Stack, Text, Textarea } from "@mantine/core";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { Checkbox } from "@editor/ui/Checkbox";
import { Icon } from "@editor/ui/Icon";
import { Select } from "@editor/ui/Select";
import {
  Field,
  Section,
  SectionLabel,
} from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import {
  DESCRIBABLE_TYPES,
  type DescribableType,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import {
  attentionFor,
  isActionable,
  type ImageAccessibility,
} from "@editor/tools/pdfTextEditor/util/imageAccessibility";
import type { AccessibilityReview } from "@editor/tools/pdfTextEditor/util/accessibilityReview";
import { NextToReviewButton } from "@editor/tools/pdfTextEditor/components/inspector/NextToReviewButton";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

/**
 * The selected image's tag as a figure or formula and its description, or
 * its decorative mark, or why it cannot have any, and a way on to the next
 * image or text needing attention. `review` counts this image too.
 */
export function ImageAccessibilitySection({
  accessibility,
  onSetDescription,
  onSetType,
  onSetDecorative,
  review,
  onNext,
}: {
  accessibility: ImageAccessibility;
  onSetDescription: (text: string) => void;
  onSetType: (type: DescribableType) => void;
  onSetDecorative: (decorative: boolean) => void;
  review: AccessibilityReview;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const othersPending =
    review.needsDescription +
    review.untagged -
    (isActionable(attentionFor(accessibility)) ? 1 : 0);
  return (
    <Section testId="pdf-editor-image-accessibility">
      <SectionLabel info={<AccessibilityInfo />}>
        {t("pdfTextEditor.inspector.accessibility.heading", "Accessibility")}
      </SectionLabel>
      <Stack gap="xs">
        {accessibility.kind === "blocked" ? (
          <Text
            size="xs"
            c="dimmed"
            data-testid="pdf-editor-image-accessibility-status"
          >
            {blockedMessage(t, accessibility)}
          </Text>
        ) : (
          <>
            {accessibility.kind === "describable" && (
              <TypePicker type={accessibility.type} onSetType={onSetType} />
            )}
            <Checkbox
              label={t(
                "pdfTextEditor.inspector.accessibility.decorativeLabel",
                "Decorative image",
              )}
              description={
                accessibility.kind === "describable" &&
                !accessibility.canBeDecorative
                  ? t(
                      "pdfTextEditor.inspector.accessibility.mixedContent",
                      "Figure includes other content",
                    )
                  : undefined
              }
              checked={accessibility.kind === "decorative"}
              disabled={
                accessibility.kind === "decorative"
                  ? !accessibility.canUndecorate
                  : !accessibility.canBeDecorative
              }
              onChange={(e) => onSetDecorative(e.currentTarget.checked)}
              data-testid="pdf-editor-image-decorative"
            />
            {accessibility.kind === "describable" && (
              <Textarea
                label={
                  accessibility.type === "Formula"
                    ? t(
                        "pdfTextEditor.inspector.accessibility.formulaDescription",
                        "Formula description",
                      )
                    : t(
                        "pdfTextEditor.inspector.accessibility.description",
                        "Image description",
                      )
                }
                value={accessibility.description ?? ""}
                className={privateContentClassName}
                onChange={(e) => onSetDescription(e.currentTarget.value)}
                autosize
                minRows={2}
                maxRows={6}
                size="xs"
                data-testid="pdf-editor-image-description"
              />
            )}
          </>
        )}
        {othersPending > 0 && (
          <NextToReviewButton
            onClick={onNext}
            testId="pdf-editor-image-description-next"
          />
        )}
      </Stack>
    </Section>
  );
}

/**
 * Whether the image is a figure or a formula; an untagged one is given an
 * element of the type picked.
 */
function TypePicker({
  type,
  onSetType,
}: {
  type: DescribableType | null;
  onSetType: (type: DescribableType) => void;
}) {
  const { t } = useTranslation();
  const label = t("pdfTextEditor.inspector.accessibility.tagLabel", "Tag");
  return (
    <Field label={label}>
      <div data-testid="pdf-editor-image-tag-picker">
        <Select
          inputSize="sm"
          options={DESCRIBABLE_TYPES.map((option) => ({
            value: option,
            label: typeName(t, option),
          }))}
          value={type}
          placeholder={t(
            "pdfTextEditor.inspector.accessibility.untaggedBadge",
            "Not tagged",
          )}
          onChange={(value) => {
            const picked = DESCRIBABLE_TYPES.find((option) => option === value);
            if (picked) onSetType(picked);
          }}
          aria-label={label}
        />
      </div>
    </Field>
  );
}

function typeName(t: TFunction, type: DescribableType): string {
  return type === "Formula"
    ? t("pdfTextEditor.inspector.accessibility.tagName.formula", "Formula")
    : t("pdfTextEditor.inspector.accessibility.tagName.figure", "Figure");
}

function blockedMessage(
  t: TFunction,
  accessibility: Extract<ImageAccessibility, { kind: "blocked" }>,
): string {
  switch (accessibility.blocker) {
    case "untagged":
      return accessibility.documentTagged
        ? t(
            "pdfTextEditor.inspector.accessibility.untaggedImage",
            "Can't be tagged here",
          )
        : t(
            "pdfTextEditor.inspector.accessibility.untaggedDocument",
            "Document has no tags",
          );
    case "not-figure":
      return t(
        "pdfTextEditor.inspector.accessibility.notFigure",
        "Tagged as part of the text",
      );
    case "encrypted":
      return t(
        "pdfTextEditor.inspector.accessibility.encrypted",
        "Tags can't be edited in an encrypted file",
      );
    case "unreadable":
      return t(
        "pdfTextEditor.inspector.accessibility.unreadable",
        "This file's tags can't be edited",
      );
  }
}

/** What the section's controls are for, behind the (i) tool steps use. */
function AccessibilityInfo() {
  const { t } = useTranslation();
  return (
    <Tooltip
      sidebarTooltip
      pinOnClick
      header={{
        title: t(
          "pdfTextEditor.inspector.accessibility.heading",
          "Accessibility",
        ),
      }}
      tips={[
        {
          title: t(
            "pdfTextEditor.inspector.accessibility.decorativeLabel",
            "Decorative image",
          ),
          description: t(
            "pdfTextEditor.inspector.accessibility.decorativeInfo",
            "Screen readers skip decorative images. Use it for borders, backgrounds and other images that carry no information.",
          ),
        },
        {
          title: t(
            "pdfTextEditor.inspector.accessibility.description",
            "Image description",
          ),
          description: t(
            "pdfTextEditor.inspector.accessibility.descriptionInfo",
            "Screen readers read this out in place of the image.",
          ),
        },
      ]}
    >
      <span
        style={{ display: "flex", color: "var(--icon-files-color)" }}
        data-testid="pdf-editor-image-accessibility-info"
      >
        <Icon name="info" size={14} />
      </span>
    </Tooltip>
  );
}
