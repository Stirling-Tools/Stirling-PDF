/**
 * Policy-facing binding for the PDF/A endpoint. The Convert tool's config spans every conversion;
 * a policy step needs only these two parameters, typed against the generated request model.
 */

import type { BidirectionalToolConfig } from "@app/hooks/tools/shared/toolOperationDescriptor";
import type { ToolApiParams, ToolEndpoint } from "@app/types/toolApiTypes";

const ENDPOINT = "/api/v1/convert/pdf/pdfa" satisfies ToolEndpoint;
type PdfaApiParams = ToolApiParams[typeof ENDPOINT];

/**
 * Archival profiles only. The endpoint also converts to PDF/X, but that is a print-production
 * standard with no bearing on a compliance policy, so it is not offered here.
 */
export const PDFA_OUTPUT_FORMATS = [
  "pdfa-1",
  "pdfa-2b",
  "pdfa-3b",
] as const satisfies readonly PdfaApiParams["outputFormat"][];

export type PdfaOutputFormat = (typeof PDFA_OUTPUT_FORMATS)[number];

export interface PdfaPolicyParameters {
  outputFormat: PdfaOutputFormat;
  /** Fail the run when the converted file still is not compliant, instead of delivering it. */
  strict: boolean;
}

/** PDF/A-2b: the widest-supported archival profile, and what most retention policies ask for. */
export const pdfaDefaultParameters: PdfaPolicyParameters = {
  outputFormat: "pdfa-2b",
  strict: false,
};

function toOutputFormat(value: unknown): PdfaOutputFormat {
  return (PDFA_OUTPUT_FORMATS as readonly string[]).includes(value as string)
    ? (value as PdfaOutputFormat)
    : pdfaDefaultParameters.outputFormat;
}

// Annotated rather than inferred: an unannotated object literal widens `endpoint` to string, which
// no longer satisfies describeToolOperation's `CE extends ToolEndpoint`.
export const pdfaOperationConfig: BidirectionalToolConfig<
  PdfaPolicyParameters,
  typeof ENDPOINT
> = {
  endpoint: ENDPOINT,
  defaultParameters: pdfaDefaultParameters,
  toApiParams: (parameters: PdfaPolicyParameters): PdfaApiParams => ({
    outputFormat: parameters.outputFormat,
    strict: parameters.strict,
  }),
  // A stored step may name a profile this policy UI no longer offers (or nothing at all); clamp to
  // a known archival profile rather than re-sending a value the picker cannot render.
  fromApiParams: (apiParams: PdfaApiParams): Partial<PdfaPolicyParameters> => ({
    outputFormat: toOutputFormat(apiParams.outputFormat),
    strict: apiParams.strict ?? pdfaDefaultParameters.strict,
  }),
};
