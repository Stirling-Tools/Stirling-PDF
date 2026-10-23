import React from "react";
import {
  useActiveDocument,
  useDocumentManagerCapability,
} from "@embedpdf/plugin-document-manager/react";
import { Center, Group, Stack, Text } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { useTranslation } from "react-i18next";
import { isDamagedPdfError } from "@editor/utils/pdfDamage";

interface DocumentReadyWrapperProps {
  children: (documentId: string) => React.ReactNode;
  fallback?: React.ReactNode;
  /** Offered instead of a bare retry when the file itself cannot be parsed. */
  onRepair?: () => void;
  repairing?: boolean;
}

export function DocumentReadyWrapper({
  children,
  fallback = null,
  onRepair,
  repairing = false,
}: DocumentReadyWrapperProps) {
  const { activeDocumentId, activeDocument } = useActiveDocument();
  const { provides: manager } = useDocumentManagerCapability();
  const { t } = useTranslation();
  if (activeDocumentId && activeDocument?.status === "error") {
    const damaged = isDamagedPdfError({ code: activeDocument.errorCode });
    return (
      <Center h="100%">
        <Stack align="center">
          <Text role="alert">
            {damaged
              ? t(
                  "damagedPdf.description",
                  "This PDF is damaged and can't be opened.",
                )
              : activeDocument.error ||
                t("viewer.error.loadError", "Failed to load PDF")}
          </Text>
          <Group>
            {damaged && onRepair && (
              <Button onClick={onRepair} loading={repairing}>
                {t("damagedPdf.repair", "Repair")}
              </Button>
            )}
            <Button
              variant={damaged && onRepair ? "secondary" : undefined}
              onClick={() => {
                void manager
                  ?.retryDocument(activeDocumentId)
                  .toPromise()
                  .catch(() => {});
              }}
            >
              {t("common.retry", "Retry")}
            </Button>
          </Group>
        </Stack>
      </Center>
    );
  }
  if (
    !activeDocumentId ||
    activeDocument?.status !== "loaded" ||
    !activeDocument?.document
  ) {
    return <>{fallback}</>;
  }
  return <>{children(activeDocumentId)}</>;
}
