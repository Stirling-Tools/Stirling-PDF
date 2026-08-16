import React, { useCallback, useState } from "react";
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
 *
 * Folded away by default. Fourteen tick boxes are some 300px of a panel that already
 * runs past the bottom of the window, and they are an advanced choice: leave them
 * alone and the backend draws the fields it always has. The toggle says what the
 * setting currently is, so folding it hides the detail without hiding the state.
 */
const SignatureAttributePicker: React.FC<SignatureAttributePickerProps> = ({
  selected,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

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

  const summary =
    selected.length > 0
      ? t("certSign.attributes.summaryCount", {
          defaultValue: "{{n}} chosen",
          n: selected.length,
        })
      : t("certSign.attributes.summaryDefault", "the default fields");

  return (
    <Stack gap="xs">
      <Button
        variant="tertiary"
        accent="neutral"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={{ height: "auto", minHeight: "2.25rem" }}
      >
        {t("certSign.attributes.title", "Fields to show in the signature")} ·{" "}
        {summary} {open ? "▲" : "▼"}
      </Button>

      {/* Unmounted rather than merely collapsed: Mantine's Collapse keeps its children
          in the page, so fourteen invisible tick boxes would still take keyboard focus
          on the way to the run button. */}
      {open && (
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start" gap="xs">
            <Text size="xs" c="dimmed">
              {t(
                "certSign.attributes.hint",
                "Fields your certificate does not contain are skipped automatically.",
              )}
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
                label={t(
                  CERTIFICATE_ATTRIBUTE_LABEL_KEYS[attribute],
                  attribute,
                )}
              />
            ))}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
};

export default SignatureAttributePicker;
