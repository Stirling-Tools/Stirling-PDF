/**
 * FormFieldPropertyEditor — shared property form used by both the create and
 * modify panels. It edits the subset of attributes common to new and existing
 * fields and reports changes as partial patches via onChange.
 */
import React from "react";
import {
  Stack,
  TextInput,
  NumberInput,
  Select,
  Switch,
  Group,
  ActionIcon,
  Button,
  Text,
  Alert,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

export interface EditableFieldProps {
  name?: string;
  label?: string;
  type: string;
  defaultValue?: string;
  tooltip?: string;
  fontSize?: number;
  required?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  multiSelect?: boolean;
  options?: string[];
  maxLength?: number;
  buttonAction?: string;
}

interface FormFieldPropertyEditorProps {
  value: EditableFieldProps;
  onChange: (patch: Partial<EditableFieldProps>) => void;
  /** Show the field-name input (create mode). */
  showName?: boolean;
  /** Allow changing the field type (modify mode). */
  allowTypeChange?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  text: "Text",
  checkbox: "Checkbox",
  combobox: "Dropdown",
  listbox: "List box",
  radio: "Radio group",
  button: "Button",
  signature: "Signature",
};

// Type-change is only safe between the "simple" single-widget types; retyping
// into radio/button/signature needs dedicated creation, so it's create-only.
const TYPE_CHANGE_OPTIONS = ["text", "checkbox", "combobox", "listbox"];

/** Split a stored buttonAction string into a kind + optional url. */
function parseButtonAction(action: string | undefined): {
  kind: string;
  url: string;
} {
  if (!action) return { kind: "none", url: "" };
  if (action === "reset") return { kind: "reset", url: "" };
  if (action === "print") return { kind: "print", url: "" };
  if (action.startsWith("uri:")) return { kind: "uri", url: action.slice(4) };
  if (action.startsWith("submit:"))
    return { kind: "submit", url: action.slice(7) };
  return { kind: "none", url: "" };
}

function buildButtonAction(kind: string, url: string): string {
  switch (kind) {
    case "reset":
      return "reset";
    case "print":
      return "print";
    case "uri":
      return `uri:${url}`;
    case "submit":
      return `submit:${url}`;
    default:
      return "";
  }
}

export function FormFieldPropertyEditor({
  value,
  onChange,
  showName = true,
  allowTypeChange = false,
}: FormFieldPropertyEditorProps) {
  const { t } = useTranslation();
  const hasOptions =
    value.type === "combobox" ||
    value.type === "listbox" ||
    value.type === "radio";
  const isVariableText =
    value.type === "text" ||
    value.type === "combobox" ||
    value.type === "listbox";
  const isText = value.type === "text";
  const isButton = value.type === "button";
  const isSignature = value.type === "signature";
  const isFillable = !isButton && !isSignature;
  const canRetype = TYPE_CHANGE_OPTIONS.includes(value.type);

  const updateOption = (index: number, next: string) => {
    const options = [...(value.options ?? [])];
    options[index] = next;
    onChange({ options });
  };
  const addOption = () => onChange({ options: [...(value.options ?? []), ""] });
  const removeOption = (index: number) =>
    onChange({ options: (value.options ?? []).filter((_, i) => i !== index) });

  const action = parseButtonAction(value.buttonAction);

  return (
    <Stack gap="xs">
      {isSignature && (
        <Alert
          color="blue"
          variant="light"
          p="xs"
          radius="sm"
          icon={<InfoOutlinedIcon sx={{ fontSize: 16 }} />}
        >
          <Text size="xs">
            {t(
              "formFill.editor.signatureNote",
              "Placeholder only - you don't sign here. It marks where a signature belongs so a PDF signer (Adobe Acrobat, a signing service, etc.) places the signature in this spot when the document is signed.",
            )}
          </Text>
        </Alert>
      )}

      {showName && (
        <TextInput
          size="xs"
          label={t("formFill.editor.name", "Field name")}
          value={value.name ?? ""}
          onChange={(e) => onChange({ name: e.currentTarget.value })}
        />
      )}

      <TextInput
        size="xs"
        label={
          isButton
            ? t("formFill.editor.caption", "Button caption")
            : t("formFill.editor.label", "Label")
        }
        value={value.label ?? ""}
        onChange={(e) => onChange({ label: e.currentTarget.value })}
      />

      {allowTypeChange && (
        <Select
          size="xs"
          label={t("formFill.editor.type", "Type")}
          value={canRetype ? value.type : null}
          data={TYPE_CHANGE_OPTIONS.map((tp) => ({
            value: tp,
            label: TYPE_LABEL[tp],
          }))}
          disabled={!canRetype}
          placeholder={canRetype ? undefined : TYPE_LABEL[value.type]}
          onChange={(v) => v && onChange({ type: v })}
          comboboxProps={{ withinPortal: true }}
        />
      )}

      {hasOptions && (
        <Stack gap={4}>
          <Text size="xs" fw={600}>
            {t("formFill.editor.options", "Options")}
          </Text>
          {(value.options ?? []).length === 0 && (
            <Text size="xs" c="dimmed">
              {t("formFill.editor.optionsEmpty", "Add at least one option.")}
            </Text>
          )}
          {(value.options ?? []).map((opt, i) => (
            <Group key={i} gap={4} wrap="nowrap">
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                value={opt}
                placeholder={t(
                  "formFill.editor.optionPlaceholder",
                  "Option {{n}}",
                  {
                    n: i + 1,
                  },
                )}
                onChange={(e) => updateOption(i, e.currentTarget.value)}
              />
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                aria-label={t("formFill.editor.removeOption", "Remove option")}
                onClick={() => removeOption(i)}
              >
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </ActionIcon>
            </Group>
          ))}
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<AddIcon sx={{ fontSize: 14 }} />}
            onClick={addOption}
          >
            {t("formFill.editor.addOption", "Add option")}
          </Button>
        </Stack>
      )}

      {isFillable && (
        <TextInput
          size="xs"
          label={t("formFill.editor.defaultValue", "Default value")}
          value={value.defaultValue ?? ""}
          onChange={(e) => onChange({ defaultValue: e.currentTarget.value })}
        />
      )}

      <TextInput
        size="xs"
        label={t("formFill.editor.tooltip", "Tooltip")}
        value={value.tooltip ?? ""}
        onChange={(e) => onChange({ tooltip: e.currentTarget.value })}
      />

      {isButton && (
        <>
          <Select
            size="xs"
            label={t("formFill.editor.action", "Button action")}
            value={action.kind}
            data={[
              { value: "none", label: t("formFill.editor.actionNone", "None") },
              {
                value: "reset",
                label: t("formFill.editor.actionReset", "Reset form"),
              },
              {
                value: "print",
                label: t("formFill.editor.actionPrint", "Print"),
              },
              {
                value: "uri",
                label: t("formFill.editor.actionUri", "Open URL"),
              },
              {
                value: "submit",
                label: t("formFill.editor.actionSubmit", "Submit to URL"),
              },
            ]}
            onChange={(v) =>
              onChange({
                buttonAction: buildButtonAction(v ?? "none", action.url),
              })
            }
            comboboxProps={{ withinPortal: true }}
          />
          {(action.kind === "uri" || action.kind === "submit") && (
            <TextInput
              size="xs"
              label={t("formFill.editor.actionUrl", "URL")}
              value={action.url}
              onChange={(e) =>
                onChange({
                  buttonAction: buildButtonAction(
                    action.kind,
                    e.currentTarget.value,
                  ),
                })
              }
            />
          )}
        </>
      )}

      {isVariableText && (
        <NumberInput
          size="xs"
          label={t("formFill.editor.fontSize", "Font size")}
          value={value.fontSize ?? ""}
          min={1}
          max={144}
          onChange={(v) =>
            onChange({ fontSize: typeof v === "number" ? v : undefined })
          }
        />
      )}

      {isText && (
        <>
          <Switch
            size="xs"
            label={t("formFill.editor.multiline", "Multi-line")}
            checked={!!value.multiline}
            onChange={(e) => onChange({ multiline: e.currentTarget.checked })}
          />
          <NumberInput
            size="xs"
            label={t("formFill.editor.maxLength", "Max length (comb)")}
            value={value.maxLength ?? ""}
            min={0}
            max={500}
            onChange={(v) =>
              onChange({ maxLength: typeof v === "number" ? v : undefined })
            }
          />
        </>
      )}

      {value.type === "listbox" && (
        <Switch
          size="xs"
          label={t("formFill.editor.multiSelect", "Allow multiple selection")}
          checked={!!value.multiSelect}
          onChange={(e) => onChange({ multiSelect: e.currentTarget.checked })}
        />
      )}

      {isFillable && (
        <Switch
          size="xs"
          label={t("formFill.editor.required", "Required")}
          checked={!!value.required}
          onChange={(e) => onChange({ required: e.currentTarget.checked })}
        />
      )}

      {isFillable && (
        <Switch
          size="xs"
          label={t("formFill.editor.readOnly", "Read-only")}
          checked={!!value.readOnly}
          onChange={(e) => onChange({ readOnly: e.currentTarget.checked })}
        />
      )}
    </Stack>
  );
}

export default FormFieldPropertyEditor;
