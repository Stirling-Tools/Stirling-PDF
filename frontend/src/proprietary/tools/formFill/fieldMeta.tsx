/**
 * Shared field type metadata — icons and color mappings.
 * Used by FormFill, FormFieldSidebar, and any future form tools.
 */
import React from 'react';
import type { FormFieldType } from '@proprietary/tools/formFill/types';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import ArrowDropDownCircleIcon from '@mui/icons-material/ArrowDropDownCircle';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import ListIcon from '@mui/icons-material/List';
import DrawIcon from '@mui/icons-material/Draw';

export const FIELD_TYPE_ICON: Record<FormFieldType, React.ReactNode> = {
  text: <TextFieldsIcon sx={{ fontSize: 'inherit' }} />,
  checkbox: <CheckBoxIcon sx={{ fontSize: 'inherit' }} />,
  combobox: <ArrowDropDownCircleIcon sx={{ fontSize: 'inherit' }} />,
  listbox: <ListIcon sx={{ fontSize: 'inherit' }} />,
  radio: <RadioButtonCheckedIcon sx={{ fontSize: 'inherit' }} />,
  button: <DrawIcon sx={{ fontSize: 'inherit' }} />,
  signature: <DrawIcon sx={{ fontSize: 'inherit' }} />,
};

export const FIELD_TYPE_COLOR: Record<FormFieldType, string> = {
  text: 'blue',
  checkbox: 'green',
  combobox: 'violet',
  listbox: 'cyan',
  radio: 'orange',
  button: 'gray',
  signature: 'pink',
};
