import { usePortalLinked as useCloudPortalLinked } from "@processor-cloud/contexts/usePortalLinked";
import { usePortalLinked as useServerPortalLinked } from "@processor-proprietary/contexts/usePortalLinked";
import { editionHook } from "@processor/edition";

export const usePortalLinked = editionHook(
  useCloudPortalLinked,
  useServerPortalLinked,
);
