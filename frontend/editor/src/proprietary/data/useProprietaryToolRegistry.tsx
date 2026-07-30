import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import LocalIcon from "@app/components/shared/LocalIcon";
import {
  SubcategoryId,
  ToolCategoryId,
  type ProprietaryToolRegistry,
} from "@app/data/toolsTaxonomy";
import { asRegistryConfig } from "@app/hooks/tools/shared/toolOperationTypes";
import { useDocparseEnabled } from "@app/hooks/useDocparseEnabled";
import { extractFieldsOperationConfig } from "@app/hooks/tools/extractFields/extractFieldsOperationConfig";
import ExtractFields from "@app/tools/ExtractFields";
import { getSynonyms } from "@app/utils/toolSynonyms";

const toolIcon = (icon: string) => (
  <LocalIcon icon={icon} width="1.5rem" height="1.5rem" />
);

/**
 * Proprietary tool registry extension - the DocParse tool family.
 * Overrides the empty stub at {@code core/data/useProprietaryToolRegistry.tsx}.
 * Hidden entirely while the backend reports docparse disabled.
 */
export function useProprietaryToolRegistry(): ProprietaryToolRegistry {
  const { t } = useTranslation();
  const docparseEnabled = useDocparseEnabled();

  return useMemo(() => {
    if (!docparseEnabled) return {} as ProprietaryToolRegistry;
    return {
      extractFields: {
        icon: toolIcon("fact-check-outline-rounded"),
        name: t("home.extractFields.title", "Extract Fields"),
        component: ExtractFields,
        description: t(
          "home.extractFields.desc",
          "Pull typed fields out of a document with confidence scores and citations",
        ),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_INTELLIGENCE,
        maxFiles: 1,
        endpoints: ["extract-fields"],
        operationConfig: asRegistryConfig(extractFieldsOperationConfig),
        automationSettings: null,
        synonyms: getSynonyms(t, "extractFields"),
        versionStatus: "beta",
      },
    } as ProprietaryToolRegistry;
  }, [docparseEnabled, t]);
}
