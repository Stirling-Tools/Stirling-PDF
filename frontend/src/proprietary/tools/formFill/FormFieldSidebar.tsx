/**
 * FormFieldSidebar — A right-side panel for viewing and filling form fields
 * when the dedicated formFill tool is NOT selected (normal viewer mode).
 *
 * Redesigned with:
 * - Consistent CSS module styling matching the main FormFill panel
 * - Shared FieldInput component (no duplication)
 * - Better visual hierarchy and spacing
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Text,
  ScrollArea,
  Badge,
  Tooltip,
  ActionIcon,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useFormFill } from '@proprietary/tools/formFill/FormFillContext';
import { FieldInput } from '@proprietary/tools/formFill/FieldInput';
import { FIELD_TYPE_ICON, FIELD_TYPE_COLOR } from '@proprietary/tools/formFill/fieldMeta';
import type { FormField } from '@proprietary/tools/formFill/types';
import CloseIcon from '@mui/icons-material/Close';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import styles from '@proprietary/tools/formFill/FormFill.module.css';

interface FormFieldSidebarProps {
  visible: boolean;
  onToggle: () => void;
}

export function FormFieldSidebar({
  visible,
  onToggle,
}: FormFieldSidebarProps) {
  useTranslation();
  const { state, setValue, setActiveField } = useFormFill();
  const { fields, activeFieldName, loading } = state;
  const activeFieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeFieldName && activeFieldRef.current) {
      activeFieldRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeFieldName]);

  const handleFieldClick = useCallback(
    (fieldName: string) => {
      setActiveField(fieldName);
    },
    [setActiveField]
  );

  const handleValueChange = useCallback(
    (fieldName: string, value: string) => {
      setValue(fieldName, value);
    },
    [setValue]
  );

  if (!visible) return null;

  const fieldsByPage = new Map<number, FormField[]>();
  for (const field of fields) {
    const pageIndex =
      field.widgets && field.widgets.length > 0 ? field.widgets[0].pageIndex : 0;
    if (!fieldsByPage.has(pageIndex)) {
      fieldsByPage.set(pageIndex, []);
    }
    fieldsByPage.get(pageIndex)!.push(field);
  }
  const sortedPages = Array.from(fieldsByPage.keys()).sort((a, b) => a - b);

  return (
    <Box
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '18.5rem',
        height: '100%',
        zIndex: 999,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-toolbar, var(--mantine-color-body))',
        borderLeft: '1px solid var(--border-subtle, var(--mantine-color-default-border))',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.625rem 0.75rem',
          borderBottom: '1px solid var(--border-subtle, var(--mantine-color-default-border))',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TextFieldsIcon sx={{ fontSize: 18, opacity: 0.7 }} />
          <Text fw={600} size="sm">
            Form Fields
          </Text>
          <Badge size="xs" variant="light" color="blue" radius="sm">
            {fields.length}
          </Badge>
        </div>
        <ActionIcon variant="subtle" size="sm" onClick={onToggle} aria-label="Close sidebar">
          <CloseIcon sx={{ fontSize: 16 }} />
        </ActionIcon>
      </div>

      {/* Content */}
      <ScrollArea style={{ flex: 1 }}>
        {loading && (
          <div className={styles.emptyState}>
            <Text size="sm" c="dimmed">
              Loading form fields...
            </Text>
          </div>
        )}

        {!loading && fields.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyStateText}>
              No form fields found in this PDF
            </span>
          </div>
        )}

        {!loading && fields.length > 0 && (
          <div className={styles.fieldListInner}>
            {sortedPages.map((pageIdx, i) => (
              <React.Fragment key={pageIdx}>
                <div
                  className={styles.pageDivider}
                  style={i === 0 ? { marginTop: 0 } : undefined}
                >
                  <Text className={styles.pageDividerLabel}>
                    Page {pageIdx + 1}
                  </Text>
                </div>

                {fieldsByPage.get(pageIdx)!.map((field) => {
                  const isActive = activeFieldName === field.name;

                  return (
                    <div
                      key={field.name}
                      ref={isActive ? activeFieldRef : undefined}
                      className={`${styles.fieldCard} ${
                        isActive ? styles.fieldCardActive : ''
                      }`}
                      onClick={() => handleFieldClick(field.name)}
                    >
                      <div className={styles.fieldHeader}>
                        <Tooltip label={field.type} withArrow position="left">
                          <span
                            className={styles.fieldTypeIcon}
                            style={{
                              color: `var(--mantine-color-${FIELD_TYPE_COLOR[field.type]}-6)`,
                              fontSize: '0.875rem',
                            }}
                          >
                            {FIELD_TYPE_ICON[field.type]}
                          </span>
                        </Tooltip>
                        <span className={styles.fieldName}>
                          {field.label || field.name}
                        </span>
                        {field.required && (
                          <span className={styles.fieldRequired}>req</span>
                        )}
                      </div>

                      {field.type !== 'button' && field.type !== 'signature' && (
                        <div
                          className={styles.fieldInputWrap}
                        >
                          <FieldInput
                            field={field}
                            onValueChange={handleValueChange}
                          />
                        </div>
                      )}

                      {field.tooltip && (
                        <div className={styles.fieldHint}>
                          {field.tooltip}
                        </div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        )}
      </ScrollArea>
    </Box>
  );
}

export default FormFieldSidebar;
