// Default PDF page sizes in points (1 point = 1/72 inch)
export const PAGE_SIZES = {
  A4: { width: 595, height: 842 },
  LETTER: { width: 612, height: 792 },
  A3: { width: 842, height: 1191 },
  A5: { width: 420, height: 595 },
  LEGAL: { width: 612, height: 1008 },
} as const;
