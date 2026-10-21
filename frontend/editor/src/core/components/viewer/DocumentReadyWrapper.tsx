import React from "react";
import {
  useActiveDocument,
  useDocumentManagerCapability,
} from "@embedpdf/plugin-document-manager/react";
import { Center, Stack, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";

interface DocumentReadyWrapperProps {
  children: (documentId: string) => React.ReactNode;
  fallback?: React.ReactNode;
}

export function DocumentReadyWrapper({
  children,
  fallback = null,
}: DocumentReadyWrapperProps) {
  const { activeDocumentId, activeDocument } = useActiveDocument();
  const { provides: manager } = useDocumentManagerCapability();
  const { t } = useTranslation();
  if (activeDocumentId && activeDocument?.status === "error") {
    return (
      <Center h="100%">
        <Stack align="center">
          <Text role="alert">
            {activeDocument.error ||
              t("viewer.error.loadError", "Failed to load PDF")}
          </Text>
          <Button
            onClick={() => {
              void manager
                ?.retryDocument(activeDocumentId)
                .toPromise()
                .catch(() => {});
            }}
          >
            {t("common.retry", "Retry")}
          </Button>
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
