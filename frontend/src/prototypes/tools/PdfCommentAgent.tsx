import type { ChangeEvent } from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Textarea } from "@mantine/core";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import type { BaseToolProps } from "@app/types/tool";

import {
  MAX_PROMPT_LENGTH,
  usePdfCommentAgentParameters,
} from "@app/hooks/tools/pdfCommentAgent/usePdfCommentAgentParameters";
import { usePdfCommentAgentOperation } from "@app/hooks/tools/pdfCommentAgent/usePdfCommentAgentOperation";

const PdfCommentAgent = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "pdf-comment-agent",
    usePdfCommentAgentParameters,
    usePdfCommentAgentOperation,
    props,
  );

  const handlePromptChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      base.params.updateParameter("prompt", event.currentTarget.value);
    },
    [base.params],
  );

  // Inline validation error shown under the Textarea. Only rendered once the
  // user has typed something (or over-typed) — we don't want to yell about an
  // empty field that the user hasn't interacted with yet.
  const prompt = base.params.parameters.prompt;
  const trimmedLength = prompt.trim().length;
  let promptError: string | null = null;
  if (prompt.length > MAX_PROMPT_LENGTH) {
    promptError = t("pdfCommentAgent.error.tooLong", {
      max: MAX_PROMPT_LENGTH,
      defaultValue: `Prompt is too long (maximum ${MAX_PROMPT_LENGTH} characters)`,
    });
  } else if (prompt.length > 0 && trimmedLength === 0) {
    // User typed only whitespace — treat as empty with the empty-prompt message.
    promptError = t(
      "pdfCommentAgent.error.emptyPrompt",
      "Please describe what the AI should comment on",
    );
  }

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("pdfCommentAgent.settings.title", "Comment instructions"),
        isCollapsed: false,
        content: (
          <Stack gap="sm">
            <Textarea
              label={t(
                "pdfCommentAgent.prompt.label",
                "What should the AI comment on?",
              )}
              placeholder={t(
                "pdfCommentAgent.prompt.placeholder",
                "e.g. Flag any ambiguous dates and suggest clarifications",
              )}
              value={prompt}
              onChange={handlePromptChange}
              minRows={4}
              autosize
              maxLength={MAX_PROMPT_LENGTH}
              error={promptError}
            />
          </Stack>
        ),
      },
    ],
    executeButton: {
      text: t("pdfCommentAgent.submit", "Generate comments"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("pdfCommentAgent.results.title", "Commented PDF"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default PdfCommentAgent;
