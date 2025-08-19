import { AddWatermarkParameters } from "../hooks/tools/addWatermark/useAddWatermarkParameters";

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