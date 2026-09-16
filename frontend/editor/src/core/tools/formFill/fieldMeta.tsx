/**
 * Shared field type metadata: icons and color mappings.
 * Used by FormFill, FormFieldSidebar, and any future form tools.
 */
import React from "react";
import type { FormFieldType } from "@app/tools/formFill/types";
import { Icon } from "@app/ui/Icon";
export const FIELD_TYPE_ICON: Record<FormFieldType, React.ReactNode> = {
  text: <Icon name="type" size={"inherit"} />,
  checkbox: <Icon name="square-check" size={"inherit"} />,
  combobox: <Icon name="circle-chevron-down" size={"inherit"} />,
  listbox: <Icon name="list" size={"inherit"} />,
  radio: <Icon name="radio-checked" size={"inherit"} />,
  button: <Icon name="pen-tool" size={"inherit"} />,
  signature: <Icon name="pen-tool" size={"inherit"} />,
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
