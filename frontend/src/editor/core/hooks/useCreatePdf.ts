import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileHandler } from "@editor/hooks/useFileHandler";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useFileSelection } from "@editor/contexts/FileContext";
import { useNavigationActions } from "@editor/contexts/NavigationContext";
import { useToolWorkflowActions } from "@editor/contexts/ToolWorkflowContext";
import { alert } from "@editor/components/toast";
import { convertProcessor } from "@editor/hooks/tools/convert/useConvertOperation";
import { defaultParameters as defaultConvertParameters } from "@editor/hooks/tools/convert/useConvertParameters";
import { detectFileExtension } from "@editor/utils/fileUtils";
import {
  createBlankPdf,
  defaultPageSizeFor,
} from "@editor/services/createPdf/newPdfDocuments";

export type CreatePdfStage = "idle" | "creating" | "converting";

export function useCreatePdf() {
  const { t, i18n } = useTranslation();
  const { addFiles } = useFileHandler();
  const { setActiveFileId } = useViewer();
  const { setSelectedFiles } = useFileSelection();
  const { actions: navigationActions } = useNavigationActions();
  const { handleToolSelect } = useToolWorkflowActions();
  const [stage, setStage] = useState<CreatePdfStage>("idle");

  const openInTextEditor = useCallback(
    async (file: File) => {
      const [added] = await addFiles([file]);
      if (!added) return;
      setSelectedFiles([added.fileId]);
      setActiveFileId(added.fileId);
      navigationActions.setWorkbench("viewer");
      handleToolSelect("pdfTextEditor");
    },
    [
      addFiles,
      setSelectedFiles,
      setActiveFileId,
      navigationActions,
      handleToolSelect,
    ],
  );

  const run = useCallback(
    async (
      nextStage: CreatePdfStage,
      failureTitle: string,
      build: () => Promise<File>,
    ) => {
      setStage(nextStage);
      try {
        await openInTextEditor(await build());
      } catch (error) {
        alert({
          alertType: "error",
          title: failureTitle,
          body: error instanceof Error ? error.message : String(error),
          expandable: false,
        });
      } finally {
        setStage("idle");
      }
    },
    [openInTextEditor],
  );

  const createBlank = useCallback(
    () =>
      run("creating", t("createPdf.failed", "Couldn't create the PDF"), () =>
        createBlankPdf(defaultPageSizeFor(i18n.language)),
      ),
    [run, i18n, t],
  );

  const createFromSource = useCallback(
    (source: File) =>
      run(
        "converting",
        t("createPdf.convertFailedTitle", {
          defaultValue: "Couldn't convert {{name}}",
          name: source.name,
        }),
        async () => {
          if (detectFileExtension(source.name) === "pdf") return source;
          const { files } = await convertProcessor(
            {
              ...defaultConvertParameters,
              fromExtension: "any",
              toExtension: "pdf",
            },
            [source],
            { suppressErrorToast: true },
          );
          const [converted] = files;
          if (!converted) {
            throw new Error(
              t(
                "createPdf.convertFailed",
                "This file couldn't be converted to PDF.",
              ),
            );
          }
          return converted;
        },
      ),
    [run, t],
  );

  return { stage, createBlank, createFromSource };
}
