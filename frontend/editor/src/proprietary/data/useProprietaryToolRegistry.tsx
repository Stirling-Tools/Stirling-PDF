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
import { parseDocumentOperationConfig } from "@app/hooks/tools/parseDocument/parseDocumentOperationConfig";
import { extractFieldsOperationConfig } from "@app/hooks/tools/extractFields/extractFieldsOperationConfig";
import { smartSplitOperationConfig } from "@app/hooks/tools/smartSplit/smartSplitOperationConfig";
import { chunkDocumentOperationConfig } from "@app/hooks/tools/chunkDocument/chunkDocumentOperationConfig";
import { fillTemplateOperationConfig } from "@app/hooks/tools/fillTemplate/fillTemplateOperationConfig";
import ParseDocument from "@app/tools/ParseDocument";
import ExtractFields from "@app/tools/ExtractFields";
import SmartSplit from "@app/tools/SmartSplit";
import ChunkDocument from "@app/tools/ChunkDocument";
import FillTemplate from "@app/tools/FillTemplate";
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
      parseDocument: {
        icon: toolIcon("quick-reference-all-outline-rounded"),
        name: t("home.parseDocument.title", "Parse Document"),
        component: ParseDocument,
        description: t(
          "home.parseDocument.desc",
          "Layout-aware parsing to structured JSON or Markdown, with optional OCR",
        ),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_INTELLIGENCE,
        maxFiles: 1,
        endpoints: ["parse-document"],
        operationConfig: asRegistryConfig(parseDocumentOperationConfig),
        automationSettings: null,
        synonyms: getSynonyms(t, "parseDocument"),
        versionStatus: "beta",
      },
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
      smartSplit: {
        icon: toolIcon("content-cut-rounded"),
        name: t("home.smartSplit.title", "Smart Split"),
        component: SmartSplit,
        description: t(
          "home.smartSplit.desc",
          "Split a PDF into sub-documents using a natural-language boundary rule",
        ),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_INTELLIGENCE,
        maxFiles: 1,
        endpoints: ["smart-split"],
        operationConfig: asRegistryConfig(smartSplitOperationConfig),
        automationSettings: null,
        synonyms: getSynonyms(t, "smartSplit"),
        versionStatus: "beta",
      },
      chunkDocument: {
        icon: toolIcon("layers-outline-rounded"),
        name: t("home.chunkDocument.title", "Prepare for RAG"),
        component: ChunkDocument,
        description: t(
          "home.chunkDocument.desc",
          "Layout-aware parse to structure-aware chunks with heading breadcrumbs and page ranges, ready to embed",
        ),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_INTELLIGENCE,
        maxFiles: 1,
        endpoints: ["chunk-document"],
        operationConfig: asRegistryConfig(chunkDocumentOperationConfig),
        automationSettings: null,
        synonyms: getSynonyms(t, "chunkDocument"),
        versionStatus: "beta",
      },
      fillTemplate: {
        icon: toolIcon("assignment-outline-rounded"),
        name: t("home.fillTemplate.title", "Fill Template"),
        component: FillTemplate,
        description: t(
          "home.fillTemplate.desc",
          "Fill a DOCX template's placeholders from JSON data",
        ),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_INTELLIGENCE,
        maxFiles: 1,
        supportedFormats: ["docx"],
        endpoints: ["fill-template"],
        operationConfig: asRegistryConfig(fillTemplateOperationConfig),
        automationSettings: null,
        synonyms: getSynonyms(t, "fillTemplate"),
        versionStatus: "beta",
      },
    } as ProprietaryToolRegistry;
  }, [t, docparseEnabled]);
}
