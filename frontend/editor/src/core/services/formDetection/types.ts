// Output schema for Auto Form Detection; mirrors the server /detect response.

export interface RectPt {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DetectedField {
  type: string;
  page: number;
  rectInPdfPoints: RectPt;
  confidence: number;
}
