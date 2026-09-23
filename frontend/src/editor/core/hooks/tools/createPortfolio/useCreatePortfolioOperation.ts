import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  defineMultiFileTool,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  CreatePortfolioParameters,
  DEFAULT_CREATE_PORTFOLIO_PARAMETERS,
} from "@app/hooks/tools/createPortfolio/useCreatePortfolioParameters";

const ENDPOINT = "/api/v1/misc/create-portfolio" satisfies ToolEndpoint;
type CreatePortfolioApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the create-portfolio request body. The
// member files are uploaded via the named "files" field (see buildFormData);
// the model lists them but they are not scalar parameters.
export const createPortfolioToApiParams = (
  parameters: CreatePortfolioParameters,
): CreatePortfolioApiParams => ({
  files: [],
  coverTitle: parameters.coverTitle || undefined,
});

// Reconstruct the tool's UI parameters from a create-portfolio request body (the
// member files themselves are not recoverable from stored parameters).
export const createPortfolioFromApiParams = (
  apiParams: CreatePortfolioApiParams,
): Partial<CreatePortfolioParameters> => ({
  coverTitle:
    apiParams.coverTitle ?? DEFAULT_CREATE_PORTFOLIO_PARAMETERS.coverTitle,
});

const buildFormData = (
  parameters: CreatePortfolioParameters,
  files: File[],
): FormData =>
  objectToFormData(createPortfolioToApiParams(parameters), {
    files: (files || []).filter(Boolean),
  });

// Operation configuration for automation
export const createPortfolioOperationConfig = defineMultiFileTool({
  buildFormData,
  toApiParams: createPortfolioToApiParams,
  fromApiParams: createPortfolioFromApiParams,
  operationType: "createPortfolio",
  endpoint: ENDPOINT,
  filePrefix: "portfolio_",
  defaultParameters: DEFAULT_CREATE_PORTFOLIO_PARAMETERS,
});

export const useCreatePortfolioOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<CreatePortfolioParameters>({
    ...createPortfolioOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "createPortfolio.error.failed",
        "An error occurred while creating the PDF portfolio.",
      ),
    ),
  });
};
