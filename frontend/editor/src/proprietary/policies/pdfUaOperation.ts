/**
 * Policy-facing binding for the PDF/UA (accessibility) endpoint. The Convert tool's config spans
 * every knob; a policy runs unattended, so it exposes only the two that decide whether a document
 * can conform without a human supplying per-figure alt text.
 */

import type { BidirectionalToolConfig } from "@app/hooks/tools/shared/toolOperationDescriptor";
import type { ToolApiParams, ToolEndpoint } from "@app/types/toolApiTypes";

const ENDPOINT = "/api/v1/convert/pdf/ua" satisfies ToolEndpoint;
type PdfUaApiParams = ToolApiParams[typeof ENDPOINT];

/**
 * How undescribed images are handled. A policy cannot invent alt text per document, so the default
 * marks images decorative - the only way an illustrated document conforms unattended; require-alt
 * is offered for policies that would rather fail than ship images without descriptions.
 */
export const PDFUA_FIGURE_POLICIES = [
  "mark-decorative",
  "require-alt",
] as const satisfies readonly NonNullable<PdfUaApiParams["figurePolicy"]>[];

export type PdfUaFigurePolicy = (typeof PDFUA_FIGURE_POLICIES)[number];

export interface PdfUaPolicyParameters {
  /** Embed referenced-but-missing fonts; required for conformance (needs Ghostscript). */
  embedFonts: boolean;
  figurePolicy: PdfUaFigurePolicy;
}

export const pdfUaDefaultParameters: PdfUaPolicyParameters = {
  embedFonts: true,
  figurePolicy: "mark-decorative",
};

function toFigurePolicy(value: unknown): PdfUaFigurePolicy {
  return (PDFUA_FIGURE_POLICIES as readonly string[]).includes(value as string)
    ? (value as PdfUaFigurePolicy)
    : pdfUaDefaultParameters.figurePolicy;
}

// Annotated rather than inferred: an unannotated object literal widens `endpoint` to string, which
// no longer satisfies describeToolOperation's `CE extends ToolEndpoint`.
export const pdfUaOperationConfig: BidirectionalToolConfig<
  PdfUaPolicyParameters,
  typeof ENDPOINT
> = {
  endpoint: ENDPOINT,
  defaultParameters: pdfUaDefaultParameters,
  toApiParams: (parameters: PdfUaPolicyParameters): PdfUaApiParams => ({
    embedFonts: parameters.embedFonts,
    figurePolicy: parameters.figurePolicy,
  }),
  fromApiParams: (
    apiParams: PdfUaApiParams,
  ): Partial<PdfUaPolicyParameters> => ({
    embedFonts: apiParams.embedFonts ?? pdfUaDefaultParameters.embedFonts,
    figurePolicy: toFigurePolicy(apiParams.figurePolicy),
  }),
};
