import React, { useCallback } from "react";
import { Checkbox, Stack, Text, Group } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import {
  CERTIFICATE_ATTRIBUTES,
  CERTIFICATE_ATTRIBUTE_LABEL_KEYS,
  DEFAULT_VISIBLE_ATTRIBUTES,
  type CertificateAttribute,
} from "@app/constants/certSignConstants";

interface SignatureAttributePickerProps {
  /** Fields currently ticked, in the order they will be drawn. */
  selected: CertificateAttribute[];
  onChange: (selected: CertificateAttribute[]) => void;
  disabled?: boolean;
}

/**
 * Lets the user choose which certificate fields appear inside the signature box.
 *
 * Every field the backend understands is offered rather than only those the chosen
 * certificate carries: the keystore is not read until signing, so the tool cannot
 * know in advance what is in it. Fields the certificate lacks are skipped when the
 * signature is drawn, so ticking one that turns out to be absent costs nothing.
 */
const SignatureAttributePicker: React.FC<SignatureAttributePickerProps> = ({
  selected,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation();

  const toggle = useCallback(
    (attribute: CertificateAttribute, checked: boolean) => {
      if (checked) {
        // Append rather than insert: the list order is the drawing order, so a field
        // the user just ticked belongs at the end of what they have built up.
        onChange([...selected, attribute]);
      } else {
        onChange(selected.filter((a) => a !== attribute));
      }
    },
    [selected, onChange],
  );

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500}>
          {t("certSign.attributes.title", "Fields to show in the signature")}
        </Text>
        <Button
          variant="tertiary"
          accent="neutral"
          disabled={disabled}
          onClick={() => onChange([...DEFAULT_VISIBLE_ATTRIBUTES])}
        >
          {t("certSign.attributes.reset", "Reset")}
        </Button>
      </Group>

      <Text size="xs" c="dimmed">
        {t(
          "certSign.attributes.hint",
          "Fields your certificate does not contain are skipped automatically.",
        )}
      </Text>

      <Stack gap={4}>
        {CERTIFICATE_ATTRIBUTES.map((attribute) => (
          <Checkbox
            key={attribute}
            size="xs"
            disabled={disabled}
            checked={selected.includes(attribute)}
            onChange={(event) =>
              toggle(attribute, event.currentTarget.checked)
            }
            label={t(CERTIFICATE_ATTRIBUTE_LABEL_KEYS[attribute], attribute)}
          />
        ))}
      </Stack>
    </Stack>
  );
};

export default SignatureAttributePicker;
