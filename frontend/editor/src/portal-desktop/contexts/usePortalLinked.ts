import { usePortalLinked as useCloudPortalLinked } from "@portal-cloud/contexts/usePortalLinked";
import { usePortalLinked as useServerPortalLinked } from "@portal-proprietary/contexts/usePortalLinked";
import { editionHook } from "@portal/edition";

export const usePortalLinked = editionHook(
  useCloudPortalLinked,
  useServerPortalLinked,
);
