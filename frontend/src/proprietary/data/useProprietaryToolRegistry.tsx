import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type ProprietaryToolRegistry } from "@app/data/toolsTaxonomy";
import { ToolCategoryId, SubcategoryId } from "@app/data/toolsTaxonomy";
import FormFill from "@app/tools/formFill/FormFill";
import React from "react";
import TextFieldsIcon from '@mui/icons-material/TextFields';

/**
 * Hook that provides the proprietary tool registry.
 *
 * This is the definition of all proprietary tools,
 * and will be included in the main tool registry.
 */
export function useProprietaryToolRegistry(): ProprietaryToolRegistry {
  const { t } = useTranslation();

  return useMemo<ProprietaryToolRegistry>(() => ({
    formFill: {
      icon: React.createElement(TextFieldsIcon, { sx: { fontSize: '1.5rem' } }),
      name: t('home.formFill.title', 'Fill Form'),
      component: FormFill,
      description: t('home.formFill.desc', 'Fill PDF form fields interactively with a visual editor'),
      categoryId: ToolCategoryId.STANDARD_TOOLS,
      subcategoryId: SubcategoryId.GENERAL,
      workbench: 'viewer' as const,
      endpoints: ['form-fill'],
      automationSettings: null,
      supportsAutomate: false,
      synonyms: ['form', 'fill', 'fillable', 'input', 'field', 'acroform'],
    },
  }), [t]);
}
