import { useId, useState, useRef, useEffect } from "react";
import { PasswordInput, Group, Tooltip, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import LocalIcon from "@app/components/shared/LocalIcon";

interface EditableSecretFieldProps {
  label?: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

/**
 * Component for editing sensitive fields (passwords, API keys, secrets).
 *
 * UX:
 * - Normal password input in all scenarios EXCEPT when value is masked (********)
 * - When backend returns masked value (********): Shows read-only display + Edit button
 * - Click Edit to change the masked value
 */
export default function EditableSecretField({
  label,
  description,
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
}: EditableSecretFieldProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("common.enterValue");
  const fieldId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isMasked = value === "********";

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleEdit = () => {
    setTempValue("");
    setIsEditing(true);
  };

  const handleCancel = () => {
    setTempValue("");
    setIsEditing(false);
  };

  const handleSave = () => {
    if (tempValue.trim() !== "") {
      onChange(tempValue);
    }
    setTempValue("");
    setIsEditing(false);
  };

  return (
    <div>
      {(label || description) && (
        <Group gap={4} mb={4} wrap="nowrap">
          {label && (
            <label
              htmlFor={fieldId}
              style={{ fontWeight: 500, fontSize: "0.875rem" }}
            >
              {label}
            </label>
          )}
          {description && <InfoTooltip label={description} />}
        </Group>
      )}

      {isMasked && !isEditing ? (
        // Masked value from backend: show display + Edit button
        <Group gap="xs" align="flex-end">
          <TextInput
            id={fieldId}
            value="••••••••"
            disabled
            style={{ flex: 1 }}
            readOnly
          />
          <Tooltip label={t("editSecret")} withArrow>
            <ActionIcon
              variant="secondary"
              onClick={handleEdit}
              disabled={disabled}
              title={t("editableSecretField.edit", "Edit")}
              aria-label={t(
                "editableSecretField.editSecretValue",
                "Edit secret value",
              )}
            >
              <LocalIcon icon="edit" width="1rem" height="1rem" />
            </ActionIcon>
          </Tooltip>
        </Group>
      ) : isEditing ? (
        // Edit mode: normal password input
        <PasswordInput
          id={fieldId}
          ref={inputRef}
          value={tempValue}
          onChange={(e) => setTempValue(e.currentTarget.value)}
          placeholder={resolvedPlaceholder}
          disabled={disabled}
          error={error}
          autoComplete="new-password"
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Escape") handleCancel();
          }}
        />
      ) : (
        // Normal password input: empty or user typing
        <PasswordInput
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder={resolvedPlaceholder}
          disabled={disabled}
          error={error}
          autoComplete="new-password"
        />
      )}
    </div>
  );
}
