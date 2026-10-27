import { Stack, Text, Textarea } from "@mantine/core";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { Button } from "@editor/ui/Button";
import { Checkbox } from "@editor/ui/Checkbox";
import { Icon } from "@editor/ui/Icon";
import {
  Section,
  SectionLabel,
} from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import {
  attentionFor,
  isActionable,
  type ImageAccessibility,
  type ImageReview,
} from "@editor/tools/pdfTextEditor/util/imageAccessibility";

/**
 * The selected image's description or decorative mark, or why it cannot have
 * either, and a way on to the next image needing attention. `review` counts
 * this image too.
 */
export function ImageAccessibilitySection({
  accessibility,
  onSetDescription,
  onSetDecorative,
  review,
  onNext,
}: {
  accessibility: ImageAccessibility;
  onSetDescription: (text: string) => void;
  onSetDecorative: (decorative: boolean) => void;
  review: ImageReview;
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
                label={t(
                  "pdfTextEditor.inspector.accessibility.description",
                  "Image description",
                )}
                value={accessibility.description ?? ""}
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
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            fullWidth
            justify="start"
            leftSection={<Icon name="arrow-right" size={20} />}
            onClick={onNext}
            data-testid="pdf-editor-image-description-next"
          >
            {t("pdfTextEditor.inspector.accessibility.nextImage", "Next image")}
          </Button>
        )}
      </Stack>
    </Section>
  );
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
