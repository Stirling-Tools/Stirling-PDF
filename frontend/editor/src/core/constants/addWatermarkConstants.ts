export interface AlphabetOption {
  value: string;
  label: string;
  labelKey?: string;
}

export const alphabetOptions: AlphabetOption[] = [
  { value: "roman", label: "Roman", labelKey: "alphabetOptions.roman" },
  { value: "arabic", label: "العربية" },
  { value: "japanese", label: "日本語" },
  { value: "korean", label: "한국어" },
  { value: "chinese", label: "简体中文" },
  { value: "thai", label: "ไทย" },
];
