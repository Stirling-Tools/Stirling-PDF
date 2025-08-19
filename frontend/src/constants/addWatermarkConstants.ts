export interface AddWatermarkParameters {
  watermarkType?: 'text' | 'image';
  watermarkText: string;
  watermarkImage?: File;
  fontSize: number; // Used for both text size and image size
  rotation: number;
  opacity: number;
  widthSpacer: number;
  heightSpacer: number;
  alphabet: string;
  customColor: string;
  convertPDFToImage: boolean;
}

export interface AlphabetOption {
  value: string;
  label: string;
}

export const alphabetOptions: AlphabetOption[] = [
  { value: "roman", label: "Roman" },
  { value: "arabic", label: "العربية" },
  { value: "japanese", label: "日本語" },
  { value: "korean", label: "한국어" },
  { value: "chinese", label: "简体中文" },
  { value: "thai", label: "ไทย" },
];

export const defaultWatermarkParameters: AddWatermarkParameters = {
  watermarkType: undefined,
  watermarkText: '',
  fontSize: 12,
  rotation: 0,
  opacity: 50,
  widthSpacer: 50,
  heightSpacer: 50,
  alphabet: 'roman',
  customColor: '#d3d3d3',
  convertPDFToImage: false
};