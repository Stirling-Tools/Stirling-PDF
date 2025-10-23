export interface PdfJsonFontCidSystemInfo {
  registry?: string | null;
  ordering?: string | null;
  supplement?: number | null;
}

export interface PdfJsonTextColor {
  colorSpace?: string | null;
  components?: number[] | null;
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
  toUnicode?: string | null;
  standard14Name?: string | null;
  fontDescriptorFlags?: number | null;
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
  elements: PdfJsonTextElement[];
  originalElements: PdfJsonTextElement[];
  text: string;
  originalText: string;
  bounds: BoundingBox;
}

export const DEFAULT_PAGE_WIDTH = 612;
export const DEFAULT_PAGE_HEIGHT = 792;

export interface PdfJsonEditorViewData {
  document: PdfJsonDocument | null;
  groupsByPage: TextGroup[][];
  imagesByPage: PdfJsonImageElement[][];
  selectedPage: number;
  dirtyPages: boolean[];
  hasDocument: boolean;
  fileName: string;
  errorMessage: string | null;
  isGeneratingPdf: boolean;
  isConverting: boolean;
  hasChanges: boolean;
  onLoadJson: (file: File | null) => Promise<void> | void;
  onSelectPage: (pageIndex: number) => void;
  onGroupEdit: (pageIndex: number, groupId: string, value: string) => void;
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
}
