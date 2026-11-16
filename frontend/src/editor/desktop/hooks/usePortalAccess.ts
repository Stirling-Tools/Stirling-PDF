// Desktop ships no processor, so the self-hosted session's portalAccess flag
// must not surface processor entry points here.
export {
  usePortalAccessState,
  usePortalAccess,
  type PortalAccessState,
} from "@editor-core/hooks/usePortalAccess";
