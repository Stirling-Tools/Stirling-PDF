export { DOCS_PATH } from "@core/routes/docsRoute";

/**
 * The documentation browser ships in every build that can resolve the docs
 * view, whether or not the processor is included. It was gated on HAS_PORTAL
 * only because the view lives in the portal tree; that made /docs silently
 * fall through to the editor in any build without the processor.
 */
export const HAS_DOCS = true;
