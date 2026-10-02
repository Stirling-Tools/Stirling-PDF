import { useSeatManagement as useCloudSeatManagement } from "@portal-cloud/seatManagement";
import { useSeatManagement as useServerSeatManagement } from "@proprietary/portal/seatManagement";
import { editionHook } from "@portal/edition";

/** Cloud seats follow the subscription; a self-hosted licence sells them. */
export const useSeatManagement = editionHook(
  useCloudSeatManagement,
  useServerSeatManagement,
);
