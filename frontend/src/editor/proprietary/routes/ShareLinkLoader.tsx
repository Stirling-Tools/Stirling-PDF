import { useEffect, useMemo, useRef } from "react";
import { isAxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import apiClient from "@editor/services/apiClient";
import { useAuth } from "@editor/auth/UseSession";
import { useFileActions } from "@editor/contexts/FileContext";
import { useNavigationActions } from "@editor/contexts/NavigationContext";
import { alert } from "@editor/components/toast";
import type { StirlingFile } from "@editor/types/fileContext";
import { fileStorage } from "@editor/services/fileStorage";
import { importShareBundle } from "@editor/services/shareBundleImportService";
import { EDITOR_BASENAME } from "@editor/routes/editorBasename";
import {
  isZipBundle,
  loadShareBundleEntries,
  parseContentDispositionFilename,
  readResponseHeader,
} from "@editor/services/shareBundleUtils";

interface ShareLinkLoaderProps {
  token: string;
}

interface ShareLinkMetadata {
  shareToken?: string;
  fileId?: number;
  fileName?: string;
  owner?: string | null;
  ownedByCurrentUser?: boolean;
  accessRole?: string | null;
  expiresAt?: string;
}

export default function ShareLinkLoader({ token }: ShareLinkLoaderProps) {
  const { actions } = useFileActions();
  const { actions: navActions } = useNavigationActions();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const handledTokenRef = useRef<string | null>(null);

  const normalizedToken = useMemo(() => token.trim(), [token]);
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    if (!normalizedToken) {
      return;
    }
    if (handledTokenRef.current === normalizedToken) {
      return;
    }
    handledTokenRef.current = normalizedToken;

    const abortController = new AbortController();
    const { signal } = abortController;

    const loadSharedFile = async () => {
      try {
        let shareMetadata: ShareLinkMetadata | null = null;
        try {
          const metadataResponse = await apiClient.get<ShareLinkMetadata>(
            `/api/v1/storage/share-links/${normalizedToken}/metadata`,
            { suppressErrorToast: true, skipAuthRedirect: true, signal },
          );
          shareMetadata = metadataResponse.data;
        } catch {
          shareMetadata = null;
        }

        const response = await apiClient.get(
          `/api/v1/storage/share-links/${normalizedToken}`,
          {
            responseType: "blob",
            suppressErrorToast: true,
            skipAuthRedirect: true,
            signal,
          },
        );
        if (signal.aborted) return;

        const contentType = readResponseHeader(
          response.headers,
          "content-type",
        );
        const disposition = readResponseHeader(
          response.headers,
          "content-disposition",
        );
        const filename =
          parseContentDispositionFilename(disposition) || "shared-file";
        const blob = response.data as Blob;
        const contentTypeValue = contentType || blob.type;

        if (isZipBundle(contentTypeValue, filename)) {
          const bundle = await loadShareBundleEntries(blob);
          if (bundle) {
            const currentFiles = await importShareBundle(
              bundle,
              {
                addFiles: (files) =>
                  actions.addFilesWithOptions(files, {
                    selectFiles: false,
                    autoUnzip: false,
                    skipAutoUnzip: false,
                    allowDuplicates: true,
                  }),
                updateStub: actions.updateStirlingFileStub,
                isCancelled: () => signal.aborted,
              },
              {
                remoteStorageId: shareMetadata?.fileId,
                remoteOwnerUsername: shareMetadata?.owner ?? undefined,
                remoteOwnedByCurrentUser: false,
                remoteAccessRole: shareMetadata?.accessRole ?? undefined,
                remoteSharedViaLink: true,
                remoteHasShareLinks: false,
                remoteShareToken: shareMetadata?.shareToken || normalizedToken,
              },
            );
            if (signal.aborted) return;

            const selectedIds = currentFiles.map(({ file }) => file.fileId);
            if (selectedIds.length > 0) {
              actions.setSelectedFiles(selectedIds);
            }

            navActions.setWorkbench("viewer");
            navigate(EDITOR_BASENAME, { replace: true });
            return;
          }
        }

        const file = new File([blob], filename, {
          type: contentTypeValue || blob.type,
        });
        const stirlingFiles = await actions.addFilesWithOptions([file], {
          selectFiles: true,
          autoUnzip: false,
          skipAutoUnzip: false,
        });
        if (signal.aborted) return;

        if (stirlingFiles.length > 0) {
          const ids = stirlingFiles.map(
            (stirlingFile: StirlingFile) => stirlingFile.fileId,
          );
          actions.setSelectedFiles(ids);
          const sharedUpdates = {
            remoteStorageId: shareMetadata?.fileId,
            remoteOwnerUsername: shareMetadata?.owner ?? undefined,
            remoteOwnedByCurrentUser: false,
            remoteAccessRole: shareMetadata?.accessRole ?? undefined,
            remoteSharedViaLink: true,
            remoteHasShareLinks: false,
            remoteShareToken: shareMetadata?.shareToken || normalizedToken,
          };
          for (const fileId of ids) {
            actions.updateStirlingFileStub(fileId, sharedUpdates);
            await fileStorage.updateFileMetadata(fileId, sharedUpdates);
          }
        }

        navActions.setWorkbench("viewer");
        navigate(EDITOR_BASENAME, { replace: true });
      } catch (error: unknown) {
        if (signal.aborted) return;
        const status = isAxiosError(error) ? error.response?.status : undefined;
        if (status === 401 || status === 403) {
          if (!isAuthenticated && !authLoading) {
            alert({
              alertType: "warning",
              title: t(
                "storageShare.requiresLogin",
                "This shared file requires login.",
              ),
              expandable: false,
              durationMs: 4000,
            });
            navigate("/login", {
              replace: true,
              state: { from: { pathname: `/share/${normalizedToken}` } },
            });
            return;
          }
          alert({
            alertType: "warning",
            title: t(
              "storageShare.accessDenied",
              "You do not have access to this shared file. Ask the owner to share it with you.",
            ),
            expandable: false,
            durationMs: 4500,
          });
          navigate(EDITOR_BASENAME, { replace: true });
        } else if (status === 404 || status === 410) {
          alert({
            alertType: "error",
            title: t("storageShare.expiredTitle", "Link expired"),
            expandable: false,
            durationMs: 4000,
          });
          navigate(EDITOR_BASENAME, { replace: true });
        } else {
          alert({
            alertType: "error",
            title: t("storageShare.loadFailed", "Unable to open shared file."),
            expandable: false,
            durationMs: 4000,
          });
        }
      }
    };

    loadSharedFile();

    return () => {
      abortController.abort();
    };
  }, [
    normalizedToken,
    actions,
    navActions,
    navigate,
    t,
    isAuthenticated,
    authLoading,
  ]);

  return null;
}
