import { HAS_PORTAL } from "@app/routes/hasPortal";

export { DOCS_PATH } from "@core/routes/docsRoute";

/** The manifest is bundled with the portal chunk, so it ships wherever that does. */
export const HAS_DOCS = HAS_PORTAL;
