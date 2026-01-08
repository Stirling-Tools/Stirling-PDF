import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import JSZip from 'jszip';

import apiClient from '@app/services/apiClient';
import { useFileActions } from '@app/contexts/FileContext';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { alert } from '@app/components/toast';
import type { StirlingFile } from '@app/types/fileContext';
import type { FileId } from '@app/types/file';
import { fileStorage } from '@app/services/fileStorage';
import type { ShareBundleManifest } from '@app/services/serverStorageBundle';

interface ShareLinkLoaderProps {
  token: string;
}

interface ShareLinkMetadata {
  shareToken?: string;
  fileId?: number;
  fileName?: string;
  owner?: string | null;
  ownedByCurrentUser?: boolean;
}

function parseFilename(disposition: string | undefined): string | null {
  if (!disposition) return null;
  const filenameMatch = /filename="([^"]+)"/i.exec(disposition);
  if (filenameMatch?.[1]) return filenameMatch[1];
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch (_e) {
      return utf8Match[1];
    }
  }
  return null;
}

export default function ShareLinkLoader({ token }: ShareLinkLoaderProps) {
  const { actions } = useFileActions();
  const { actions: navActions } = useNavigationActions();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const handledTokenRef = useRef<string | null>(null);

  const normalizedToken = useMemo(() => token.trim(), [token]);

  useEffect(() => {
    if (!normalizedToken) {
      return;
    }
    if (handledTokenRef.current === normalizedToken) {
      return;
    }
    handledTokenRef.current = normalizedToken;
    let isMounted = true;

    const loadSharedFile = async () => {
      try {
        let shareMetadata: ShareLinkMetadata | null = null;
        try {
          const metadataResponse = await apiClient.get<ShareLinkMetadata>(
            `/api/v1/storage/share-links/${normalizedToken}/metadata`,
            { suppressErrorToast: true, skipAuthRedirect: true } as any
          );
          shareMetadata = metadataResponse.data;
        } catch {
          shareMetadata = null;
        }

        const response = await apiClient.get(`/api/v1/storage/share-links/${normalizedToken}`, {
          responseType: 'blob',
          suppressErrorToast: true,
          skipAuthRedirect: true,
        } as any);
        if (!isMounted) return;

        if (!shareMetadata) {
          try {
            const metadataResponse = await apiClient.get<ShareLinkMetadata>(
              `/api/v1/storage/share-links/${normalizedToken}/metadata`,
              { suppressErrorToast: true, skipAuthRedirect: true } as any
            );
            shareMetadata = metadataResponse.data;
          } catch {
            shareMetadata = null;
          }
        }

        const contentType =
          (response.headers && (response.headers['content-type'] || response.headers['Content-Type'])) ||
          '';
        const disposition =
          (response.headers &&
            (response.headers['content-disposition'] || response.headers['Content-Disposition'])) ||
          '';
        const filename = parseFilename(disposition) || 'shared-file';
        const blob = response.data as Blob;
        const contentTypeValue = contentType || blob.type;

        const isZip =
          contentTypeValue.includes('zip') || filename.toLowerCase().endsWith('.zip');

        if (isZip) {
          const zip = await JSZip.loadAsync(blob);
          const manifestEntry = zip.file('stirling-share.json');
          if (manifestEntry) {
            const manifestText = await manifestEntry.async('text');
            const manifest = JSON.parse(manifestText) as ShareBundleManifest;
            const entryRootId = (entry: ShareBundleManifest['entries'][number]) =>
              entry.rootLogicalId || manifest.rootLogicalId;
            const rootOrder =
              manifest.rootLogicalIds && manifest.rootLogicalIds.length > 0
                ? manifest.rootLogicalIds
                : Array.from(new Set(manifest.entries.map(entryRootId)));
            const sortedEntries: ShareBundleManifest['entries'] = [];
            for (const rootId of rootOrder) {
              const rootEntries = manifest.entries
                .filter((entry) => entryRootId(entry) === rootId)
                .sort((a, b) => a.versionNumber - b.versionNumber);
              sortedEntries.push(...rootEntries);
            }

            const files: File[] = [];
            for (const entry of sortedEntries) {
              const zipEntry = zip.file(entry.filePath);
              if (!zipEntry) {
                throw new Error(`Missing file entry ${entry.filePath}`);
              }
              const fileBlob = await zipEntry.async('blob');
              files.push(
                new File([fileBlob], entry.name, {
                  type: entry.type,
                  lastModified: entry.lastModified,
                })
              );
            }

            const stirlingFiles = await actions.addFilesWithOptions(files, {
              selectFiles: false,
              autoUnzip: false,
              skipAutoUnzip: false,
              allowDuplicates: true,
            });
            if (!isMounted) return;

            const idMap = new Map<string, FileId>();
            for (let i = 0; i < stirlingFiles.length; i += 1) {
              idMap.set(sortedEntries[i].logicalId, stirlingFiles[i].fileId as FileId);
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
                rootIdMap.get(entryRootId(entry)) ||
                idMap.get(manifest.rootLogicalId) ||
                newId;
              const sharedUpdates = {
                remoteStorageId: shareMetadata?.fileId,
                remoteOwnerUsername: shareMetadata?.owner ?? undefined,
                remoteOwnedByCurrentUser: false,
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
                (entry) => entryRootId(entry) === rootId
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

            navActions.setWorkbench('viewer');
            navigate('/', { replace: true });
            return;
          }
        }

        const file = new File([blob], filename, { type: contentTypeValue || blob.type });
        const stirlingFiles = await actions.addFilesWithOptions([file], {
          selectFiles: true,
          autoUnzip: false,
          skipAutoUnzip: false,
        });
        if (!isMounted) return;

        if (stirlingFiles.length > 0) {
          const ids = stirlingFiles.map((stirlingFile: StirlingFile) => stirlingFile.fileId);
          actions.setSelectedFiles(ids);
          const sharedUpdates = {
            remoteStorageId: shareMetadata?.fileId,
            remoteOwnerUsername: shareMetadata?.owner ?? undefined,
            remoteOwnedByCurrentUser: false,
            remoteSharedViaLink: true,
            remoteHasShareLinks: false,
            remoteShareToken: shareMetadata?.shareToken || normalizedToken,
          };
          for (const fileId of ids) {
            actions.updateStirlingFileStub(fileId, sharedUpdates);
            await fileStorage.updateFileMetadata(fileId, sharedUpdates);
          }
        }

        navActions.setWorkbench('viewer');
        navigate('/', { replace: true });
      } catch (error: any) {
        if (!isMounted) return;
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
          alert({
            alertType: 'warning',
            title: t('storageShare.requiresLogin', 'This shared file requires login.'),
            expandable: false,
            durationMs: 4000,
          });
          navigate('/login', {
            replace: true,
            state: { from: { pathname: `/share/${normalizedToken}` } },
          });
        } else {
          alert({
            alertType: 'error',
            title: t('storageShare.loadFailed', 'Unable to open shared file.'),
            expandable: false,
            durationMs: 4000,
          });
        }
      }
    };

    loadSharedFile();

    return () => {
      isMounted = false;
    };
  }, [normalizedToken, actions, navActions, navigate, t]);

  return null;
}
