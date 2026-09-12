package stirling.software.proprietary.pdf;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.doc.ExtractedImage;
import stirling.software.jpdfium.doc.PdfImageExtractor;
import stirling.software.jpdfium.model.Rect;

/**
 * Emits a placeholder per image on a page; image bytes are deliberately not carried into the
 * Markdown.
 */
final class PageImages {

    private PageImages() {}

    static void emit(PdfDocument doc, int pageIndex, List<Object> pageItems) throws IOException {
        try (PdfPage page = doc.page(pageIndex)) {
            List<ExtractedImage> images =
                    PdfImageExtractor.extract(page.rawDocHandle(), page.rawHandle(), pageIndex);
            for (ExtractedImage img : images) {
                pageItems.add(describe(img));
            }
        }
    }

    /**
     * Image placeholder annotated with whatever JPDFium exposes: pixels, placement, DPI, format,
     * colour space, depth. Missing fields are omitted.
     */
    private static String describe(ExtractedImage img) {
        List<String> parts = new ArrayList<>();
        if (img.width() > 0 && img.height() > 0) {
            parts.add(img.width() + "x" + img.height() + "px");
        }
        Rect b = img.bounds();
        if (b != null && b.width() > 0 && b.height() > 0) {
            parts.add(String.format("%.0fx%.0fpt", b.width(), b.height()));
            if (img.width() > 0) {
                float dpiX = img.width() / (b.width() / 72f);
                float dpiY = img.height() / (b.height() / 72f);
                if (Float.isFinite(dpiX) && dpiX > 0) {
                    parts.add(String.format("~%.0fdpi", (dpiX + dpiY) / 2f));
                }
            }
        }
        String ext = img.suggestedExtension();
        if (ext != null && !ext.isBlank()) {
            parts.add(ext.replaceFirst("^\\.", "").toUpperCase(Locale.ROOT));
        }
        if (img.colorSpace() != null) {
            parts.add(img.colorSpace().toString());
        }
        if (img.bitsPerPixel() > 0) {
            parts.add(img.bitsPerPixel() + "bpp");
        }

        StringBuilder sb = new StringBuilder("<image redacted");
        if (!parts.isEmpty()) {
            sb.append(": ").append(String.join(", ", parts));
        }
        sb.append('>');
        return sb.toString();
    }
}
