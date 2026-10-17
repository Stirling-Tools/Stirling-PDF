/** PDF permission bits (ISO 32000-1, Table 22). */
export enum PdfPermissionFlag {
  Print = 0x0004,
  ModifyContents = 0x0008,
  CopyContents = 0x0010,
  ModifyAnnotations = 0x0020,
  FillForms = 0x0100,
  ExtractForAccessibility = 0x0200,
  AssembleDocument = 0x0400,
  PrintHighQuality = 0x0800,
  AllowAll = 0x0f3c,
}
