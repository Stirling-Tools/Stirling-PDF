# Expanded tool + fixture registry for the wide campaign. Port injected by the runner.
def base(port): return f"http://localhost:{port}/api/v1"

# (name, path_suffix, static_fields, cost_tag)
def tools(port):
    B = base(port)
    return {
      # --- analysis / meta (parse only) ---
      "basic-info":     (f"{B}/analysis/basic-info", {}, "meta"),
      "page-count":     (f"{B}/analysis/page-count", {}, "meta"),
      "get-info":       (f"{B}/security/get-info-on-pdf", {}, "meta"),
      "pdf-to-text":    (f"{B}/convert/pdf/text", {"outputFormat":"txt"}, "meta"),
      "pdf-to-csv":     (f"{B}/convert/pdf/csv", {"pageNumbers":"all"}, "meta"),
      "pdf-to-markdown":(f"{B}/convert/pdf/markdown", {}, "meta"),
      "pdf-to-xml":     (f"{B}/convert/pdf/xml", {}, "meta"),
      # --- struct (in-JVM rewrite) ---
      "rotate":         (f"{B}/general/rotate-pdf", {"angle":"90"}, "struct"),
      "remove-pages":   (f"{B}/general/remove-pages", {"pageNumbers":"1"}, "struct"),
      "rearrange":      (f"{B}/general/rearrange-pages", {"pageNumbers":"all","customMode":"REVERSE_ORDER"}, "struct"),
      "scale-pages":    (f"{B}/general/scale-pages", {"pageSize":"A4","scaleFactor":"1"}, "struct"),
      "single-page":    (f"{B}/general/pdf-to-single-page", {}, "struct"),
      "multi-layout":   (f"{B}/general/multi-page-layout", {"mode":"DEFAULT","pagesPerSheet":"4"}, "struct"),
      "crop":           (f"{B}/general/crop", {"x":"50","y":"50","width":"400","height":"600"}, "struct"),
      "split-pages":    (f"{B}/general/split-pages", {"pageNumbers":"1"}, "struct"),
      "booklet":        (f"{B}/general/booklet-imposition", {"addBorder":"false"}, "struct"),
      "update-meta":    (f"{B}/misc/update-metadata", {"deleteAll":"false","author":"perf","title":"perf"}, "struct"),
      "add-page-nums":  (f"{B}/misc/add-page-numbers", {"pageNumbers":"all","fontSize":"12","fontType":"helvetica","position":"5","startingNumber":"1","customText":"{n}"}, "struct"),
      "sanitize":       (f"{B}/security/sanitize-pdf", {"removeJavaScript":"true","removeEmbeddedFiles":"true"}, "struct"),
      "add-password":   (f"{B}/security/add-password", {"password":"pw","keyLength":"256"}, "struct"),
      "watermark":      (f"{B}/security/add-watermark", {"watermarkType":"text","watermarkText":"CONF","convertPDFToImage":"false","fontSize":"30","rotation":"0","opacity":"0.5","widthSpacer":"50","heightSpacer":"50","customColor":"#d3d3d3","alphabet":"roman"}, "struct"),
      "flatten":        (f"{B}/misc/flatten", {"flattenOnlyForms":"true"}, "struct"),
      "remove-blanks":  (f"{B}/misc/remove-blanks", {"threshold":"10","whitePercent":"99.9"}, "struct"),
      "decompress":     (f"{B}/misc/decompress-pdf", {}, "struct"),
      # --- render (rasterise) ---
      "extract-images": (f"{B}/misc/extract-images", {"format":"png"}, "render"),
      "pdf-to-img":     (f"{B}/convert/pdf/img", {"pageNumbers":"all","imageFormat":"png","singleOrMultiple":"multiple","colorType":"color","dpi":"150"}, "render"),
      # --- native (external process) ---
      "repair":         (f"{B}/misc/repair", {}, "native"),
      "compress":       (f"{B}/misc/compress-pdf", {"optimizeLevel":"4","expectedOutputSize":"","linearize":"false","normalize":"false","grayscale":"false"}, "native"),
      "pdf-to-word":    (f"{B}/convert/pdf/word", {"outputFormat":"docx"}, "native"),
      "pdf-to-pdfa":    (f"{B}/convert/pdf/pdfa", {"outputFormat":"pdfa"}, "native"),
      "ocr":            (f"{B}/misc/ocr-pdf", {"languages":"eng","ocrType":"force-ocr","ocrRenderType":"sandwich"}, "native"),
    }

FIXTURES = {
  "tiny-1p":     "tiny-1p.pdf",
  "text-10p":    "text-10p.pdf",
  "text-100p":   "text-100p.pdf",
  "text-1000p":  "text-1000p.pdf",
  "huge-3000p":  "huge-3000p.pdf",
  "form-20p":    "form-20p.pdf",
  "tables-50p":  "tables-50p.pdf",
  "vector-40p":  "vector-40p.pdf",
  "scanned-5p":  "scanned-5p.pdf",
  "scanned-50p": "scanned-50p.pdf",
  "many-imgs-30p":"many-imgs-30p.pdf",
  "mixed-200p":  "mixed-200p.pdf",
  "fat-12p-99mb":"fat-12p-99mb.pdf",
  "fat-3p-110mb":"fat-3p-110mb.pdf",
}
