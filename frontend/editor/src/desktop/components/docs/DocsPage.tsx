/**
 * Desktop inherits proprietary's app but ships no portal, so it must not
 * resolve the portal-authored docs view — shadow the seam back to the stub.
 */
export { default } from "@core/components/docs/DocsPage";
