package stirling.software.SPDF.service.misc;

import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.TextColorUsage;
import stirling.software.common.service.CustomPDFDocumentFactory;

@Service
@RequiredArgsConstructor
@Slf4j
public class TextColorReplacementService {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    public List<TextColorUsage> detectTextColors(org.springframework.web.multipart.MultipartFile file)
            throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(file)) {
            List<TextGlyphOccurrence> glyphs = collectGlyphs(document);
            Map<String, Long> counts = new HashMap<>();
            for (TextGlyphOccurrence glyph : glyphs) {
                counts.merge(glyph.hexColor(), 1L, Long::sum);
            }

            return counts.entrySet().stream()
                    .map(entry -> new TextColorUsage(entry.getKey(), entry.getValue()))
                    .sorted(
                            Comparator.comparingLong(TextColorUsage::getOccurrenceCount)
                                    .reversed()
                                    .thenComparing(TextColorUsage::getHexColor))
                    .toList();
        }
    }

    public PDDocument replaceTextColors(
            org.springframework.web.multipart.MultipartFile file,
            List<String> sourceColors,
            String targetColorHex)
            throws IOException {
        if (sourceColors == null || sourceColors.isEmpty()) {
            throw new IllegalArgumentException("At least one source colour must be provided");
        }

        Set<String> normalizedSourceColors = new LinkedHashSet<>();
        for (String color : sourceColors) {
            normalizedSourceColors.add(normalizeHexColor(color));
        }
        Color targetColor = parseHexColor(targetColorHex);

        PDDocument document = pdfDocumentFactory.load(file);
        try {
            List<TextGlyphOccurrence> glyphs = collectGlyphs(document);
            Map<Integer, List<TextGlyphOccurrence>> byPage = new HashMap<>();
            for (TextGlyphOccurrence glyph : glyphs) {
                if (normalizedSourceColors.contains(glyph.hexColor())) {
                    byPage.computeIfAbsent(glyph.pageIndex(), key -> new ArrayList<>()).add(glyph);
                }
            }

            if (byPage.isEmpty()) {
                return document;
            }

            for (Map.Entry<Integer, List<TextGlyphOccurrence>> entry : byPage.entrySet()) {
                int pageIndex = entry.getKey();
                PDPage page = document.getPage(pageIndex);
                PDRectangle mediaBox = page.getMediaBox();
                float pageHeight = mediaBox.getHeight();

                try (PDPageContentStream contentStream =
                        new PDPageContentStream(
                                document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                    for (TextGlyphOccurrence glyph : entry.getValue()) {
                        drawReplacementGlyph(contentStream, glyph, pageHeight, targetColor);
                    }
                }
            }

            return document;
        } catch (Exception ex) {
            document.close();
            if (ex instanceof IOException ioException) {
                throw ioException;
            }
            throw new IOException("Failed to replace text colours", ex);
        }
    }

    private void drawReplacementGlyph(
            PDPageContentStream contentStream,
            TextGlyphOccurrence glyph,
            float pageHeight,
            Color targetColor)
            throws IOException {
        float x = glyph.x();
        float y = glyph.y();
        float width = Math.max(0.5f, glyph.width());
        float height = Math.max(0.5f, glyph.height());
        float top = pageHeight - y;
        float bottom = top - height;

        contentStream.setNonStrokingColor(Color.WHITE);
        contentStream.addRect(x - 0.2f, bottom - 0.2f, width + 0.4f, height + 0.4f);
        contentStream.fill();

        contentStream.beginText();
        contentStream.setNonStrokingColor(targetColor);
        contentStream.newLineAtOffset(x, top);
        contentStream.setFont(resolveWritableFont(glyph.font(), glyph.unicode()), glyph.fontSize());
        contentStream.showText(glyph.unicode());
        contentStream.endText();
    }

    private PDFont resolveWritableFont(PDFont preferredFont, String text) {
        if (preferredFont != null && canEncode(preferredFont, text)) {
            return preferredFont;
        }
        PDFont fallback = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        if (canEncode(fallback, text)) {
            return fallback;
        }
        return fallback;
    }

    private boolean canEncode(PDFont font, String text) {
        try {
            font.encode(text);
            return true;
        } catch (IOException | IllegalArgumentException | UnsupportedOperationException ex) {
            return false;
        }
    }

    private List<TextGlyphOccurrence> collectGlyphs(PDDocument document) throws IOException {
        ColorTrackingTextStripper stripper = new ColorTrackingTextStripper();
        stripper.setSortByPosition(true);
        for (int page = 1; page <= document.getNumberOfPages(); page++) {
            stripper.setStartPage(page);
            stripper.setEndPage(page);
            stripper.getText(document);
        }
        return stripper.getOccurrences();
    }

    private String normalizeHexColor(String color) {
        if (color == null || color.isBlank()) {
            throw new IllegalArgumentException("Colour value cannot be empty");
        }
        String normalized = color.trim().toUpperCase(Locale.ROOT);
        if (!normalized.startsWith("#")) {
            normalized = "#" + normalized;
        }
        if (!normalized.matches("^#[0-9A-F]{6}$")) {
            throw new IllegalArgumentException("Invalid colour format: " + color);
        }
        return normalized;
    }

    private Color parseHexColor(String colorHex) {
        return Color.decode(normalizeHexColor(colorHex));
    }

    private String toHexColor(PDColor color) {
        if (color == null) {
            return "#000000";
        }
        try {
            int rgb = color.toRGB();
            return String.format("#%06X", rgb & 0xFFFFFF);
        } catch (IOException ex) {
            log.debug("Failed to decode PDF colour, defaulting to black: {}", ex.getMessage());
            return "#000000";
        }
    }

    private record TextGlyphOccurrence(
            int pageIndex,
            float x,
            float y,
            float width,
            float height,
            PDFont font,
            float fontSize,
            String unicode,
            String hexColor) {}

    private class ColorTrackingTextStripper extends PDFTextStripper {
        private final List<TextGlyphOccurrence> occurrences = new ArrayList<>();

        private ColorTrackingTextStripper() throws IOException {
            super();
        }

        @Override
        protected void processTextPosition(TextPosition text) {
            String unicode = text.getUnicode();
            if (unicode != null && !unicode.isBlank()) {
                String hexColor = toHexColor(getGraphicsState().getNonStrokingColor());
                occurrences.add(
                        new TextGlyphOccurrence(
                                Math.max(0, getCurrentPageNo() - 1),
                                text.getXDirAdj(),
                                text.getYDirAdj(),
                                text.getWidthDirAdj(),
                                text.getHeightDir(),
                                text.getFont(),
                                text.getFontSize(),
                                unicode,
                                hexColor));
            }
            super.processTextPosition(text);
        }

        private List<TextGlyphOccurrence> getOccurrences() {
            return occurrences;
        }
    }
}
