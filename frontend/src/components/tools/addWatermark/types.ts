export interface AddWatermarkParameters {
  watermarkType?: 'text' | 'image';
  watermarkText: string;
  watermarkImage?: File;
  fontSize: number;
  rotation: number;
  opacity: number;
  widthSpacer: number;
  heightSpacer: number;
  alphabet: string;
  customColor: string;
  convertPDFToImage: boolean;
}