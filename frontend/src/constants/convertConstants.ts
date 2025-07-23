export const FROM_FORMATS = {
  PDF: 'pdf',
  OFFICE: 'office',
  IMAGE: 'image',
  HTML: 'html',
  MARKDOWN: 'markdown',
  TEXT: 'text'
} as const;

export const TO_FORMATS = {
  PDF: 'pdf',
  IMAGE: 'image',
  OFFICE_WORD: 'office-word',
  OFFICE_PRESENTATION: 'office-presentation',
  OFFICE_TEXT: 'office-text',
  HTML: 'html',
  XML: 'xml'
} as const;

export const COLOR_TYPES = {
  COLOR: 'color',
  GREYSCALE: 'greyscale',
  BLACK_WHITE: 'blackwhite'
} as const;

export const OUTPUT_OPTIONS = {
  SINGLE: 'single',
  MULTIPLE: 'multiple'
} as const;

export const OFFICE_FORMATS = {
  DOCX: 'docx',
  ODT: 'odt',
  PPTX: 'pptx',
  ODP: 'odp',
  TXT: 'txt',
  RTF: 'rtf'
} as const;

export const CONVERSION_ENDPOINTS = {
  'office-pdf': '/api/v1/convert/file/pdf',
  'pdf-image': '/api/v1/convert/pdf/img',
  'image-pdf': '/api/v1/convert/img/pdf',
  'pdf-office-word': '/api/v1/convert/pdf/word',
  'pdf-office-presentation': '/api/v1/convert/pdf/presentation',
  'pdf-office-text': '/api/v1/convert/pdf/text',
  'pdf-html': '/api/v1/convert/pdf/html',
  'pdf-xml': '/api/v1/convert/pdf/xml',
  'html-pdf': '/api/v1/convert/html/pdf',
  'markdown-pdf': '/api/v1/convert/markdown/pdf'
} as const;

export const ENDPOINT_NAMES = {
  'office-pdf': 'file-to-pdf',
  'pdf-image': 'pdf-to-img',
  'image-pdf': 'img-to-pdf',
  'pdf-office-word': 'pdf-to-word',
  'pdf-office-presentation': 'pdf-to-presentation',
  'pdf-office-text': 'pdf-to-text',
  'pdf-html': 'pdf-to-html',
  'pdf-xml': 'pdf-to-xml',
  'html-pdf': 'html-to-pdf',
  'markdown-pdf': 'markdown-to-pdf'
} as const;

export const SUPPORTED_CONVERSIONS: Record<string, string[]> = {
  [FROM_FORMATS.PDF]: [TO_FORMATS.IMAGE, TO_FORMATS.OFFICE_WORD, TO_FORMATS.OFFICE_PRESENTATION, TO_FORMATS.OFFICE_TEXT, TO_FORMATS.HTML, TO_FORMATS.XML],
  [FROM_FORMATS.OFFICE]: [TO_FORMATS.PDF],
  [FROM_FORMATS.IMAGE]: [TO_FORMATS.PDF],
  [FROM_FORMATS.HTML]: [TO_FORMATS.PDF],
  [FROM_FORMATS.MARKDOWN]: [TO_FORMATS.PDF],
  [FROM_FORMATS.TEXT]: [TO_FORMATS.PDF]
};

export const FILE_EXTENSIONS = {
  [FROM_FORMATS.PDF]: ['pdf'],
  [FROM_FORMATS.OFFICE]: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'],
  [FROM_FORMATS.IMAGE]: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'],
  [FROM_FORMATS.HTML]: ['html', 'htm'],
  [FROM_FORMATS.MARKDOWN]: ['md'],
  [FROM_FORMATS.TEXT]: ['txt', 'rtf']
};

// Grouped file extensions for dropdowns
export const FROM_FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF', group: 'Document' },
  { value: 'docx', label: 'Word Document (.docx)', group: 'Office Documents' },
  { value: 'doc', label: 'Word Document (.doc)', group: 'Office Documents' },
  { value: 'xlsx', label: 'Excel Spreadsheet (.xlsx)', group: 'Office Documents' },
  { value: 'xls', label: 'Excel Spreadsheet (.xls)', group: 'Office Documents' },
  { value: 'pptx', label: 'PowerPoint (.pptx)', group: 'Office Documents' },
  { value: 'ppt', label: 'PowerPoint (.ppt)', group: 'Office Documents' },
  { value: 'odt', label: 'OpenDocument Text (.odt)', group: 'Office Documents' },
  { value: 'ods', label: 'OpenDocument Spreadsheet (.ods)', group: 'Office Documents' },
  { value: 'odp', label: 'OpenDocument Presentation (.odp)', group: 'Office Documents' },
  { value: 'jpg', label: 'JPEG Image (.jpg)', group: 'Images' },
  { value: 'jpeg', label: 'JPEG Image (.jpeg)', group: 'Images' },
  { value: 'png', label: 'PNG Image (.png)', group: 'Images' },
  { value: 'gif', label: 'GIF Image (.gif)', group: 'Images' },
  { value: 'bmp', label: 'BMP Image (.bmp)', group: 'Images' },
  { value: 'tiff', label: 'TIFF Image (.tiff)', group: 'Images' },
  { value: 'webp', label: 'WebP Image (.webp)', group: 'Images' },
  { value: 'html', label: 'HTML (.html)', group: 'Web' },
  { value: 'htm', label: 'HTML (.htm)', group: 'Web' },
  { value: 'md', label: 'Markdown (.md)', group: 'Text' },
  { value: 'txt', label: 'Text File (.txt)', group: 'Text' },
  { value: 'rtf', label: 'Rich Text Format (.rtf)', group: 'Text' },
];

export const TO_FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF', group: 'Document' },
  { value: 'docx', label: 'Word Document (.docx)', group: 'Office Documents' },
  { value: 'odt', label: 'OpenDocument Text (.odt)', group: 'Office Documents' },
  { value: 'pptx', label: 'PowerPoint (.pptx)', group: 'Office Documents' },
  { value: 'odp', label: 'OpenDocument Presentation (.odp)', group: 'Office Documents' },
  { value: 'txt', label: 'Text File (.txt)', group: 'Text' },
  { value: 'rtf', label: 'Rich Text Format (.rtf)', group: 'Text' },
  { value: 'png', label: 'PNG Image (.png)', group: 'Images' },
  { value: 'jpg', label: 'JPEG Image (.jpg)', group: 'Images' },
  { value: 'html', label: 'HTML (.html)', group: 'Web' },
  { value: 'xml', label: 'XML (.xml)', group: 'Web' },
];

// Conversion matrix - what each source format can convert to
export const CONVERSION_MATRIX: Record<string, string[]> = {
  'pdf': ['png', 'jpg', 'docx', 'odt', 'pptx', 'odp', 'txt', 'rtf', 'html', 'xml'],
  'docx': ['pdf'], 'doc': ['pdf'], 'odt': ['pdf'],
  'xlsx': ['pdf'], 'xls': ['pdf'], 'ods': ['pdf'],
  'pptx': ['pdf'], 'ppt': ['pdf'], 'odp': ['pdf'],
  'jpg': ['pdf'], 'jpeg': ['pdf'], 'png': ['pdf'], 'gif': ['pdf'], 'bmp': ['pdf'], 'tiff': ['pdf'], 'webp': ['pdf'],
  'html': ['pdf'], 'htm': ['pdf'],
  'md': ['pdf'],
  'txt': ['pdf'], 'rtf': ['pdf']
};

// Map extensions to endpoint keys
export const EXTENSION_TO_ENDPOINT: Record<string, Record<string, string>> = {
  'pdf': {
    'png': 'pdf-to-img', 'jpg': 'pdf-to-img',
    'docx': 'pdf-to-word', 'odt': 'pdf-to-word',
    'pptx': 'pdf-to-presentation', 'odp': 'pdf-to-presentation',
    'txt': 'pdf-to-text', 'rtf': 'pdf-to-text',
    'html': 'pdf-to-html', 'xml': 'pdf-to-xml'
  },
  'docx': { 'pdf': 'file-to-pdf' }, 'doc': { 'pdf': 'file-to-pdf' }, 'odt': { 'pdf': 'file-to-pdf' },
  'xlsx': { 'pdf': 'file-to-pdf' }, 'xls': { 'pdf': 'file-to-pdf' }, 'ods': { 'pdf': 'file-to-pdf' },
  'pptx': { 'pdf': 'file-to-pdf' }, 'ppt': { 'pdf': 'file-to-pdf' }, 'odp': { 'pdf': 'file-to-pdf' },
  'jpg': { 'pdf': 'img-to-pdf' }, 'jpeg': { 'pdf': 'img-to-pdf' }, 'png': { 'pdf': 'img-to-pdf' }, 
  'gif': { 'pdf': 'img-to-pdf' }, 'bmp': { 'pdf': 'img-to-pdf' }, 'tiff': { 'pdf': 'img-to-pdf' }, 'webp': { 'pdf': 'img-to-pdf' },
  'html': { 'pdf': 'html-to-pdf' }, 'htm': { 'pdf': 'html-to-pdf' },
  'md': { 'pdf': 'markdown-to-pdf' },
  'txt': { 'pdf': 'file-to-pdf' }, 'rtf': { 'pdf': 'file-to-pdf' }
};

export type FromFormat = typeof FROM_FORMATS[keyof typeof FROM_FORMATS];
export type ToFormat = typeof TO_FORMATS[keyof typeof TO_FORMATS];
export type ColorType = typeof COLOR_TYPES[keyof typeof COLOR_TYPES];
export type OutputOption = typeof OUTPUT_OPTIONS[keyof typeof OUTPUT_OPTIONS];
export type OfficeFormat = typeof OFFICE_FORMATS[keyof typeof OFFICE_FORMATS];