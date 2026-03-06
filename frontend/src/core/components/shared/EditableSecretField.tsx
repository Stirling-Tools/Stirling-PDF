import { useState, useRef, useEffect } from 'react';
import { PasswordInput, Group, ActionIcon, Tooltip, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';

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
  placeholder = 'Enter value',
  disabled = false,
  error,
}: EditableSecretFieldProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isMasked = value === '********';

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleEdit = () => {
    setTempValue('');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setTempValue('');
    setIsEditing(false);
  };

  const handleSave = () => {
    if (tempValue.trim() !== '') {
      onChange(tempValue);
    }
    setTempValue('');
    setIsEditing(false);
  };

  return (
    <div>
      {label && <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: '0.875rem' }}>{label}</label>}
      {description && <p style={{ margin: '4px 0 12px 0', fontSize: '0.75rem', color: '#666' }}>{description}</p>}

      {isMasked && !isEditing ? (
        // Masked value from backend: show display + Edit button
        <Group gap="xs" align="flex-end">
          <TextInput
            value="••••••••"
            disabled
            style={{ flex: 1 }}
            readOnly
          />
          <Tooltip label={t('editSecret')} withArrow>
            <ActionIcon
              variant="light"
              onClick={handleEdit}
              disabled={disabled}
              title="Edit"
              aria-label="Edit secret value"
            >
              <LocalIcon icon="edit" width="1rem" height="1rem" />
            </ActionIcon>
          </Tooltip>
        </Group>
      ) : isEditing ? (
        // Edit mode: normal password input
        <PasswordInput
          ref={inputRef}
          value={tempValue}
          onChange={(e) => setTempValue(e.currentTarget.value)}
          placeholder={placeholder}
          disabled={disabled}
          error={error}
          autoComplete="new-password"
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCancel();
          }}
        />
      ) : (
        // Normal password input: empty or user typing
        <PasswordInput
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder={placeholder}
          disabled={disabled}
          error={error}
          autoComplete="new-password"
        />
      )}
    </div>
  );
}
