import { useEffect, useRef } from "react";
import {
  useActiveDocument,
  useDocumentManagerCapability,
} from "@embedpdf/plugin-document-manager/react";
import { PdfErrorCode } from "@embedpdf/models";
import { useFileActions } from "@editor/contexts/FileContext";
import type { FileId } from "@editor/types/file";

/** Retry EmbedPDF's original encrypted document after the shared session prompt authenticates it. */
export function PdfPasswordBridge({
  fileId,
  password,
  onPasswordRequired,
}: {
  fileId?: string | null;
  password?: string;
  onPasswordRequired?: () => void;
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
    const prompt = () => {
      if (onPasswordRequired) onPasswordRequired();
      else if (fileId) actions.openEncryptedUnlockPrompt(fileId as FileId);
    };
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
          if (attempted.current === attempt) prompt();
        });
    } else if ((fileId || onPasswordRequired) && prompted.current !== id) {
      prompted.current = id;
      prompt();
    }
  }, [manager, activeDocument, password, fileId, actions, onPasswordRequired]);

  return null;
}
