import { useEffect, useMemo } from "react";
import { canPrintPdf } from "@app/services/pdfPermissions";
import { useViewer } from "@app/contexts/ViewerContext";
import { useDocumentReady } from "@app/components/viewer/hooks/useDocumentReady";
import {
  PdfPermissionFlag,
  DocumentPermissionsState,
  DocumentPermissionsAPIWrapper,
} from "@app/contexts/viewer/viewerBridges";

function hasPermissionFlag(
  permissions: number,
  flag: PdfPermissionFlag,
  isEncrypted: boolean,
): boolean {
  if (!isEncrypted || permissions === PdfPermissionFlag.AllowAll) {
    return true;
  }
  return (permissions & flag) !== 0;
}

interface DocumentPermissionsAPIBridgeProps {
  isEncrypted?: boolean;
  isOwnerUnlocked?: boolean;
  permissions?: number;
}

export function DocumentPermissionsAPIBridge({
  isEncrypted = false,
  isOwnerUnlocked = false,
  permissions = PdfPermissionFlag.AllowAll,
}: DocumentPermissionsAPIBridgeProps) {
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  const state = useMemo<DocumentPermissionsState>(
    () => ({
      isEncrypted,
      isOwnerUnlocked,
      permissions,
      canPrint: canPrintPdf({
        encrypted: isEncrypted,
        ownerAuthenticated: isOwnerUnlocked,
        permissions,
      }),
      canModifyContents: hasPermissionFlag(
        permissions,
        PdfPermissionFlag.ModifyContents,
        isEncrypted,
      ),
      canCopyContents: hasPermissionFlag(
        permissions,
        PdfPermissionFlag.CopyContents,
        isEncrypted,
      ),
      canModifyAnnotations: hasPermissionFlag(
        permissions,
        PdfPermissionFlag.ModifyAnnotations,
        isEncrypted,
      ),
      canFillForms: hasPermissionFlag(
        permissions,
        PdfPermissionFlag.FillForms,
        isEncrypted,
      ),
      canExtractForAccessibility: hasPermissionFlag(
        permissions,
        PdfPermissionFlag.ExtractForAccessibility,
        isEncrypted,
      ),
      canAssembleDocument: hasPermissionFlag(
        permissions,
        PdfPermissionFlag.AssembleDocument,
        isEncrypted,
      ),
      canPrintHighQuality: hasPermissionFlag(
        permissions,
        PdfPermissionFlag.PrintHighQuality,
        isEncrypted,
      ),
    }),
    [isEncrypted, isOwnerUnlocked, permissions],
  );

  const api = useMemo<DocumentPermissionsAPIWrapper>(
    () => ({
      hasPermission: (flag: PdfPermissionFlag) =>
        hasPermissionFlag(permissions, flag, isEncrypted),
      hasAllPermissions: (flags: PdfPermissionFlag[]) =>
        flags.every((flag) =>
          hasPermissionFlag(permissions, flag, isEncrypted),
        ),
      getEffectivePermission: (flag: PdfPermissionFlag) => {
        if (isOwnerUnlocked) return true;
        return hasPermissionFlag(permissions, flag, isEncrypted);
      },
    }),
    [permissions, isOwnerUnlocked, isEncrypted],
  );

  useEffect(() => {
    if (documentReady) {
      registerBridge("permissions", {
        state,
        api,
      });
    }

    return () => {
      registerBridge("permissions", null);
    };
  }, [registerBridge, state, api, documentReady]);

  return null;
}

export { PdfPermissionFlag };
