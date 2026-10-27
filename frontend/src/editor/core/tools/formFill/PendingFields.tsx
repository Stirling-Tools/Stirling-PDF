/** Shared pending-field editor so newly drawn fields remain editable in either design tab. */
import { useEffect, useRef, useState } from "react";
import { Stack, Text, Group, Collapse, Paper, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import { useViewer } from "@editor/contexts/ViewerContext";
import {
  pendingSelectionName,
  pendingIdFrom,
} from "@editor/tools/formFill/pendingSelection";
import { useFormFill } from "@editor/tools/formFill/FormFillContext";
import {
  FIELD_TYPE_ICON,
  FIELD_TYPE_COLOR,
} from "@editor/tools/formFill/fieldMeta";
import { FormFieldPropertyEditor } from "@editor/tools/formFill/FormFieldPropertyEditor";
import type { NewFieldDefinition } from "@editor/tools/formFill/types";
import styles from "@editor/tools/formFill/FormFill.module.css";

export function PendingFields() {
  const { t } = useTranslation();
  const {
    pendingFields,
    updatePendingField,
    removePendingField,
    selectedFieldName,
    setSelectedField,
  } = useFormFill();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { scrollActions } = useViewer();
  const goToPage = (pageIndex: number) =>
    scrollActions.scrollToPage(pageIndex + 1);

  // Auto-expand the property editor of a freshly-drawn field so its settings
  // (especially options for choice/radio) are visible immediately.
  const prevCountRef = useRef(0);
  const expandedRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingFields.length > prevCountRef.current) {
      setExpandedId(pendingFields[pendingFields.length - 1].id);
    }
    prevCountRef.current = pendingFields.length;
  }, [pendingFields]);

  // Clicking a box on the page should land you on its settings, not leave you hunting the list.
  useEffect(() => {
    const id = selectedFieldName ? pendingIdFrom(selectedFieldName) : null;
    if (id) setExpandedId(id);
  }, [selectedFieldName]);

  // Newly drawn fields land at the bottom while the panel stays at the top, so their settings
  // open somewhere the user cannot see.
  useEffect(() => {
    if (!expandedId) return;
    expandedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [expandedId]);

  return (
    <div className={styles.fieldListInner}>
      {pendingFields.length === 0 ? (
        <Text size="xs" c="dimmed" ta="center" py="md">
          {t("formFill.create.empty", "No fields drawn yet.")}
        </Text>
      ) : (
        <Stack gap={6}>
          {pendingFields.map((pf) => {
            const expanded = expandedId === pf.id;
            return (
              <Paper
                key={pf.id}
                withBorder
                p={6}
                radius="sm"
                ref={expanded ? expandedRowRef : undefined}
                data-testid={`form-pending-row-${pf.id}`}
                // The whole row opens its settings: hunting for the small pencil is a
                // needless step when the row is the thing you just clicked.
                onClick={() => setExpandedId(expanded ? null : pf.id)}
                style={{ cursor: "pointer" }}
              >
                <Group gap={6} wrap="nowrap" justify="space-between">
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <span
                      style={{
                        color: `var(--mantine-color-${FIELD_TYPE_COLOR[pf.type]}-6)`,
                        display: "flex",
                      }}
                    >
                      <Icon name={FIELD_TYPE_ICON[pf.type]} size={16} />
                    </span>
                    <Text size="xs" truncate>
                      {pf.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      p{pf.pageIndex + 1}
                    </Text>
                  </Group>
                  <Group gap={2} wrap="nowrap">
                    <Tooltip
                      label={t("formFill.create.goToField", "Go to this field")}
                      withArrow
                    >
                      <ActionIcon
                        size="sm"
                        variant="tertiary"
                        aria-label={t(
                          "formFill.create.goToField",
                          "Go to this field",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedField(pendingSelectionName(pf.id));
                          setExpandedId(pf.id);
                          goToPage(pf.pageIndex);
                        }}
                        data-testid={`form-pending-goto-${pf.id}`}
                      >
                        <Icon name="locate-fixed" size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip
                      label={t("formFill.create.removeField", "Remove field")}
                      withArrow
                    >
                      <ActionIcon
                        size="sm"
                        variant="tertiary"
                        accent="danger"
                        aria-label={t(
                          "formFill.create.removeField",
                          "Remove field",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          removePendingField(pf.id);
                        }}
                        data-testid={`form-pending-remove-${pf.id}`}
                      >
                        <Icon name="trash" size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
                <Collapse in={expanded}>
                  {/* The row toggles on click, so the settings must not bubble into it or
                        every field you touch closes the panel you are typing in. */}
                  <div
                    style={{ marginTop: 8 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <FormFieldPropertyEditor
                      value={pf}
                      onChange={(patch) =>
                        updatePendingField(
                          pf.id,
                          patch as Partial<NewFieldDefinition>,
                        )
                      }
                      showName
                    />
                  </div>
                </Collapse>
              </Paper>
            );
          })}
        </Stack>
      )}
    </div>
  );
}
