import { useEffect, useMemo } from "react";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useDocumentReady } from "@editor/components/viewer/hooks/useDocumentReady";
import {
  PdfPermissionFlag,
  DocumentPermissionsState,
  DocumentPermissionsAPIWrapper,
} from "@editor/contexts/viewer/viewerBridges";

function hasPermissionFlag(
  permissions: number,
  flag: PdfPermissionFlag,
): boolean {
  if (permissions === PdfPermissionFlag.AllowAll) {
    return true;
  }
  return (permissions & flag) !== 0;
}

interface DocumentPermissionsAPIBridgeProps {
  isEncrypted?: boolean;
  isOwnerUnlocked?: boolean;
  honorOwnerPasswords?: boolean;
  permissions?: number;
}

export function DocumentPermissionsAPIBridge({
  isEncrypted = false,
  isOwnerUnlocked = false,
  honorOwnerPasswords = true,
  permissions = PdfPermissionFlag.AllowAll,
}: DocumentPermissionsAPIBridgeProps) {
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  const effectivePermissions =
    !isEncrypted || isOwnerUnlocked || !honorOwnerPasswords
      ? PdfPermissionFlag.AllowAll
      : permissions;

  const state = useMemo<DocumentPermissionsState>(
    () => ({
      isEncrypted,
      isOwnerUnlocked,
      permissions,
      canPrint: hasPermissionFlag(
        effectivePermissions,
        PdfPermissionFlag.Print,
      ),
      canModifyContents: hasPermissionFlag(
        effectivePermissions,
        PdfPermissionFlag.ModifyContents,
      ),
      canCopyContents: hasPermissionFlag(
        effectivePermissions,
        PdfPermissionFlag.CopyContents,
      ),
      canModifyAnnotations: hasPermissionFlag(
        effectivePermissions,
        PdfPermissionFlag.ModifyAnnotations,
      ),
      canFillForms: hasPermissionFlag(
        effectivePermissions,
        PdfPermissionFlag.FillForms,
      ),
      canExtractForAccessibility: hasPermissionFlag(
        effectivePermissions,
        PdfPermissionFlag.ExtractForAccessibility,
      ),
      canAssembleDocument: hasPermissionFlag(
        effectivePermissions,
        PdfPermissionFlag.AssembleDocument,
      ),
      canPrintHighQuality: hasPermissionFlag(
        effectivePermissions,
        PdfPermissionFlag.PrintHighQuality,
      ),
    }),
    [isEncrypted, isOwnerUnlocked, permissions, effectivePermissions],
  );

  const api = useMemo<DocumentPermissionsAPIWrapper>(
    () => ({
      hasPermission: (flag: PdfPermissionFlag) =>
        hasPermissionFlag(effectivePermissions, flag),
      hasAllPermissions: (flags: PdfPermissionFlag[]) =>
        flags.every((flag) => hasPermissionFlag(effectivePermissions, flag)),
      getEffectivePermission: (flag: PdfPermissionFlag) => {
        if (isOwnerUnlocked) return true;
        return hasPermissionFlag(effectivePermissions, flag);
      },
    }),
    [effectivePermissions, isOwnerUnlocked],
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
