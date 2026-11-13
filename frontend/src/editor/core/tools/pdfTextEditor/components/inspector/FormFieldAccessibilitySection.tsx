import { Stack, Text, Textarea } from "@mantine/core";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import {
  Section,
  SectionLabel,
  StatRow,
} from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import type {
  FormFieldAccessibility,
  FormFieldBlocker,
} from "@editor/tools/pdfTextEditor/util/formFieldAccessibility";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

/**
 * Whether the selected form field is tagged, with a way to tag it, and the
 * description its field is read by; or why neither can change.
 */
export function FormFieldAccessibilitySection({
  accessibility,
  onTag,
  onSetDescription,
}: {
  accessibility: FormFieldAccessibility;
  onTag: () => void;
  onSetDescription: (text: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Section testId="pdf-editor-form-field-accessibility">
      <SectionLabel>
        {t("pdfTextEditor.inspector.accessibility.heading", "Accessibility")}
      </SectionLabel>
      {accessibility.kind === "blocked" ? (
        <Text
          size="xs"
          c="dimmed"
          data-testid="pdf-editor-form-field-accessibility-status"
        >
          {blockedMessage(t, accessibility.blocker)}
        </Text>
      ) : (
        <Stack gap="xs">
          <StatRow
            label={t("pdfTextEditor.inspector.accessibility.tagLabel", "Tag")}
            value={
              <span data-testid="pdf-editor-form-field-tag">
                {accessibility.tagged
                  ? t(
                      "pdfTextEditor.inspector.accessibility.tagName.form",
                      "Form field",
                    )
                  : t(
                      "pdfTextEditor.inspector.accessibility.untaggedBadge",
                      "Not tagged",
                    )}
              </span>
            }
          />
          {!accessibility.tagged && (
            <Button
              size="sm"
              variant="secondary"
              accent="neutral"
              fullWidth
              justify="start"
              leftSection={<Icon name="form-input" size={20} />}
              onClick={onTag}
              data-testid="pdf-editor-tag-form-field"
            >
              {t(
                "pdfTextEditor.inspector.accessibility.tagFormField",
                "Tag form field",
              )}
            </Button>
          )}
          <Textarea
            label={t(
              "pdfTextEditor.inspector.accessibility.formFieldDescription",
              "Field description",
            )}
            value={accessibility.description ?? ""}
            className={privateContentClassName}
            onChange={(e) => onSetDescription(e.currentTarget.value)}
            autosize
            minRows={1}
            maxRows={4}
            size="xs"
            data-testid="pdf-editor-form-field-description"
          />
        </Stack>
      )}
    </Section>
  );
}

function blockedMessage(t: TFunction, blocker: FormFieldBlocker): string {
  switch (blocker) {
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
    case "unknown":
      return t(
        "pdfTextEditor.inspector.accessibility.cannotTagFormField",
        "This form field can't be tagged.",
      );
  }
}
