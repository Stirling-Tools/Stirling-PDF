package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.multipdf.PDFCloneUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.pdf.parser.PageImageLocator;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.exception.JPDFiumException;
import stirling.software.jpdfium.model.Rect;
import stirling.software.jpdfium.text.PdfTextExtractor;
import stirling.software.jpdfium.text.TextChar;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Box-shaped redaction: areas, whole pages, found text blocks and image boxes. Every box ends with
 * the content under it removed from the file or its page rasterised. Only callers that asked for a
 * cover-only box ({@code overlayOnly}) get one.
 */
@Service
@Slf4j
@RequiredArgsConstructor
class ManualRedactionService {

    private static final float DEFAULT_TEXT_PADDING_MULTIPLIER = 0.6f;
    private static final float REDACTION_WIDTH_REDUCTION_FACTOR = 0.9f;
    // Found-text blocks run from the baseline to about cap height; reach the descenders too.
    private static final float TEXT_REMOVAL_MARGIN_MULTIPLIER = 0.25f;
    // Fully transparent: JPDFium clears the region without painting it.
    private static final int UNPAINTED = 0x00000000;
    private static final ObjectMapper JSON = JsonMapper.builder().build();

    private final TempFileManager tempFileManager;

    /** A box in PDF user space (origin bottom-left) on a zero-based page. */
    record Box(int pageIndex, PDRectangle rect, Color color) {}

    // -----------------------------------------------------------------------
    // Area and page redaction
    // -----------------------------------------------------------------------

    void redactAreas(
            List<RedactionArea> redactionAreas,
            PDDocument document,
            PDPageTree allPages,
            boolean overlayOnly)
            throws IOException {

        if (redactionAreas == null || redactionAreas.isEmpty()) {
            return;
        }

        List<Box> boxes = new ArrayList<>();
        for (RedactionArea redactionArea : redactionAreas) {
            if (redactionArea.getPage() == null
                    || redactionArea.getPage() <= 0
                    || redactionArea.getHeight() == null
                    || redactionArea.getHeight() <= 0.0D
                    || redactionArea.getWidth() == null
                    || redactionArea.getWidth() <= 0.0D
                    || redactionArea.getPage() > allPages.getCount()) {
                continue;
            }

            int pageIndex = redactionArea.getPage() - 1;
            PDPage page = allPages.get(pageIndex);
            float x = redactionArea.getX().floatValue();
            float y = redactionArea.getY().floatValue();
            float width = redactionArea.getWidth().floatValue();
            float height = redactionArea.getHeight().floatValue();
            float pdfY = page.getBBox().getHeight() - y - height;

            boxes.add(
                    new Box(
                            pageIndex,
                            new PDRectangle(x, pdfY, width, height),
                            decodeOrDefault(redactionArea.getColor())));
        }

        redactBoxes(document, boxes, boxes, !overlayOnly);
    }

    /** Wipes each selected page: its content, resources and annotations go, then it is painted. */
    void redactPages(ManualRedactPdfRequest request, PDDocument document, PDPageTree allPages)
            throws IOException {

        Color redactColor = decodeOrDefault(request.getPageRedactionColor());
        List<Integer> pageNumbers = getPageNumbers(request, allPages.getCount());

        for (Integer pageNumber : pageNumbers) {
            PDPage page = allPages.get(pageNumber);
            page.getCOSObject().removeItem(COSName.CONTENTS);
            page.setResources(new PDResources());
            page.setAnnotations(new ArrayList<>());

            try (PDPageContentStream contentStream = new PDPageContentStream(document, page)) {
                contentStream.setNonStrokingColor(redactColor);

                PDRectangle box = page.getBBox();
                contentStream.addRect(
                        box.getLowerLeftX(), box.getLowerLeftY(), box.getWidth(), box.getHeight());
                contentStream.fill();
            }
        }
    }

    // -----------------------------------------------------------------------
    // Found text and image boxes
    // -----------------------------------------------------------------------

    /**
     * @param isTextRemovalMode JPDFium already removed the text; only the overlay is drawn
     * @param overlayOnly the caller asked for cover-only boxes, or rasterises the whole output
     */
    void redactFoundText(
            PDDocument document,
            List<PDFText> blocks,
            float customPadding,
            Color redactColor,
            boolean isTextRemovalMode,
            boolean overlayOnly)
            throws IOException {

        PDPageTree allPages = document.getDocumentCatalog().getPages();
        List<Box> removal = new ArrayList<>();
        List<Box> overlay = new ArrayList<>();

        for (PDFText block : blocks) {
            int pageIndex = block.getPageIndex();
            if (pageIndex < 0 || pageIndex >= allPages.getCount()) {
                continue;
            }
            float pageHeight = allPages.get(pageIndex).getBBox().getHeight();
            float blockHeight = block.getY2() - block.getY1();
            float originalWidth = block.getX2() - block.getX1();

            float margin = blockHeight * TEXT_REMOVAL_MARGIN_MULTIPLIER;
            removal.add(
                    new Box(
                            pageIndex,
                            new PDRectangle(
                                    block.getX1(),
                                    pageHeight - block.getY2() - margin,
                                    originalWidth,
                                    blockHeight + 2 * margin),
                            redactColor));

            float padding = blockHeight * DEFAULT_TEXT_PADDING_MULTIPLIER + customPadding;
            float boxWidth = originalWidth;
            float boxX = block.getX1();
            if (isTextRemovalMode) {
                boxWidth = originalWidth * REDACTION_WIDTH_REDUCTION_FACTOR;
                boxX = block.getX1() + (originalWidth - boxWidth) / 2;
            }
            overlay.add(
                    new Box(
                            pageIndex,
                            new PDRectangle(
                                    boxX,
                                    pageHeight - block.getY2() - padding,
                                    boxWidth,
                                    blockHeight + 2 * padding),
                            redactColor));
        }

        redactBoxes(document, removal, overlay, !isTextRemovalMode && !overlayOnly);
    }

    /** Each entry is {@code [pageIndex, x1, y1, x2, y2]}: opposite corners in PDF user space. */
    void redactImageBoxes(
            PDDocument document, List<float[]> imageBoxes, Color color, boolean overlayOnly)
            throws IOException {
        PDPageTree pages = document.getDocumentCatalog().getPages();
        List<Box> boxes = new ArrayList<>();
        for (float[] box : imageBoxes) {
            int pageIdx = (int) box[0];
            if (pageIdx < 0 || pageIdx >= pages.getCount()) {
                log.warn("[redact/execute] image box references out-of-range page {}", pageIdx);
                continue;
            }
            float x = Math.min(box[1], box[3]), y = Math.min(box[2], box[4]);
            float width = Math.abs(box[3] - box[1]), height = Math.abs(box[4] - box[2]);
            if (width <= 0 || height <= 0) {
                continue;
            }
            boxes.add(new Box(pageIdx, new PDRectangle(x, y, width, height), color));
        }
        redactBoxes(document, boxes, boxes, !overlayOnly);
    }

    // -----------------------------------------------------------------------
    // Removal under boxes
    // -----------------------------------------------------------------------

    /**
     * Clears what lies under {@code removal} when {@code removeContent} is set, paints {@code
     * overlay} and drops the annotations under either. A page whose content JPDFium could not fully
     * clear is rasterised once its boxes are painted, so the covered content cannot be recovered
     * from it either.
     */
    private void redactBoxes(
            PDDocument document, List<Box> removal, List<Box> overlay, boolean removeContent)
            throws IOException {
        Set<Integer> uncleared =
                removeContent && !removal.isEmpty() ? removeUnder(document, removal) : Set.of();

        drawBoxes(document, overlay);
        List<Box> covered = new ArrayList<>(removal);
        covered.addAll(overlay);
        removeAnnotationsUnder(document, covered);

        for (int pageIndex : uncleared) {
            log.warn(
                    "[redact] page {}: content under the boxes could not be removed exactly,"
                            + " rasterising the page",
                    pageIndex + 1);
            PdfUtils.rasterisePageInPlace(document, pageIndex);
        }
    }

    /**
     * Runs JPDFium's content-removing region redaction on a copy of the document and copies back
     * only the contents and resources of the pages it cleared. The outline, form fields and every
     * other page stay as PDFBox holds them.
     *
     * @return the pages that still hold content under a box and must be rasterised
     */
    private Set<Integer> removeUnder(PDDocument document, List<Box> boxes) throws IOException {
        Map<Integer, List<Box>> byPage = new TreeMap<>();
        for (Box box : boxes) {
            byPage.computeIfAbsent(box.pageIndex(), k -> new ArrayList<>()).add(box);
        }

        Set<Integer> cleared = new TreeSet<>();
        try (TempFile input = tempFileManager.createManagedTempFile(".pdf");
                TempFile output = tempFileManager.createManagedTempFile(".pdf")) {
            document.save(input.getFile());

            try (PdfDocument nativeDocument = PdfDocument.open(input.getPath())) {
                for (Map.Entry<Integer, List<Box>> entry : byPage.entrySet()) {
                    if (clearPage(nativeDocument, entry.getKey(), entry.getValue())) {
                        cleared.add(entry.getKey());
                    }
                }
                if (!cleared.isEmpty()) {
                    nativeDocument.save(output.getPath());
                }
            } catch (Exception | LinkageError e) {
                log.warn("[redact] JPDFium region removal unavailable: {}", e.getMessage());
                cleared.clear();
            }

            if (!cleared.isEmpty()) {
                copyPageContent(document, output, cleared);
            }
        }

        Set<Integer> uncleared = new TreeSet<>(byPage.keySet());
        uncleared.removeAll(cleared);
        return uncleared;
    }

    private boolean clearPage(PdfDocument nativeDocument, int pageIndex, List<Box> boxes) {
        try {
            try (PdfPage page = nativeDocument.page(pageIndex)) {
                // JPDFium keeps a letter a rectangle covers less than half of, and can refuse a
                // rectangle whose edge lands in the spacing beside a letter. Clear each letter a
                // box reaches by its own cell first, unpainted: the whole letter goes, the drawn
                // box stays as drawn. Farthest first, so no clearing reaches into a letter that
                // is still there.
                List<Glyph> reached = reachedBy(glyphs(nativeDocument, page, pageIndex), boxes);
                for (int i = reached.size() - 1; i >= 0; i--) {
                    page.redactRegion(reached.get(i).cell(), UNPAINTED, true);
                }
                for (Box box : boxes) {
                    PDRectangle r = box.rect();
                    page.redactRegion(
                            new Rect(
                                    r.getLowerLeftX(),
                                    r.getLowerLeftY(),
                                    r.getWidth(),
                                    r.getHeight()),
                            box.color().getRGB(),
                            true);
                }
            }
            // JPDFium's own audit can pass with glyphs still under a box, so check again.
            for (TextChar character :
                    PdfTextExtractor.extractPage(nativeDocument, pageIndex).chars()) {
                if (isGlyph(character) && overlapsAny(character, boxes)) {
                    log.warn("[redact] page {}: text still overlaps a box", pageIndex + 1);
                    return false;
                }
            }
            return true;
        } catch (JPDFiumException e) {
            log.warn("[redact] page {}: {}", pageIndex + 1, e.getMessage());
            return false;
        }
    }

    /**
     * A letter with the spacing after it: its ink box, widened to the right up to where the next
     * letter on the line starts. A box edge in that spacing still counts as reaching the letter.
     */
    private record Glyph(TextChar ink, float right) {
        Rect cell() {
            return new Rect(ink.x(), ink.y(), right - ink.x(), ink.height());
        }

        boolean reaches(float x0, float y0, float x1, float y1) {
            return ink.x() < x1 && right > x0 && ink.y() < y1 && ink.y() + ink.height() > y0;
        }
    }

    private static List<Glyph> glyphs(PdfDocument nativeDocument, PdfPage page, int pageIndex) {
        List<TextChar> chars = PdfTextExtractor.extractPage(nativeDocument, pageIndex).chars();
        Map<Integer, float[]> origins = origins(page.extractCharPositionsJson());
        List<Glyph> glyphs = new ArrayList<>();
        for (int i = 0; i < chars.size(); i++) {
            TextChar character = chars.get(i);
            if (!isGlyph(character)) {
                continue;
            }
            float right = character.x() + character.width();
            float[] origin = origins.get(character.index());
            float[] next = i + 1 < chars.size() ? origins.get(chars.get(i + 1).index()) : null;
            if (origin != null
                    && next != null
                    && Math.abs(next[1] - origin[1]) < 0.01f
                    && next[0] > origin[0]) {
                // Capped at one em, so a gap to text further along the baseline is not taken.
                right = Math.max(right, Math.min(next[0], origin[0] + character.fontSize()));
            }
            glyphs.add(new Glyph(character, right));
        }
        return glyphs;
    }

    /** Each character's text origin, keyed by its index; empty if JPDFium's JSON is unusable. */
    private static Map<Integer, float[]> origins(String json) {
        Map<Integer, float[]> origins = new HashMap<>();
        try {
            for (JsonNode node : JSON.readTree(json)) {
                if (node.has("i") && node.has("ox") && node.has("oy")) {
                    origins.put(
                            node.get("i").asInt(),
                            new float[] {
                                (float) node.get("ox").asDouble(), (float) node.get("oy").asDouble()
                            });
                }
            }
        } catch (JacksonException e) {
            log.warn("[redact] character origins unavailable: {}", e.getMessage());
            origins.clear();
        }
        return origins;
    }

    /**
     * The letters a box reaches without covering, and the ones clearing those would reach in turn
     * (a letter that overhangs its neighbour's cell), in the order found.
     */
    private static List<Glyph> reachedBy(List<Glyph> glyphs, List<Box> boxes) {
        Set<Glyph> reached = new LinkedHashSet<>();
        for (Glyph glyph : glyphs) {
            if (!insideAny(glyph.ink(), boxes) && reachesAny(glyph, boxes)) {
                reached.add(glyph);
            }
        }
        List<Glyph> order = new ArrayList<>(reached);
        for (int i = 0; i < order.size(); i++) {
            Rect cleared = order.get(i).cell();
            for (Glyph glyph : glyphs) {
                if (!reached.contains(glyph)
                        && !insideAny(glyph.ink(), boxes)
                        && glyph.reaches(
                                cleared.x(),
                                cleared.y(),
                                cleared.x() + cleared.width(),
                                cleared.y() + cleared.height())) {
                    reached.add(glyph);
                    order.add(glyph);
                }
            }
        }
        return order;
    }

    private static boolean reachesAny(Glyph glyph, List<Box> boxes) {
        for (Box box : boxes) {
            PDRectangle r = box.rect();
            if (glyph.reaches(
                    r.getLowerLeftX(), r.getLowerLeftY(), r.getUpperRightX(), r.getUpperRightY())) {
                return true;
            }
        }
        return false;
    }

    private static boolean isGlyph(TextChar character) {
        return !character.isWhitespace() && !character.isNewline();
    }

    private static boolean insideAny(TextChar character, List<Box> boxes) {
        for (Box box : boxes) {
            PDRectangle r = box.rect();
            if (character.x() >= r.getLowerLeftX()
                    && character.x() + character.width() <= r.getUpperRightX()
                    && character.y() >= r.getLowerLeftY()
                    && character.y() + character.height() <= r.getUpperRightY()) {
                return true;
            }
        }
        return false;
    }

    private static boolean overlapsAny(TextChar character, List<Box> boxes) {
        for (Box box : boxes) {
            PDRectangle r = box.rect();
            if (character.x() < r.getUpperRightX()
                    && character.x() + character.width() > r.getLowerLeftX()
                    && character.y() < r.getUpperRightY()
                    && character.y() + character.height() > r.getLowerLeftY()) {
                return true;
            }
        }
        return false;
    }

    private void copyPageContent(PDDocument document, TempFile redacted, Set<Integer> pages)
            throws IOException {
        try (PDDocument source = Loader.loadPDF(redacted.getFile())) {
            PDFCloneUtility cloner = new PDFCloneUtility(document) {};
            for (int pageIndex : pages) {
                COSDictionary from = source.getPage(pageIndex).getCOSObject();
                COSDictionary to = document.getPage(pageIndex).getCOSObject();
                COSBase contents = from.getDictionaryObject(COSName.CONTENTS);
                if (contents == null) {
                    to.removeItem(COSName.CONTENTS);
                } else {
                    to.setItem(COSName.CONTENTS, cloner.cloneForNewDocument(contents));
                }
                to.setItem(
                        COSName.RESOURCES,
                        cloner.cloneForNewDocument(
                                source.getPage(pageIndex).getResources().getCOSObject()));
            }
        }
    }

    private void drawBoxes(PDDocument document, List<Box> boxes) throws IOException {
        Map<Integer, List<Box>> byPage = new TreeMap<>();
        for (Box box : boxes) {
            byPage.computeIfAbsent(box.pageIndex(), k -> new ArrayList<>()).add(box);
        }
        PDPageTree pages = document.getDocumentCatalog().getPages();
        for (Map.Entry<Integer, List<Box>> entry : byPage.entrySet()) {
            PDPage page = pages.get(entry.getKey());
            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                contentStream.saveGraphicsState();
                for (Box box : entry.getValue()) {
                    PDRectangle r = box.rect();
                    contentStream.setNonStrokingColor(box.color());
                    contentStream.addRect(
                            r.getLowerLeftX(), r.getLowerLeftY(), r.getWidth(), r.getHeight());
                    contentStream.fill();
                }
                contentStream.restoreGraphicsState();
            }
        }
    }

    /** Links and other annotations under a box would still show their target or contents. */
    private void removeAnnotationsUnder(PDDocument document, List<Box> boxes) {
        Map<Integer, List<Box>> byPage = new TreeMap<>();
        for (Box box : boxes) {
            byPage.computeIfAbsent(box.pageIndex(), k -> new ArrayList<>()).add(box);
        }
        PDPageTree pages = document.getDocumentCatalog().getPages();
        for (Map.Entry<Integer, List<Box>> entry : byPage.entrySet()) {
            PDPage page = pages.get(entry.getKey());
            try {
                List<PDAnnotation> kept = new ArrayList<>();
                for (PDAnnotation annotation : page.getAnnotations()) {
                    PDRectangle ar = annotation.getRectangle();
                    boolean overlaps = false;
                    if (ar != null) {
                        for (Box box : entry.getValue()) {
                            PDRectangle r = box.rect();
                            if (ar.getLowerLeftX() < r.getUpperRightX()
                                    && ar.getUpperRightX() > r.getLowerLeftX()
                                    && ar.getLowerLeftY() < r.getUpperRightY()
                                    && ar.getUpperRightY() > r.getLowerLeftY()) {
                                overlaps = true;
                                break;
                            }
                        }
                    }
                    if (!overlaps) {
                        kept.add(annotation);
                    }
                }
                page.setAnnotations(kept);
            } catch (Exception e) {
                log.debug(
                        "[redact] could not remove annotations on page {}: {}",
                        entry.getKey(),
                        e.getMessage());
            }
        }
    }

    // -----------------------------------------------------------------------
    // Page element extraction
    // -----------------------------------------------------------------------

    /**
     * Returns bounding boxes for every text line and image on {@code page} in PDF user-space
     * coordinates: {@code [x1, y1, x2, y2]} (origin bottom-left, Y increases upward).
     */
    List<float[]> extractPageElementBoxes(PDDocument document, PDPage page, int pageIndex)
            throws IOException {
        List<float[]> boxes = new ArrayList<>();

        AllTextLineExtractor textExtractor =
                new AllTextLineExtractor(pageIndex + 1, page.getBBox().getHeight());
        textExtractor.getText(document);
        boxes.addAll(textExtractor.getLineBoxes());

        PageImageLocator imgLocator = new PageImageLocator(page, pageIndex);
        imgLocator.processPage(page);
        for (PageImageLocator.ImageBox imgBox : imgLocator.getImageBoxes()) {
            boxes.add(new float[] {imgBox.x1(), imgBox.y1(), imgBox.x2(), imgBox.y2()});
        }

        return boxes;
    }

    // -----------------------------------------------------------------------
    // Finalization
    // -----------------------------------------------------------------------

    /**
     * @param overlayOnly the caller asked for cover-only boxes ({@code OVERLAY_ONLY})
     */
    TempFile finalizeRedaction(
            PDDocument document,
            Map<Integer, List<PDFText>> allFoundTextsByPage,
            String colorString,
            float customPadding,
            Boolean convertToImage,
            boolean isTextRemovalMode,
            boolean overlayOnly)
            throws IOException {

        List<PDFText> allFoundTexts = new ArrayList<>();
        for (List<PDFText> pageTexts : allFoundTextsByPage.values()) {
            allFoundTexts.addAll(pageTexts);
        }

        boolean rasterise = Boolean.TRUE.equals(convertToImage);
        if (!allFoundTexts.isEmpty()) {
            Color redactColor = decodeOrDefault(colorString);
            redactFoundText(
                    document,
                    allFoundTexts,
                    customPadding,
                    redactColor,
                    isTextRemovalMode,
                    overlayOnly || rasterise);
            cleanDocumentMetadata(document);
        }

        if (rasterise) {
            try (PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document)) {
                cleanDocumentMetadata(convertedPdf);

                TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
                try {
                    convertedPdf.save(tempOut.getFile());
                } catch (IOException e) {
                    tempOut.close();
                    throw e;
                }

                log.info(
                        "Redaction finalized (image mode): {} pages ➜ {} KB",
                        convertedPdf.getNumberOfPages(),
                        tempOut.getFile().length() / 1024);

                return tempOut;
            }
        }

        TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
        try {
            document.save(tempOut.getFile());
        } catch (IOException e) {
            tempOut.close();
            throw e;
        }

        log.info(
                "Redaction finalized: {} pages ➜ {} KB",
                document.getNumberOfPages(),
                tempOut.getFile().length() / 1024);

        return tempOut;
    }

    private void cleanDocumentMetadata(PDDocument document) {
        try {
            var documentInfo = document.getDocumentInformation();
            if (documentInfo != null) {
                documentInfo.setAuthor(null);
                documentInfo.setSubject(null);
                documentInfo.setKeywords(null);
                documentInfo.setModificationDate(java.util.Calendar.getInstance());
                log.debug("Cleaned document metadata for security");
            }

            if (document.getDocumentCatalog() != null) {
                try {
                    document.getDocumentCatalog().setMetadata(null);
                } catch (Exception e) {
                    log.debug("Could not clear XMP metadata: {}", e.getMessage());
                }
            }

        } catch (Exception e) {
            log.warn("Failed to clean document metadata: {}", e.getMessage());
        }
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------

    static Color decodeOrDefault(String hex) {
        if (hex == null) {
            return Color.BLACK;
        }

        String colorString = hex.startsWith("#") ? hex : "#" + hex;

        try {
            return Color.decode(colorString);
        } catch (NumberFormatException e) {
            return Color.BLACK;
        }
    }

    private List<Integer> getPageNumbers(ManualRedactPdfRequest request, int pagesCount) {
        String pageNumbersInput = request.getPageNumbers();
        String[] parsedPageNumbers =
                pageNumbersInput != null ? pageNumbersInput.split(",") : new String[0];
        List<Integer> pageNumbers =
                GeneralUtils.parsePageList(parsedPageNumbers, pagesCount, false);
        Collections.sort(pageNumbers);
        return pageNumbers;
    }
}
