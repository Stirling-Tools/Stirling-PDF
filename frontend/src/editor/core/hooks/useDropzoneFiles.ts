import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { alert } from "@app/components/toast";
import { getDropzoneFiles } from "@app/utils/getDropzoneFiles";

/**
 * Keeps readable files when entries fail; reports errors through onError or a toast.
 * Mantine dropzones must set useFsAccessApi=false; native drop events work directly.
 */
export function useDropzoneFiles(onError?: (error: Error) => void) {
  const { t } = useTranslation();
  return useCallback(
    async (event: Parameters<typeof getDropzoneFiles>[0]) => {
      const reportError = (error: Error) => {
        if (onError) onError(error);
        else
          alert({
            alertType: "error",
            title: t("filePicker.errorTitle", "Couldn't add files"),
            body: error.message,
            expandable: false,
            durationMs: 5000,
          });
      };
      try {
        return await getDropzoneFiles(event, reportError);
      } catch (cause) {
        reportError(
          cause instanceof Error
            ? cause
            : new Error(
                t(
                  "filePicker.error",
                  "Could not add these files. Please try again.",
                ),
              ),
        );
        return [];
      }
    },
    [onError, t],
  );
}
