import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '@app/services/apiClient';
import type { ToolOperationHook } from '@app/hooks/tools/shared/useToolOperation';
import type { StirlingFile } from '@app/types/fileContext';
import { extractErrorMessage } from '@app/utils/toolErrorHandler';
import type { ShowJSParameters } from '@app/hooks/tools/showJS/useShowJSParameters';

export interface ShowJSOperationHook extends ToolOperationHook<ShowJSParameters> {
	scriptText: string | null;
}

export const useShowJSOperation = (): ShowJSOperationHook => {
	const { t } = useTranslation();

	const [isLoading, setIsLoading] = useState(false);
	const [status, setStatus] = useState('');
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [files, setFiles] = useState<File[]>([]);
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [downloadFilename, setDownloadFilename] = useState('');
	const [scriptText, setScriptText] = useState<string | null>(null);

	const cancelRequested = useRef(false);
	const previousUrl = useRef<string | null>(null);

	const cleanupDownloadUrl = useCallback(() => {
		if (previousUrl.current) {
			URL.revokeObjectURL(previousUrl.current);
			previousUrl.current = null;
		}
	}, []);

	const resetResults = useCallback(() => {
		cancelRequested.current = false;
		setScriptText(null);
		setFiles([]);
		cleanupDownloadUrl();
		setDownloadUrl(null);
		setDownloadFilename('');
		setStatus('');
		setErrorMessage(null);
	}, [cleanupDownloadUrl]);

	const clearError = useCallback(() => {
		setErrorMessage(null);
	}, []);

	const executeOperation = useCallback(
		async (_params: ShowJSParameters, selectedFiles: StirlingFile[]) => {
			if (selectedFiles.length === 0) {
				setErrorMessage(t('noFileSelected', 'No files selected'));
				return;
			}

			cancelRequested.current = false;
			setIsLoading(true);
			setStatus(t('showJS.processing', 'Extracting JavaScript...'));
			setErrorMessage(null);
			setScriptText(null);
			setFiles([]);
			cleanupDownloadUrl();
			setDownloadUrl(null);
			setDownloadFilename('');

			try {
				const file = selectedFiles[0];
				const formData = new FormData();
				formData.append('fileInput', file);

				const response = await apiClient.post('/api/v1/misc/show-javascript', formData, {
					headers: { 'Content-Type': 'multipart/form-data' },
					responseType: 'text',
				});

				const text: string = typeof response.data === 'string' ? response.data : '';
				setScriptText(text);

				// Optional: prepare a downloadable file
				const outFile = new File([text], (file.name?.replace(/\.[^.]+$/, '') || 'extracted') + '.js', {
					type: 'application/javascript',
				});
				setFiles([outFile]);
				const blobUrl = URL.createObjectURL(outFile);
				previousUrl.current = blobUrl;
				setDownloadUrl(blobUrl);
				setDownloadFilename(outFile.name);

				setStatus(t('showJS.done', 'JavaScript extracted'));
			} catch (error: unknown) {
				setErrorMessage(extractErrorMessage(error));
				setStatus('');
			} finally {
				setIsLoading(false);
			}
		},
		[t, cleanupDownloadUrl]
	);

	const cancelOperation = useCallback(() => {
		cancelRequested.current = true;
		setIsLoading(false);
		setStatus(t('operationCancelled', 'Operation cancelled'));
	}, [t]);

	const undoOperation = useCallback(async () => {
		// No-op for this tool
		setStatus(t('nothingToUndo', 'Nothing to undo'));
	}, [t]);

	return {
		// State (align with ToolOperationHook)
		files,
		thumbnails: [],
		isGeneratingThumbnails: false,
		downloadUrl,
		downloadFilename,
		isLoading,
		status,
		errorMessage,
		progress: null,
		willUseCloud: false,

		// Custom state
		scriptText,

		// Actions
		executeOperation,
		resetResults,
		clearError,
		cancelOperation,
		undoOperation,
	};
};


