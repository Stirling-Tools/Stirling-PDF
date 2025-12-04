export interface PdfJsonFontCidSystemInfo {
  registry?: string | null;
  ordering?: string | null;
  supplement?: number | null;
}

export interface PdfJsonTextColor {
  colorSpace?: string | null;
  components?: number[] | null;
}

export interface PdfJsonCosValue {
  type?: string | null;
  value?: unknown;
  items?: PdfJsonCosValue[] | null;
  entries?: Record<string, PdfJsonCosValue | null> | null;
  stream?: PdfJsonStream | null;
}

export interface PdfJsonFont {
  id?: string;
  pageNumber?: number | null;
  uid?: string | null;
  baseName?: string | null;
  subtype?: string | null;
  encoding?: string | null;
  cidSystemInfo?: PdfJsonFontCidSystemInfo | null;
  embedded?: boolean | null;
  program?: string | null;
  programFormat?: string | null;
  webProgram?: string | null;
  webProgramFormat?: string | null;
  pdfProgram?: string | null;
  pdfProgramFormat?: string | null;
  toUnicode?: string | null;
  standard14Name?: string | null;
  fontDescriptorFlags?: number | null;
  ascent?: number | null;
  descent?: number | null;
  capHeight?: number | null;
  xHeight?: number | null;
  italicAngle?: number | null;
  unitsPerEm?: number | null;
  cosDictionary?: PdfJsonCosValue | null;
}

export interface PdfJsonTextElement {
  text?: string | null;
  fontId?: string | null;
  fontSize?: number | null;
  fontMatrixSize?: number | null;
  fontSizeInPt?: number | null;
  characterSpacing?: number | null;
  wordSpacing?: number | null;
  spaceWidth?: number | null;
  zOrder?: number | null;
  horizontalScaling?: number | null;
  leading?: number | null;
  rise?: number | null;
  renderingMode?: number | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  textMatrix?: number[] | null;
  fillColor?: PdfJsonTextColor | null;
  strokeColor?: PdfJsonTextColor | null;
  charCodes?: number[] | null;
  fallbackUsed?: boolean | null;
}

export interface PdfJsonImageElement {
  id?: string | null;
  objectName?: string | null;
  inlineImage?: boolean | null;
  nativeWidth?: number | null;
  nativeHeight?: number | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  left?: number | null;
  right?: number | null;
  top?: number | null;
  bottom?: number | null;
  transform?: number[] | null;
  zOrder?: number | null;
  imageData?: string | null;
  imageFormat?: string | null;
}

export interface PdfJsonStream {
  dictionary?: Record<string, unknown> | null;
  rawData?: string | null;
}

export interface PdfJsonPage {
  pageNumber?: number | null;
  width?: number | null;
  height?: number | null;
  rotation?: number | null;
  mediaBox?: number[] | null;
  cropBox?: number[] | null;
  textElements?: PdfJsonTextElement[] | null;
  imageElements?: PdfJsonImageElement[] | null;
  resources?: unknown;
  contentStreams?: PdfJsonStream[] | null;
}

export interface PdfJsonMetadata {
  title?: string | null;
  author?: string | null;
  subject?: string | null;
  keywords?: string | null;
  creator?: string | null;
  producer?: string | null;
  creationDate?: string | null;
  modificationDate?: string | null;
  trapped?: string | null;
  numberOfPages?: number | null;
}

export interface PdfJsonDocument {
  metadata?: PdfJsonMetadata | null;
  xmpMetadata?: string | null;
  fonts?: PdfJsonFont[] | null;
  pages?: PdfJsonPage[] | null;
  lazyImages?: boolean | null;
}

export interface PdfJsonPageDimension {
  pageNumber?: number | null;
  width?: number | null;
  height?: number | null;
  rotation?: number | null;
}

export interface PdfJsonDocumentMetadata {
  metadata?: PdfJsonMetadata | null;
  xmpMetadata?: string | null;
  fonts?: PdfJsonFont[] | null;
  pageDimensions?: PdfJsonPageDimension[] | null;
  formFields?: unknown[] | null;
  lazyImages?: boolean | null;
}

export interface BoundingBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface TextGroup {
  id: string;
  pageIndex: number;
  fontId?: string | null;
  fontSize?: number | null;
  fontMatrixSize?: number | null;
  lineSpacing?: number | null;
  lineElementCounts?: number[] | null;
  color?: string | null;
  fontWeight?: number | 'normal' | 'bold' | null;
  rotation?: number | null;
  anchor?: { x: number; y: number } | null;
  baselineLength?: number | null;
  baseline?: number | null;
  elements: PdfJsonTextElement[];
  originalElements: PdfJsonTextElement[];
  text: string;
  originalText: string;
  bounds: BoundingBox;
  childLineGroups?: TextGroup[] | null;
}

export const DEFAULT_PAGE_WIDTH = 612;
export const DEFAULT_PAGE_HEIGHT = 792;

export interface ConversionProgress {
  percent: number;
  stage: string;
  message: string;
  current?: number;
  total?: number;
}

export interface PdfTextEditorViewData {
  document: PdfJsonDocument | null;
  groupsByPage: TextGroup[][];
  imagesByPage: PdfJsonImageElement[][];
  pagePreviews: Map<number, string>;
  selectedPage: number;
  dirtyPages: boolean[];
  hasDocument: boolean;
  hasVectorPreview: boolean;
  fileName: string;
  errorMessage: string | null;
  isGeneratingPdf: boolean;
  isConverting: boolean;
  conversionProgress: ConversionProgress | null;
  hasChanges: boolean;
  forceSingleTextElement: boolean;
  groupingMode: 'auto' | 'paragraph' | 'singleLine';
  requestPagePreview: (pageIndex: number, scale: number) => void;
  onSelectPage: (pageIndex: number) => void;
  onGroupEdit: (pageIndex: number, groupId: string, value: string) => void;
  onGroupDelete: (pageIndex: number, groupId: string) => void;
  onImageTransform: (
    pageIndex: number,
    imageId: string,
    next: {
      left: number;
      bottom: number;
      width: number;
      height: number;
      transform: number[];
    },
  ) => void;
  onImageReset: (pageIndex: number, imageId: string) => void;
  onReset: () => void;
  onDownloadJson: () => void;
  onGeneratePdf: () => void;
  onGeneratePdfForNavigation: () => Promise<void>;
  onSaveToWorkbench: () => Promise<void>;
  isSavingToWorkbench: boolean;
  onForceSingleTextElementChange: (value: boolean) => void;
  onGroupingModeChange: (value: 'auto' | 'paragraph' | 'singleLine') => void;
  onMergeGroups: (pageIndex: number, groupIds: string[]) => boolean;
  onUngroupGroup: (pageIndex: number, groupId: string) => boolean;
  onLoadFile: (file: File) => void;
}
