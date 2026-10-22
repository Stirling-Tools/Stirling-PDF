import { Stack, Text, Textarea } from "@mantine/core";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Checkbox } from "@editor/ui/Checkbox";
import { Icon } from "@editor/ui/Icon";
import {
  Section,
  SectionLabel,
} from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import {
  attentionFor,
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
    (attentionFor(accessibility) ? 1 : 0);
  return (
    <Section testId="pdf-editor-image-accessibility">
      <SectionLabel>
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
              <Textarea
                label={t(
                  "pdfTextEditor.inspector.accessibility.description",
                  "Description",
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
            <Checkbox
              label={t(
                "pdfTextEditor.inspector.accessibility.decorativeLabel",
                "Decorative",
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
