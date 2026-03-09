import React from 'react';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded';
import SlideshowRoundedIcon from '@mui/icons-material/SlideshowRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';

export interface FileIconInfo {
  icon: React.ReactNode;
  color: string;
  label: string;
}

export function getFileIconInfo(name: string, iconSize = '1.125rem'): FileIconInfo {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const sx = { fontSize: iconSize };
  switch (ext) {
    case 'pdf':
      return { icon: <PictureAsPdfRoundedIcon sx={sx} />, color: '#e03131', label: 'PDF' };
    case 'doc':
    case 'docx':
      return { icon: <DescriptionRoundedIcon sx={sx} />, color: '#1971c2', label: 'Word' };
    case 'xls':
    case 'xlsx':
    case 'csv':
      return { icon: <TableChartRoundedIcon sx={sx} />, color: '#2f9e44', label: 'Excel' };
    case 'ppt':
    case 'pptx':
      return { icon: <SlideshowRoundedIcon sx={sx} />, color: '#e8590c', label: 'PowerPoint' };
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'tiff':
    case 'bmp':
      return { icon: <ImageRoundedIcon sx={sx} />, color: '#7048e8', label: 'Image' };
    default:
      return { icon: <InsertDriveFileRoundedIcon sx={sx} />, color: '#868e96', label: ext.toUpperCase() || 'File' };
  }
}
