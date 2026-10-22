import { Stack, Text, Textarea } from "@mantine/core";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Section,
  SectionLabel,
} from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import type { ImageAccessibility } from "@editor/tools/pdfTextEditor/util/imageAccessibility";

/** The selected image's description, or why it cannot have one. */
export function ImageAccessibilitySection({
  accessibility,
  onSetDescription,
}: {
  accessibility: ImageAccessibility;
  onSetDescription: (text: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Section testId="pdf-editor-image-accessibility">
      <SectionLabel>
        {t("pdfTextEditor.inspector.accessibility.heading", "Accessibility")}
      </SectionLabel>
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
            {accessibility.description
              ? t(
                  "pdfTextEditor.inspector.accessibility.described",
                  "Screen readers read this description in place of the image.",
                )
              : t(
                  "pdfTextEditor.inspector.accessibility.needsDescription",
                  "Without a description, screen readers can only say there is an image here.",
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
    </Section>
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
