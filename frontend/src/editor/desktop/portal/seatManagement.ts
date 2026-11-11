import { useSeatManagement as useCloudSeatManagement } from "@processor-cloud/seatManagement";
import { useSeatManagement as useServerSeatManagement } from "@editor-proprietary/portal/seatManagement";
import { editionHook } from "@processor/edition";

/** Cloud seats follow the subscription; a self-hosted licence sells them. */
export const useSeatManagement = editionHook(
  useCloudSeatManagement,
  useServerSeatManagement,
);
