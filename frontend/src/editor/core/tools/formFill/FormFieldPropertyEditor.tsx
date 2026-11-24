/**
 * Property form shared by the create and modify panels; reports edits as partial patches.
 */
import {
  Stack,
  TextInput,
  NumberInput,
  Select,
  Switch,
  Group,
  Text,
  Alert,
} from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { ToolInfoTooltip } from "@editor/components/tools/shared/ToolInfoTooltip";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";

export interface EditableFieldProps {
  name?: string;
  label?: string;
  type: string;
  defaultValue?: string;
  tooltip?: string;
  fontSize?: number;
  optionGap?: number;
  optionSize?: number;
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

const TYPE_LABEL: Record<string, { key: string; fallback: string }> = {
  text: { key: "formFill.fieldTypes.text", fallback: "Text" },
  checkbox: { key: "formFill.fieldTypes.checkbox", fallback: "Checkbox" },
  combobox: { key: "formFill.fieldTypes.combobox", fallback: "Dropdown" },
  listbox: { key: "formFill.fieldTypes.listbox", fallback: "List box" },
  radio: { key: "formFill.fieldTypes.radioGroup", fallback: "Radio group" },
  button: { key: "formFill.fieldTypes.button", fallback: "Button" },
  signature: { key: "formFill.fieldTypes.signature", fallback: "Signature" },
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
  const typeLabel = (type: string): string | undefined => {
    const entry = TYPE_LABEL[type];
    return entry ? t(entry.key, entry.fallback) : undefined;
  };
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
          icon={<Icon name="info" size={16} />}
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
          {...infoLabelProps(
            t("formFill.editor.name", "Field name"),
            t(
              "formFill.editor.nameHelp",
              "The field's internal name. Used when exporting data or filling the form from another system, so keep it unique and free of spaces.",
            ),
          )}
          value={value.name ?? ""}
          className={privateContentClassName}
          onChange={(e) => onChange({ name: e.currentTarget.value })}
        />
      )}

      <TextInput
        size="xs"
        {...infoLabelProps(
          isButton
            ? t("formFill.editor.caption", "Button caption")
            : t("formFill.editor.label", "Label"),
          isButton
            ? t(
                "formFill.editor.captionHelp",
                "The text printed on the button face.",
              )
            : t(
                "formFill.editor.labelHelp",
                "The wording shown to whoever fills the form. Leave it blank to fall back to the field name.",
              ),
        )}
        value={value.label ?? ""}
        className={privateContentClassName}
        onChange={(e) => onChange({ label: e.currentTarget.value })}
      />

      {allowTypeChange && (
        <Select
          size="xs"
          {...infoLabelProps(
            t("formFill.editor.type", "Type"),
            t(
              "formFill.editor.typeHelp",
              "What kind of field this is. Changing it rebuilds the field, so its current value is not carried over.",
            ),
          )}
          value={canRetype ? value.type : null}
          data={TYPE_CHANGE_OPTIONS.map((tp) => ({
            value: tp,
            label: typeLabel(tp) ?? tp,
          }))}
          disabled={!canRetype}
          placeholder={canRetype ? undefined : typeLabel(value.type)}
          onChange={(v) => v && onChange({ type: v })}
          comboboxProps={{ withinPortal: true }}
        />
      )}

      {hasOptions && (
        <Stack gap={4}>
          <Group gap={4} wrap="nowrap">
            <Text size="xs" fw={600}>
              {t("formFill.editor.options", "Options")}
            </Text>
            <ToolInfoTooltip
              label={t(
                "formFill.editor.optionsHelp",
                "The choices offered in the list. Each one is stored as typed, so keep them short and distinct.",
              )}
            />
          </Group>
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
                className={privateContentClassName}
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
                variant="tertiary"
                accent="danger"
                aria-label={t("formFill.editor.removeOption", "Remove option")}
                onClick={() => removeOption(i)}
              >
                <Icon name="trash" size={16} />
              </ActionIcon>
            </Group>
          ))}
          <Button
            size="sm"
            variant="tertiary"
            leftSection={<Icon name="plus" size={14} />}
            onClick={addOption}
          >
            {t("formFill.editor.addOption", "Add option")}
          </Button>

          {value.type === "radio" && (
            // The group fits the drawn box by default; these are for tightening it by hand.
            <Group grow gap={6} align="flex-start">
              <NumberInput
                size="xs"
                {...infoLabelProps(
                  t("formFill.editor.optionSize", "Option size"),
                  t(
                    "formFill.editor.optionSizeHelp",
                    "Width and height of each button, in points. Leave blank to fit them to the box you drew.",
                  ),
                )}
                value={value.optionSize ?? ""}
                min={1}
                max={144}
                data-testid="form-option-size"
                onChange={(v) =>
                  onChange({
                    optionSize: typeof v === "number" ? v : undefined,
                  })
                }
              />
              <NumberInput
                size="xs"
                {...infoLabelProps(
                  t("formFill.editor.optionGap", "Option spacing"),
                  t(
                    "formFill.editor.optionGapHelp",
                    "Gap between buttons, in points. Leave blank to spread them evenly down the box.",
                  ),
                )}
                value={value.optionGap ?? ""}
                min={0}
                max={144}
                data-testid="form-option-gap"
                onChange={(v) =>
                  onChange({ optionGap: typeof v === "number" ? v : undefined })
                }
              />
            </Group>
          )}
        </Stack>
      )}

      {isFillable && (
        <TextInput
          size="xs"
          {...infoLabelProps(
            t("formFill.editor.defaultValue", "Default value"),
            t(
              "formFill.editor.defaultValueHelp",
              "What the field contains before anyone fills it in. Leave blank for an empty field.",
            ),
          )}
          value={value.defaultValue ?? ""}
          className={privateContentClassName}
          onChange={(e) => onChange({ defaultValue: e.currentTarget.value })}
        />
      )}

      <TextInput
        size="xs"
        {...infoLabelProps(
          t("formFill.editor.tooltip", "Tooltip"),
          t(
            "formFill.editor.tooltipHelp",
            "The hint shown when someone hovers the field in a PDF reader.",
          ),
        )}
        value={value.tooltip ?? ""}
        className={privateContentClassName}
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
              {...infoLabelProps(
                t("formFill.editor.actionUrl", "URL"),
                t(
                  "formFill.editor.actionUrlHelp",
                  "The address the button opens or submits to.",
                ),
              )}
              value={action.url}
              className={privateContentClassName}
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
          {...infoLabelProps(
            t("formFill.editor.fontSize", "Font size"),
            t(
              "formFill.editor.fontSizeHelp",
              "Text size inside the field. Leave blank to let the reader size it to fit.",
            ),
          )}
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
            {...infoLabelProps(
              t("formFill.editor.multiline", "Multi-line"),
              t(
                "formFill.editor.multilineHelp",
                "Allows more than one line of text and wraps at the field's edge.",
              ),
            )}
            checked={!!value.multiline}
            onChange={(e) => onChange({ multiline: e.currentTarget.checked })}
          />
          <NumberInput
            size="xs"
            {...infoLabelProps(
              t("formFill.editor.maxLength", "Max length"),
              t(
                "formFill.editor.maxLengthHelp",
                "Caps how many characters fit, drawn as evenly spaced boxes.",
              ),
            )}
            value={value.maxLength ? value.maxLength : ""}
            min={0}
            max={500}
            onChange={(v) =>
              // 0 is the clear signal; undefined would read as "unchanged" server-side.
              onChange({ maxLength: typeof v === "number" ? v : 0 })
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
          {...infoLabelProps(
            t("formFill.editor.required", "Required"),
            t(
              "formFill.editor.requiredHelp",
              "The form cannot be submitted until this field is filled in.",
            ),
          )}
          checked={!!value.required}
          onChange={(e) => onChange({ required: e.currentTarget.checked })}
        />
      )}

      {/* Read-only belongs to an existing field; one being drawn has nothing to protect yet. */}
      {isFillable && allowTypeChange && (
        <Switch
          size="xs"
          {...infoLabelProps(
            t("formFill.editor.readOnly", "Read-only"),
            t(
              "formFill.editor.readOnlyHelp",
              "Shows a value but stops anyone editing it.",
            ),
          )}
          checked={!!value.readOnly}
          onChange={(e) => onChange({ readOnly: e.currentTarget.checked })}
        />
      )}
    </Stack>
  );
}

export default FormFieldPropertyEditor;
