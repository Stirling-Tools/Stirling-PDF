import { Group, Radio, ScrollArea, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PrivateContent } from "@editor/components/shared/PrivateContent";
import { Icon } from "@editor/ui/Icon";
import type { EmptySignatureField } from "@editor/services/signatureFieldLayout";
import "@editor/components/shared/signatureFields/SignatureChoiceCard.css";

const SCROLL_AFTER = 4;
const CUSTOM = "custom";
const FIELD_PREFIX = "field:";

export interface SignatureFieldListProps {
  title: string;
  fields: EmptySignatureField[];
  /** The chosen field's name, or null when the custom position is chosen. */
  selected: string | null;
  onChange: (fieldName: string | null) => void;
  /** Adds a "Custom position" choice pinned under the fields; omit it to offer fields only. */
  allowCustomPosition?: boolean;
  disabled?: boolean;
}

/**
 * The empty signature fields of a document as one choice: each field's name and page, scrolling
 * past four, with an optional custom position pinned underneath so it stays in view.
 */
export function SignatureFieldList({
  title,
  fields,
  selected,
  onChange,
  allowCustomPosition = false,
  disabled = false,
}: SignatureFieldListProps) {
  const { t } = useTranslation();

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        {title}
      </Text>
      <Radio.Group
        value={selected === null ? CUSTOM : `${FIELD_PREFIX}${selected}`}
        onChange={(value) =>
          onChange(value === CUSTOM ? null : value.slice(FIELD_PREFIX.length))
        }
        aria-label={title}
      >
        <Stack gap={4}>
          <ScrollArea.Autosize
            mah={fields.length > SCROLL_AFTER ? 230 : undefined}
            offsetScrollbars="y"
            scrollbarSize={6}
          >
            <Stack gap={4}>
              {fields.map((field) => (
                <Radio.Card
                  key={field.name}
                  value={`${FIELD_PREFIX}${field.name}`}
                  className="signature-choice-card"
                  disabled={disabled}
                >
                  <Stack gap={0}>
                    <Text className="signature-choice-card-name">
                      <PrivateContent>{field.name}</PrivateContent>
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t("signatureFields.page", "Page {{page}}", {
                        page: field.pageIndex + 1,
                      })}
                    </Text>
                  </Stack>
                </Radio.Card>
              ))}
            </Stack>
          </ScrollArea.Autosize>
          {allowCustomPosition && (
            <Radio.Card
              value={CUSTOM}
              className="signature-choice-card signature-choice-card--custom"
              disabled={disabled}
            >
              <Group gap={6} wrap="nowrap">
                <Icon name="locate-fixed" size={14} />
                <Text className="signature-choice-card-name">
                  {t("signatureFields.customPosition", "Custom position")}
                </Text>
              </Group>
            </Radio.Card>
          )}
        </Stack>
      </Radio.Group>
    </Stack>
  );
}
