package stirling.software.proprietary.classification;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.springframework.stereotype.Service;

import stirling.software.proprietary.classification.HeuristicClassifier.HeuristicDoc;

/**
 * Builds the heuristic engine's input from a PDF: a large-font page-1 "title" zone (from PDFBox
 * font sizes, mirroring the frontend's pdf.js title detection), page-1 text, a first-5 + last-2
 * page window, and the Info-dictionary metadata. Matches the extraction the frontend heuristic
 * extractor performed so the server-side non-AI classify path produces the same labels.
 */
@Service
public class HeuristicDocExtractor {

    private static final int WINDOW_FIRST = 5;
    private static final int WINDOW_LAST = 2;
    private static final int PAGE_CHAR_CAP = 8000;
    private static final int TITLE_CAP = 400;

    public HeuristicDoc extract(PDDocument document, String fileName) throws IOException {
        int pageCount = document.getNumberOfPages();
        String firstZone = pageText(document, 1);
        StringBuilder all = new StringBuilder();
        for (int page : windowPages(pageCount)) {
            String text = pageText(document, page);
            if (text.isEmpty()) continue;
            if (all.length() > 0) all.append('\n');
            all.append(text);
        }
        String titleZone = titleZone(document);
        Map<String, String> meta = metadata(document);
        return new HeuristicDoc(fileName, pageCount, meta, titleZone, firstZone, all.toString());
    }

    private static String pageText(PDDocument doc, int page) throws IOException {
        if (page < 1 || page > doc.getNumberOfPages()) return "";
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setSortByPosition(true);
        stripper.setStartPage(page);
        stripper.setEndPage(page);
        String text = stripper.getText(doc).trim();
        return text.length() > PAGE_CHAR_CAP ? text.substring(0, PAGE_CHAR_CAP) : text;
    }

    /**
     * First {@value #WINDOW_FIRST} + last {@value #WINDOW_LAST} page numbers, deduped, in order.
     */
    private static List<Integer> windowPages(int pageCount) {
        Set<Integer> pages = new LinkedHashSet<>();
        for (int p = 1; p <= Math.min(WINDOW_FIRST, pageCount); p++) pages.add(p);
        for (int p = Math.max(1, pageCount - WINDOW_LAST + 1); p <= pageCount; p++) pages.add(p);
        List<Integer> ordered = new ArrayList<>(pages);
        Collections.sort(ordered);
        return ordered;
    }

    private static Map<String, String> metadata(PDDocument doc) {
        Map<String, String> meta = new LinkedHashMap<>();
        PDDocumentInformation info = doc.getDocumentInformation();
        if (info != null) {
            meta.put("title", nz(info.getTitle()));
            meta.put("author", nz(info.getAuthor()));
            meta.put("subject", nz(info.getSubject()));
            meta.put("keywords", nz(info.getKeywords()));
            meta.put("creator", nz(info.getCreator()));
            meta.put("producer", nz(info.getProducer()));
        }
        return meta;
    }

    private static String titleZone(PDDocument doc) throws IOException {
        if (doc.getNumberOfPages() < 1) return "";
        float pageHeight = doc.getPage(0).getMediaBox().getHeight();
        TitleStripper stripper = new TitleStripper();
        stripper.setStartPage(1);
        stripper.setEndPage(1);
        stripper.getText(doc);
        return titleFromLines(stripper.lines, pageHeight);
    }

    /**
     * Large-font lines near the top of page 1 approximate the document title (mirrors frontend).
     */
    private static String titleFromLines(List<Line> lines, float pageHeight) {
        if (lines.isEmpty()) return "";
        // Top ~45% from the page top. yDirAdj is top-origin, so the frontend's bottom-origin
        // "y > 0.55*height" becomes "yDirAdj < 0.45*height".
        List<Line> top = new ArrayList<>();
        for (Line line : lines) {
            if (line.y() < pageHeight * 0.45) top.add(line);
        }
        List<Line> pool = !top.isEmpty() ? top : lines.subList(0, Math.min(8, lines.size()));
        double maxSize = 0;
        for (Line line : pool) maxSize = Math.max(maxSize, line.size());

        StringBuilder sb = new StringBuilder();
        if (maxSize == 0) {
            for (int i = 0; i < Math.min(3, pool.size()); i++) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(pool.get(i).text());
            }
            return sb.toString();
        }
        int taken = 0;
        for (Line line : pool) {
            if (taken >= 6) break;
            if (line.size() >= maxSize * 0.72) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(line.text());
                taken++;
            }
        }
        String result = sb.toString();
        return result.length() > TITLE_CAP ? result.substring(0, TITLE_CAP) : result;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    /** One rebuilt text line: top-origin baseline Y, its largest font size, and the text. */
    private record Line(double y, double size, String text) {}

    /** Collects page-1 lines with their max font size and baseline Y for title detection. */
    private static final class TitleStripper extends PDFTextStripper {

        final List<Line> lines = new ArrayList<>();
        private final StringBuilder current = new StringBuilder();
        private double currentSize = 0;
        private double currentY = -1;

        TitleStripper() throws IOException {
            setSortByPosition(true);
        }

        @Override
        protected void writeString(String text, List<TextPosition> positions) throws IOException {
            for (TextPosition tp : positions) {
                if (tp.getFontSizeInPt() > currentSize) currentSize = tp.getFontSizeInPt();
                if (currentY < 0) currentY = tp.getYDirAdj();
            }
            current.append(text);
        }

        @Override
        protected void writeLineSeparator() throws IOException {
            flush();
        }

        @Override
        protected void endPage(PDPage page) throws IOException {
            flush();
            super.endPage(page);
        }

        private void flush() {
            String text = current.toString().trim();
            if (!text.isEmpty()) lines.add(new Line(currentY, currentSize, text));
            current.setLength(0);
            currentSize = 0;
            currentY = -1;
        }
    }
}
