import React from 'react';
import ImageIcon from '@mui/icons-material/Image';
import TableChartIcon from '@mui/icons-material/TableChart';
import ArticleIcon from '@mui/icons-material/Article';
import CodeIcon from '@mui/icons-material/Code';
import DataObjectIcon from '@mui/icons-material/DataObject';
import HtmlIcon from '@mui/icons-material/Html';

import type { NonPdfFileType } from '@app/utils/fileUtils';

export interface FileTypeMeta {
  label: string;
  icon: React.ReactNode;
  color: string; // Mantine color name (e.g. 'teal', 'violet')
  accentColor: string;
  borderColor: string;
  bgColor: string;
  textColor: string;
}

export function getFileTypeMeta(type: NonPdfFileType): FileTypeMeta {
  switch (type) {
    case 'image':
      return {
        label: 'Image',
        icon: React.createElement(ImageIcon, { fontSize: 'small' }),
        color: 'violet',
        accentColor: 'var(--mantine-color-violet-6)',
        borderColor: 'var(--mantine-color-violet-3)',
        bgColor: 'var(--mantine-color-violet-0)',
        textColor: 'var(--mantine-color-violet-9)',
      };
    case 'csv':
      return {
        label: 'Spreadsheet',
        icon: React.createElement(TableChartIcon, { fontSize: 'small' }),
        color: 'teal',
        accentColor: 'var(--mantine-color-teal-6)',
        borderColor: 'var(--mantine-color-teal-3)',
        bgColor: 'var(--mantine-color-teal-0)',
        textColor: 'var(--mantine-color-teal-9)',
      };
    case 'json':
      return {
        label: 'JSON',
        icon: React.createElement(DataObjectIcon, { fontSize: 'small' }),
        color: 'yellow',
        accentColor: 'var(--mantine-color-yellow-6)',
        borderColor: 'var(--mantine-color-yellow-3)',
        bgColor: 'var(--mantine-color-yellow-0)',
        textColor: 'var(--mantine-color-yellow-9)',
      };
    case 'markdown':
      return {
        label: 'Markdown',
        icon: React.createElement(CodeIcon, { fontSize: 'small' }),
        color: 'indigo',
        accentColor: 'var(--mantine-color-indigo-6)',
        borderColor: 'var(--mantine-color-indigo-3)',
        bgColor: 'var(--mantine-color-indigo-0)',
        textColor: 'var(--mantine-color-indigo-9)',
      };
    case 'html':
      return {
        label: 'HTML',
        icon: React.createElement(HtmlIcon, { fontSize: 'small' }),
        color: 'orange',
        accentColor: 'var(--mantine-color-orange-6)',
        borderColor: 'var(--mantine-color-orange-3)',
        bgColor: 'var(--mantine-color-orange-0)',
        textColor: 'var(--mantine-color-orange-9)',
      };
    default:
      return {
        label: 'Text',
        icon: React.createElement(ArticleIcon, { fontSize: 'small' }),
        color: 'gray',
        accentColor: 'var(--mantine-color-gray-6)',
        borderColor: 'var(--mantine-color-gray-3)',
        bgColor: 'var(--mantine-color-gray-0)',
        textColor: 'var(--mantine-color-gray-9)',
      };
  }
}
