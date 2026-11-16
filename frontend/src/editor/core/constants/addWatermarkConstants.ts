export interface AlphabetOption {
  value: string;
  label: string;
  labelKey: string;
}

export const alphabetOptions: AlphabetOption[] = [
  { value: "roman", label: "Roman", labelKey: "alphabetOptions.roman" },
  { value: "arabic", label: "Arabic", labelKey: "alphabetOptions.arabic" },
  {
    value: "japanese",
    label: "Japanese",
    labelKey: "alphabetOptions.japanese",
  },
  { value: "korean", label: "Korean", labelKey: "alphabetOptions.korean" },
  {
    value: "chinese",
    label: "Chinese (Simplified)",
    labelKey: "alphabetOptions.chinese",
  },
  { value: "thai", label: "Thai", labelKey: "alphabetOptions.thai" },
];
