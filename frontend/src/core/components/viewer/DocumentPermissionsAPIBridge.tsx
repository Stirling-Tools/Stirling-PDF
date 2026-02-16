import { useEffect, useMemo } from 'react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';
import {
  PdfPermissionFlag,
  DocumentPermissionsState,
  DocumentPermissionsAPIWrapper,
} from '@app/contexts/viewer/viewerBridges';

function hasPermissionFlag(permissions: number, flag: PdfPermissionFlag): boolean {
  if (permissions === 0 || permissions === PdfPermissionFlag.AllowAll) {
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

  const state = useMemo<DocumentPermissionsState>(() => ({
    isEncrypted,
    isOwnerUnlocked,
    permissions,
    canPrint: hasPermissionFlag(permissions, PdfPermissionFlag.Print),
    canModifyContents: hasPermissionFlag(permissions, PdfPermissionFlag.ModifyContents),
    canCopyContents: hasPermissionFlag(permissions, PdfPermissionFlag.CopyContents),
    canModifyAnnotations: hasPermissionFlag(permissions, PdfPermissionFlag.ModifyAnnotations),
    canFillForms: hasPermissionFlag(permissions, PdfPermissionFlag.FillForms),
    canExtractForAccessibility: hasPermissionFlag(permissions, PdfPermissionFlag.ExtractForAccessibility),
    canAssembleDocument: hasPermissionFlag(permissions, PdfPermissionFlag.AssembleDocument),
    canPrintHighQuality: hasPermissionFlag(permissions, PdfPermissionFlag.PrintHighQuality),
  }), [isEncrypted, isOwnerUnlocked, permissions]);

  const api = useMemo<DocumentPermissionsAPIWrapper>(() => ({
    hasPermission: (flag: PdfPermissionFlag) => hasPermissionFlag(permissions, flag),
    hasAllPermissions: (flags: PdfPermissionFlag[]) =>
      flags.every(flag => hasPermissionFlag(permissions, flag)),
    getEffectivePermission: (flag: PdfPermissionFlag) => {
      if (isOwnerUnlocked) return true;
      return hasPermissionFlag(permissions, flag);
    },
  }), [permissions, isOwnerUnlocked]);

  useEffect(() => {
    if (documentReady) {
      registerBridge('permissions', {
        state,
        api,
      });
    }

    return () => {
      registerBridge('permissions', null);
    };
  }, [registerBridge, state, api, documentReady]);

  return null;
}

export { PdfPermissionFlag };
