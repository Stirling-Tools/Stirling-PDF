/**
 * Shared field type metadata: icons and color mappings.
 * Used by FormFill, FormFieldSidebar, and any future form tools.
 */
import type { FormFieldType } from "@app/tools/formFill/types";
import type { IconName } from "@app/ui/Icon";

export const FIELD_TYPE_ICON: Record<FormFieldType, IconName> = {
  text: "type",
  checkbox: "square-check",
  combobox: "circle-chevron-down",
  listbox: "list",
  radio: "radio-checked",
  button: "pen-tool",
  signature: "pen-tool",
};

export const FIELD_TYPE_COLOR: Record<FormFieldType, string> = {
  text: "blue",
  checkbox: "green",
  combobox: "violet",
  listbox: "cyan",
  radio: "orange",
  button: "gray",
  signature: "pink",
};
