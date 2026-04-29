import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import { useMemo } from "react";
import {
  SubcategoryId,
  ToolCategoryId,
  type ProprietaryToolRegistry,
} from "@app/data/toolsTaxonomy";

/**
 * Hook that provides the proprietary tool registry.
 *
 * This is the definition of all proprietary tools,
 * and will be included in the main tool registry.
 */
export function useProprietaryToolRegistry(): ProprietaryToolRegistry {
  return useMemo<ProprietaryToolRegistry>(
    () => ({
      "ai-workflow": {
        icon: <SmartToyRoundedIcon sx={{ fontSize: "1.5rem" }} />,
        name: "AI Workflow",
        component: null,
        description:
          "Intelligent PDF editing powered by AI — redact, edit, and transform documents using natural language.",
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.AUTOMATION,
        automationSettings: null,
        supportsAutomate: false,
      },
    }),
    [],
  );
}
