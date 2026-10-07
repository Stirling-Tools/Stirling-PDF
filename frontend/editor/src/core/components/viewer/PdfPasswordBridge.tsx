import { useEffect, useRef } from "react";
import {
  useActiveDocument,
  useDocumentManagerCapability,
} from "@embedpdf/plugin-document-manager/react";
import { PdfErrorCode } from "@embedpdf/models";
import { useFileActions } from "@app/contexts/FileContext";
import type { FileId } from "@app/types/file";

/** Retry EmbedPDF's original encrypted document after the shared session prompt authenticates it. */
export function PdfPasswordBridge({
  fileId,
  password,
}: {
  fileId?: string | null;
  password?: string;
}) {
  const { activeDocument } = useActiveDocument();
  const { provides: manager } = useDocumentManagerCapability();
  const { actions } = useFileActions();
  const attempted = useRef<{ id: string; password: string } | null>(null);
  const prompted = useRef<string | null>(null);

  useEffect(() => {
    if (
      !manager ||
      activeDocument?.errorCode !== PdfErrorCode.Password ||
      activeDocument.status !== "error"
    )
      return;
    const id = activeDocument.id;
    if (
      password !== undefined &&
      (attempted.current?.id !== id || attempted.current.password !== password)
    ) {
      attempted.current = { id, password };
      void manager
        .retryDocument(id, { password })
        .toPromise()
        .then((response) => response.task.toPromise())
        .catch(() => {
          if (fileId) actions.openEncryptedUnlockPrompt(fileId as FileId);
        });
    } else if (fileId && prompted.current !== id) {
      prompted.current = id;
      actions.openEncryptedUnlockPrompt(fileId as FileId);
    }
  }, [manager, activeDocument, password, fileId, actions]);

  return null;
}
