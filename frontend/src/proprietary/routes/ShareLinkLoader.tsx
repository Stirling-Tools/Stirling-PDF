import { useEffect, useMemo, useRef } from "react";
import { isAxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import { useAuth } from "@app/auth/UseSession";
import { useFileActions } from "@app/contexts/FileContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { alert } from "@app/components/toast";
import type { StirlingFile } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import { fileStorage } from "@app/services/fileStorage";
import {
  getShareBundleEntryRootId,
  isZipBundle,
  loadShareBundleEntries,
  parseContentDispositionFilename,
} from "@app/services/shareBundleUtils";
import { getHeaderString } from "@app/utils/httpHeaderUtils";

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

        const contentType = getHeaderString(
          response.headers,
          "content-type",
          "Content-Type",
        );
        const disposition = getHeaderString(
          response.headers,
          "content-disposition",
          "Content-Disposition",
        );
        const filename =
          parseContentDispositionFilename(disposition) || "shared-file";
        const blob = response.data as Blob;
        const contentTypeValue = contentType || blob.type;

        if (isZipBundle(contentTypeValue, filename)) {
          const bundle = await loadShareBundleEntries(blob);
          if (bundle) {
            const { manifest, rootOrder, sortedEntries, files } = bundle;
            const stirlingFiles = await actions.addFilesWithOptions(files, {
              selectFiles: false,
              autoUnzip: false,
              skipAutoUnzip: false,
              allowDuplicates: true,
            });
            if (signal.aborted) return;

            const idMap = new Map<string, FileId>();
            for (let i = 0; i < stirlingFiles.length; i += 1) {
              idMap.set(sortedEntries[i].logicalId, stirlingFiles[i].fileId);
            }

            const rootIdMap = new Map<string, FileId>();
            for (const rootLogicalId of rootOrder) {
              const mappedId = idMap.get(rootLogicalId);
              if (mappedId) {
                rootIdMap.set(rootLogicalId, mappedId);
              }
            }
            for (let i = 0; i < sortedEntries.length; i += 1) {
              const entry = sortedEntries[i];
              const newId = idMap.get(entry.logicalId);
              if (!newId) continue;
              const parentId = entry.parentLogicalId
                ? idMap.get(entry.parentLogicalId)
                : undefined;
              const rootId =
                rootIdMap.get(getShareBundleEntryRootId(manifest, entry)) ||
                idMap.get(manifest.rootLogicalId) ||
                newId;
              const sharedUpdates = {
                remoteStorageId: shareMetadata?.fileId,
                remoteOwnerUsername: shareMetadata?.owner ?? undefined,
                remoteOwnedByCurrentUser: false,
                remoteAccessRole: shareMetadata?.accessRole ?? undefined,
                remoteSharedViaLink: true,
                remoteHasShareLinks: false,
                remoteShareToken: shareMetadata?.shareToken || normalizedToken,
              };
              actions.updateStirlingFileStub(newId, {
                versionNumber: entry.versionNumber,
                originalFileId: rootId,
                parentFileId: parentId,
                toolHistory: entry.toolHistory,
                isLeaf: entry.isLeaf,
                ...sharedUpdates,
              });
              await fileStorage.updateFileMetadata(newId, {
                versionNumber: entry.versionNumber,
                originalFileId: rootId,
                parentFileId: parentId,
                toolHistory: entry.toolHistory,
                isLeaf: entry.isLeaf,
                ...sharedUpdates,
              });
            }

            const selectedIds: FileId[] = [];
            for (const rootId of rootOrder) {
              const rootEntries = sortedEntries.filter(
                (entry) =>
                  getShareBundleEntryRootId(manifest, entry) === rootId,
              );
              const latestEntry = rootEntries[rootEntries.length - 1];
              if (!latestEntry) {
                continue;
              }
              const latestId = idMap.get(latestEntry.logicalId);
              if (latestId) {
                selectedIds.push(latestId);
              }
            }
            if (selectedIds.length > 0) {
              actions.setSelectedFiles(selectedIds);
            }

            navActions.setWorkbench("viewer");
            navigate("/", { replace: true });
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
        navigate("/", { replace: true });
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
          navigate("/", { replace: true });
        } else if (status === 404 || status === 410) {
          alert({
            alertType: "error",
            title: t("storageShare.expiredTitle", "Link expired"),
            expandable: false,
            durationMs: 4000,
          });
          navigate("/", { replace: true });
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
