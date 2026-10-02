import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { publicPageManifest } from "@app/data/publicPageManifest";
import { updatePublicPage } from "@app/utils/updatePublicPage";

export function PublicPageMetadata() {
  const { pathname } = useLocation();
  useLayoutEffect(
    () => updatePublicPage(pathname, publicPageManifest),
    [pathname],
  );
  return null;
}
