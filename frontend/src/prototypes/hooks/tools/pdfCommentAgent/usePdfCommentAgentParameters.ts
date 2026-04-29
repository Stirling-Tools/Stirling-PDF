import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export interface PdfCommentAgentParameters extends BaseParameters {
  /** Natural-language instructions for what the AI should comment on. */
  prompt: string;
}

export const MAX_PROMPT_LENGTH = 4000;

export const defaultParameters: PdfCommentAgentParameters = {
  prompt: "",
};

export type PdfCommentAgentParametersHook =
  BaseParametersHook<PdfCommentAgentParameters>;

export const usePdfCommentAgentParameters =
  (): PdfCommentAgentParametersHook => {
    return useBaseParameters({
      defaultParameters,
      endpointName: "pdf-comment-agent",
      validateFn: (params) => {
        const trimmed = params.prompt.trim();
        return trimmed.length > 0 && params.prompt.length <= MAX_PROMPT_LENGTH;
      },
    });
  };
