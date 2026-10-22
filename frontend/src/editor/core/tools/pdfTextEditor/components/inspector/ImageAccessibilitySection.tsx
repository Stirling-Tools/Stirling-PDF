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
  const needsThis =
    accessibility.kind === "describable" && !accessibility.description?.trim();
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
        {accessibility.kind === "describable" ? (
          <Stack gap={4}>
            <Textarea
              label={t(
                "pdfTextEditor.inspector.accessibility.description",
                "Description",
              )}
              placeholder={t(
                "pdfTextEditor.inspector.accessibility.descriptionPlaceholder",
                "Describe what the image shows",
              )}
              value={accessibility.description ?? ""}
              onChange={(e) => onSetDescription(e.currentTarget.value)}
              autosize
              minRows={2}
              maxRows={6}
              size="xs"
              data-testid="pdf-editor-image-description"
            />
            <Text size="xs" c="dimmed">
              {needsThis
                ? t(
                    "pdfTextEditor.inspector.accessibility.needsDescription",
                    "Without a description, screen readers can only say there is an image here.",
                  )
                : t(
                    "pdfTextEditor.inspector.accessibility.described",
                    "Screen readers read this description in place of the image.",
                  )}
            </Text>
          </Stack>
        ) : (
          <Text
            size="xs"
            c="dimmed"
            data-testid="pdf-editor-image-accessibility-status"
          >
            {statusMessage(t, accessibility)}
          </Text>
        )}
        {accessibility.kind !== "blocked" && (
          <DecorativeToggle
            accessibility={accessibility}
            onSetDecorative={onSetDecorative}
          />
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
            {t(
              "pdfTextEditor.inspector.accessibility.nextImage",
              "Next image to review",
            )}
          </Button>
        )}
      </Stack>
    </Section>
  );
}

function DecorativeToggle({
  accessibility,
  onSetDecorative,
}: {
  accessibility: Exclude<ImageAccessibility, { kind: "blocked" }>;
  onSetDecorative: (decorative: boolean) => void;
}) {
  const { t } = useTranslation();
  const checked = accessibility.kind === "decorative";
  const blocked =
    accessibility.kind === "decorative"
      ? !accessibility.pending
      : !accessibility.canBeDecorative;
  return (
    <Checkbox
      label={t(
        "pdfTextEditor.inspector.accessibility.decorativeLabel",
        "Decorative",
      )}
      description={decorativeHint(t, checked, blocked)}
      checked={checked}
      disabled={blocked}
      onChange={(e) => onSetDecorative(e.currentTarget.checked)}
      data-testid="pdf-editor-image-decorative"
    />
  );
}

function decorativeHint(
  t: TFunction,
  checked: boolean,
  blocked: boolean,
): string {
  if (!blocked) {
    return t(
      "pdfTextEditor.inspector.accessibility.decorativeHint",
      "For borders, backgrounds and other images that carry no information.",
    );
  }
  if (checked) {
    return t(
      "pdfTextEditor.inspector.accessibility.decorativeInFile",
      "This image is marked decorative in the file.",
    );
  }
  return t(
    "pdfTextEditor.inspector.accessibility.mixedContent",
    "This figure includes other content, so it can't be marked decorative here.",
  );
}

function statusMessage(
  t: TFunction,
  accessibility: Exclude<ImageAccessibility, { kind: "describable" }>,
): string {
  if (accessibility.kind === "decorative") {
    return t(
      "pdfTextEditor.inspector.accessibility.decorative",
      "Marked as decorative, so screen readers skip it.",
    );
  }
  switch (accessibility.blocker) {
    case "untagged":
      return accessibility.documentTagged
        ? t(
            "pdfTextEditor.inspector.accessibility.untaggedImage",
            "This image isn't in the document's tags, so it can't be described yet.",
          )
        : t(
            "pdfTextEditor.inspector.accessibility.untaggedDocument",
            "This document has no accessibility tags, so its images can't be described yet.",
          );
    case "not-figure":
      return t(
        "pdfTextEditor.inspector.accessibility.notFigure",
        "This image is tagged as part of the text around it, so it can't have its own description.",
      );
    case "encrypted":
      return t(
        "pdfTextEditor.inspector.accessibility.encrypted",
        "Descriptions can't be saved in an encrypted file.",
      );
    case "unreadable":
      return t(
        "pdfTextEditor.inspector.accessibility.unreadable",
        "This file's tags can't be edited here.",
      );
  }
}
