import React from 'react';
import JavascriptIcon from '@mui/icons-material/Javascript';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import type { StirlingFileStub } from '@app/types/fileContext';

type FileLike = File | StirlingFileStub;

function getExtension(name: string): string {
	const lastDot = name.lastIndexOf('.');
	return lastDot >= 0 ? name.slice(lastDot + 1).toLowerCase() : '';
}

/**
 * Returns an appropriate file type icon for the provided file.
 * - Uses the real file type and extension to decide the icon.
 * - No any-casts; accepts File or StirlingFileStub.
 */
export function getFileTypeIcon(file: FileLike, size: number | string = '2rem'): React.ReactElement {
	const name = (file?.name ?? '').toLowerCase();
	const mime = (file?.type ?? '').toLowerCase();
	const ext = getExtension(name);

	// JavaScript
	if (ext === 'js' || mime.includes('javascript')) {
		return <JavascriptIcon style={{ fontSize: size, color: 'var(--mantine-color-gray-6)' }} />;
	}

	// PDF
	if (ext === 'pdf' || mime === 'application/pdf') {
		return <PictureAsPdfIcon style={{ fontSize: size, color: 'var(--mantine-color-gray-6)' }} />;
	}

	// Fallback generic
	return <InsertDriveFileIcon style={{ fontSize: size, color: 'var(--mantine-color-gray-6)' }} />;
}


