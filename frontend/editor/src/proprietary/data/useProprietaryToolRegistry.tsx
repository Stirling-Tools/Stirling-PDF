import { lazy, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import {
  type ProprietaryToolRegistry,
  SubcategoryId,
  ToolCategoryId,
} from "@app/data/toolsTaxonomy";
import { asRegistryConfig } from "@app/hooks/tools/shared/toolOperationTypes";
import { getSynonyms } from "@app/utils/toolSynonyms";
import { classifyRustOperationConfig } from "@app/hooks/tools/classifyRust/useClassifyRustOperation";

/** The proprietary build's tools, merged into the core registry. */
export function useProprietaryToolRegistry(): ProprietaryToolRegistry {
  const { t } = useTranslation();

  return useMemo(() => {
    const tools: Partial<ProprietaryToolRegistry> = {
      classifyRust: {
        icon: <Icon name="tag" size="1.5rem" />,
        name: t("home.classifyRust.title", "Classify (Rust)"),
        component: lazy(() => import("@app/tools/ClassifyRust")),
        description: t(
          "home.classifyRust.desc",
          "Label what kind of document each PDF is with the rule-based Rust classifier, in your browser or on the server",
        ),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.AUTOMATION,
        maxFiles: -1,
        endpoints: ["classify-rust"],
        operationConfig: asRegistryConfig(classifyRustOperationConfig),
        automationSettings: null,
        synonyms: getSynonyms(t, "classifyRust"),
      },
    };
    // "ai-workflow" is a proprietary id with no registry entry.
    return tools as ProprietaryToolRegistry;
  }, [t]);
}
