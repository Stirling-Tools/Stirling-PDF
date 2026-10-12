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
    attempted.current = null;
    prompted.current = null;
    return () => {
      attempted.current = null;
    };
  }, [fileId, activeDocument?.id]);

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
      const attempt = { id, password };
      attempted.current = attempt;
      void manager
        .retryDocument(id, { password })
        .toPromise()
        .then((response) => response.task.toPromise())
        .catch(() => {
          if (attempted.current === attempt && fileId)
            actions.openEncryptedUnlockPrompt(fileId as FileId);
        });
    } else if (fileId && prompted.current !== id) {
      prompted.current = id;
      actions.openEncryptedUnlockPrompt(fileId as FileId);
    }
  }, [manager, activeDocument, password, fileId, actions]);

  return null;
}
