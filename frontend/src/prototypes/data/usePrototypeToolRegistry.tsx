import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import LocalIcon from "@app/components/shared/LocalIcon";
import {
  SubcategoryId,
  ToolCategoryId,
  type PrototypeToolRegistry,
} from "@app/data/toolsTaxonomy";
import { pdfCommentAgentOperationConfig } from "@app/hooks/tools/pdfCommentAgent/pdfCommentAgentOperationConfig";
import PdfCommentAgent from "@app/tools/PdfCommentAgent";
import { getSynonyms } from "@app/utils/toolSynonyms";

/**
 * Prototype tool registry extension — real implementation.
 *
 * Overrides the empty stub at {@code core/data/usePrototypeToolRegistry.tsx}
 * when the build resolves {@code @app/*} through {@code src/prototypes/*}.
 * Experimental AI tools live here until they graduate to core / proprietary.
 */
export function usePrototypeToolRegistry(): PrototypeToolRegistry {
  const { t } = useTranslation();

  return useMemo(
    () =>
      ({
        pdfCommentAgent: {
          icon: <LocalIcon icon="add-comment" width="1.5rem" height="1.5rem" />,
          name: t("home.pdfCommentAgent.title", "Add AI comments"),
          component: PdfCommentAgent,
          description: t(
            "home.pdfCommentAgent.desc",
            "Ask AI to annotate a PDF with sticky-note comments based on your prompt",
          ),
          categoryId: ToolCategoryId.ADVANCED_TOOLS,
          subcategoryId: SubcategoryId.DOCUMENT_REVIEW,
          maxFiles: 1,
          endpoints: ["pdf-comment-agent"],
          operationConfig: pdfCommentAgentOperationConfig,
          automationSettings: null,
          synonyms: getSynonyms(t, "pdfCommentAgent"),
          versionStatus: "beta",
        },
      }) as PrototypeToolRegistry,
    [t],
  );
}
