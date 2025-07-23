
export const COLOR_TYPES = {
  COLOR: 'color',
  GREYSCALE: 'greyscale',
  BLACK_WHITE: 'blackwhite'
} as const;

export const OUTPUT_OPTIONS = {
  SINGLE: 'single',
  MULTIPLE: 'multiple'
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


// Grouped file extensions for dropdowns
export const FROM_FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF', group: 'Document' },
  { value: 'docx', label: 'DOCX', group: 'Document' },
  { value: 'doc', label: 'DOC', group: 'Document' },
  { value: 'odt', label: 'ODT', group: 'Document' },
  { value: 'xlsx', label: 'XLSX', group: 'Spreadsheet' },
  { value: 'xls', label: 'XLS', group: 'Spreadsheet' },
  { value: 'ods', label: 'ODS', group: 'Spreadsheet' },
  { value: 'pptx', label: 'PPTX', group: 'Presentation' },
  { value: 'ppt', label: 'PPT', group: 'Presentation' },
  { value: 'odp', label: 'ODP', group: 'Presentation' },
  { value: 'jpg', label: 'JPG', group: 'Image' },
  { value: 'jpeg', label: 'JPEG', group: 'Image' },
  { value: 'png', label: 'PNG', group: 'Image' },
  { value: 'gif', label: 'GIF', group: 'Image' },
  { value: 'bmp', label: 'BMP', group: 'Image' },
  { value: 'tiff', label: 'TIFF', group: 'Image' },
  { value: 'webp', label: 'WEBP', group: 'Image' },
  { value: 'html', label: 'HTML', group: 'Web' },
  { value: 'htm', label: 'HTM', group: 'Web' },
  { value: 'md', label: 'MD', group: 'Text' },
  { value: 'txt', label: 'TXT', group: 'Text' },
  { value: 'rtf', label: 'RTF', group: 'Text' },
];

export const TO_FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF', group: 'Document' },
  { value: 'docx', label: 'DOCX', group: 'Document' },
  { value: 'odt', label: 'ODT', group: 'Document' },
  { value: 'pptx', label: 'PPTX', group: 'Presentation' },
  { value: 'odp', label: 'ODP', group: 'Presentation' },
  { value: 'txt', label: 'TXT', group: 'Text' },
  { value: 'rtf', label: 'RTF', group: 'Text' },
  { value: 'png', label: 'PNG', group: 'Image' },
  { value: 'jpg', label: 'JPG', group: 'Image' },
  { value: 'html', label: 'HTML', group: 'Web' },
  { value: 'xml', label: 'XML', group: 'Web' },
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

export type ColorType = typeof COLOR_TYPES[keyof typeof COLOR_TYPES];
export type OutputOption = typeof OUTPUT_OPTIONS[keyof typeof OUTPUT_OPTIONS];