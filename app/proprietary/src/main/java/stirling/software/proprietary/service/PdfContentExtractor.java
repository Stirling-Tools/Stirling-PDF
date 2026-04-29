package stirling.software.proprietary.service;

import java.awt.geom.Point2D;
import java.io.IOException;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.QuoteMode;
import org.apache.pdfbox.contentstream.PDFGraphicsStreamEngine;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.apache.pdfbox.util.Matrix;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonValue;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.proprietary.model.api.ai.AiPdfContentType;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowTextSelection;
import stirling.software.proprietary.model.api.ai.FolioType;
import stirling.software.proprietary.pdf.FlexibleCSVWriter;

import technology.tabula.ObjectExtractor;
import technology.tabula.Page;
import technology.tabula.Table;
import technology.tabula.extractors.SpreadsheetExtractionAlgorithm;

@Slf4j
@Service
public class PdfContentExtractor {

    private static final int MAX_CHARACTERS_PER_PAGE = 4_000;

    private static final int TEXT_PRESENCE_THRESHOLD = 20;

    record LoadedFile(String fileName, PDDocument document) {}

    // -----------------------------------------------------------------------
    // Low-level extraction methods (usable by any agent)
    // -----------------------------------------------------------------------

    /**
     * Classify a single page as TEXT, IMAGE, or MIXED.
     *
     * @param document the open PDF
     * @param pageNumber 1-based page number
     */
    public FolioType classifyPage(PDDocument document, int pageNumber) throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(pageNumber);
        stripper.setEndPage(pageNumber);
        String text = stripper.getText(document).trim();

        boolean hasText = text.length() > TEXT_PRESENCE_THRESHOLD;
        boolean hasImages = PdfUtils.hasImagesOnPage(document.getPage(pageNumber - 1));

        if (hasText && hasImages) {
            return FolioType.MIXED;
        } else if (hasText) {
            return FolioType.TEXT;
        } else {
            return FolioType.IMAGE;
        }
    }

    /**
     * Extract plain text from a single page, clipped to {@link #MAX_CHARACTERS_PER_PAGE}.
     *
     * @param document the open PDF
     * @param pageNumber 1-based page number
     * @return trimmed text, or empty string if the page has no extractable text
     */
    public String extractPageTextRaw(PDDocument document, int pageNumber) throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(pageNumber);
        stripper.setEndPage(pageNumber);
        String text = stripper.getText(document).trim();
        return clip(text, MAX_CHARACTERS_PER_PAGE);
    }

    /**
     * Extract all tables from a single page as CSV strings.
     *
     * @param document the open PDF
     * @param pageNumber 1-based page number
     * @return list of CSV strings (one per table), empty if no tables found
     */
    public List<String> extractTablesAsCsv(PDDocument document, int pageNumber) throws IOException {
        SpreadsheetExtractionAlgorithm sea = new SpreadsheetExtractionAlgorithm();
        CSVFormat format =
                CSVFormat.EXCEL.builder().setEscape('"').setQuoteMode(QuoteMode.ALL).build();
        List<String> csvStrings = new ArrayList<>();

        // NOTE: Do NOT use try-with-resources here. Tabula's ObjectExtractor.close() calls
        // PDDocument.close() on the underlying document, which would close the caller's document
        // and break all subsequent PDFBox operations in the same request.
        ObjectExtractor extractor = new ObjectExtractor(document);
        Page tabulaPage = extractor.extract(pageNumber);
        List<Table> tables = sea.extract(tabulaPage);

        for (Table table : tables) {
            StringWriter sw = new StringWriter();
            FlexibleCSVWriter csvWriter = new FlexibleCSVWriter(format);
            csvWriter.write(sw, Collections.singletonList(table));
            csvStrings.add(sw.toString());
        }

        return csvStrings;
    }

    // -----------------------------------------------------------------------
    // Debug extraction (used by dev tooling only)
    // -----------------------------------------------------------------------

    /**
     * Extracts the full page text for all pages using the same text-extraction and image-annotation
     * pipeline that the AI workflow uses. Intended for the debug {@code POST
     * /api/v1/ai/debug/extract-text} endpoint only — not for production workflows.
     *
     * @param document the open PDF
     * @param maxPages maximum number of pages to process
     * @param maxCharacters total character budget across all pages
     * @return per-page text selections (1-based page numbers), in page order
     */
    public List<AiWorkflowTextSelection> extractPagesForDebug(
            PDDocument document, int maxPages, int maxCharacters) throws IOException {
        List<Integer> pages = new ArrayList<>();
        int total = document.getNumberOfPages();
        for (int p = 1; p <= total && pages.size() < maxPages; p++) {
            pages.add(p);
        }
        return extractPageText(document, pages, maxCharacters);
    }

    // -----------------------------------------------------------------------
    // Workflow extraction (used by AiWorkflowService)
    // -----------------------------------------------------------------------

    /**
     * Extracts content from the loaded files according to the requested content types and budget
     * constraints.
     */
    List<PdfContentResult> extractContent(
            List<LoadedFile> loadedFiles,
            Map<String, AiWorkflowFileRequest> requestedByName,
            int maxPages,
            int maxCharacters)
            throws IOException {
        List<PdfContentResult> contentResults = new ArrayList<>();
        int remainingPages = maxPages;
        int remainingCharacters = maxCharacters;

        for (LoadedFile lf : loadedFiles) {
            if (remainingPages <= 0 || remainingCharacters <= 0) break;
            AiWorkflowFileRequest fileReq = requestedByName.get(lf.fileName());
            List<AiPdfContentType> contentTypes =
                    fileReq != null && !fileReq.getContentTypes().isEmpty()
                            ? fileReq.getContentTypes()
                            : List.of(AiPdfContentType.PAGE_TEXT);

            for (AiPdfContentType contentType : contentTypes) {
                Optional<PdfContentResult> result =
                        dispatchContentType(
                                contentType, lf, fileReq, remainingPages, remainingCharacters);
                if (result.isPresent()) {
                    PdfContentResult content = result.get();
                    contentResults.add(content);
                    remainingPages -= content.pagesConsumed();
                    remainingCharacters -= content.charactersConsumed();
                }
            }
        }
        return contentResults;
    }

    /** Groups content results by artifact kind and builds the corresponding workflow artifacts. */
    List<WorkflowArtifact> buildArtifacts(List<PdfContentResult> results) {
        List<WorkflowArtifact> artifacts = new ArrayList<>();
        Map<ArtifactKind, List<PdfContentResult>> byKind =
                results.stream().collect(Collectors.groupingBy(PdfContentResult::getArtifactKind));
        for (var entry : byKind.entrySet()) {
            artifacts.add(buildArtifact(entry.getKey(), entry.getValue()));
        }
        return artifacts;
    }

    private Optional<PdfContentResult> dispatchContentType(
            AiPdfContentType contentType,
            LoadedFile lf,
            AiWorkflowFileRequest fileReq,
            int remainingPages,
            int remainingCharacters)
            throws IOException {
        return switch (contentType) {
            case PAGE_TEXT, FULL_TEXT ->
                    Optional.<PdfContentResult>ofNullable(
                            extractText(lf, fileReq, remainingPages, remainingCharacters));
            default -> {
                log.warn(
                        "Content type {} not yet implemented, skipping for {}",
                        contentType,
                        lf.fileName());
                yield Optional.empty();
            }
        };
    }

    private ExtractedFileText extractText(
            LoadedFile lf,
            AiWorkflowFileRequest fileReq,
            int remainingPages,
            int remainingCharacters)
            throws IOException {
        List<Integer> requestedPages = fileReq != null ? fileReq.getPageNumbers() : null;
        List<Integer> pages =
                selectPages(lf.document().getNumberOfPages(), requestedPages, remainingPages);
        List<AiWorkflowTextSelection> extracted =
                extractPageText(lf.document(), pages, remainingCharacters);
        return extracted.isEmpty() ? null : buildExtractedFileText(lf.fileName(), extracted);
    }

    private WorkflowArtifact buildArtifact(ArtifactKind kind, List<PdfContentResult> results) {
        return switch (kind) {
            case EXTRACTED_TEXT -> {
                ExtractedTextArtifact artifact = new ExtractedTextArtifact();
                artifact.setFiles(results.stream().map(ExtractedFileText.class::cast).toList());
                yield artifact;
            }
        };
    }

    private List<Integer> selectPages(
            int totalPages, List<Integer> requestedPageNumbers, int maxPages) {
        if (totalPages <= 0) {
            throw ExceptionUtils.createPdfNoPages();
        }

        List<Integer> pages = new ArrayList<>();

        if (requestedPageNumbers == null || requestedPageNumbers.isEmpty()) {
            for (int p = 1; p <= totalPages && pages.size() < maxPages; p++) {
                pages.add(p);
            }
            return pages;
        }

        Set<Integer> deduplicatedPages = new LinkedHashSet<>(requestedPageNumbers);
        for (Integer pageNumber : deduplicatedPages) {
            if (pageNumber == null || pageNumber < 1 || pageNumber > totalPages) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidPageNumber",
                        "Requested page number %s is outside the PDF page range.",
                        pageNumber);
            }
            pages.add(pageNumber);
            if (pages.size() >= maxPages) {
                break;
            }
        }
        return pages;
    }

    private List<AiWorkflowTextSelection> extractPageText(
            PDDocument document, List<Integer> selectedPages, int maxCharacters)
            throws IOException {
        List<AiWorkflowTextSelection> pages = new ArrayList<>();
        int remainingCharacters = maxCharacters;

        for (Integer pageNumber : selectedPages) {
            if (remainingCharacters <= 0) {
                break;
            }

            PDFTextStripper textStripper = new PDFTextStripper();
            textStripper.setSortByPosition(true);
            textStripper.setStartPage(pageNumber);
            textStripper.setEndPage(pageNumber);

            String pageText = textStripper.getText(document).trim();

            // Prepend page dimensions so the AI agent can reason about absolute coordinates.
            PDPage page = document.getPage(pageNumber - 1);
            PDRectangle bbox = page.getBBox();
            String dimensionHeader =
                    String.format(
                            "--- Page dimensions: %.0fx%.0f pts"
                                    + " (PDF user-space: origin bottom-left, Y up) ---\n",
                            bbox.getWidth(), bbox.getHeight());
            pageText = dimensionHeader + pageText;

            // Append image metadata so the AI agent can reason about images spatially.
            String imageAnnotation = buildImageAnnotation(document, pageNumber - 1);
            if (!imageAnnotation.isEmpty()) {
                pageText = pageText + imageAnnotation;
            }

            if (pageText.isBlank()) {
                continue;
            }

            int allowedCharacters = Math.min(remainingCharacters, MAX_CHARACTERS_PER_PAGE);
            String clippedText = clip(pageText, allowedCharacters);
            if (clippedText.isBlank()) {
                continue;
            }

            AiWorkflowTextSelection selection = new AiWorkflowTextSelection();
            selection.setPageNumber(pageNumber);
            selection.setText(clippedText);
            pages.add(selection);
            remainingCharacters -= clippedText.length();
        }
        return pages;
    }

    /**
     * Builds a human-readable description of all images on a page to append to page text. Uses PDF
     * user-space coordinates (origin bottom-left, Y up) so the AI can reference exact bounding
     * boxes when requesting image redaction.
     */
    private String buildImageAnnotation(PDDocument document, int pageIndex) {
        try {
            List<ImageBlock> images = extractImagePositions(document, pageIndex);
            if (images.isEmpty()) {
                return "";
            }
            PDPage page = document.getPage(pageIndex);
            PDRectangle bbox = page.getBBox();
            float pageWidth = bbox.getWidth();
            float pageHeight = bbox.getHeight();

            StringBuilder sb = new StringBuilder("\n\n--- Images on this page ---");
            for (int i = 0; i < images.size(); i++) {
                ImageBlock img = images.get(i);
                String position = spatialLabel(img, pageWidth, pageHeight);
                float w = img.x2() - img.x1();
                float h = img.y2() - img.y1();
                sb.append(
                        String.format(
                                "\nImage %d: position=%s, size=%.0fx%.0f pts,"
                                        + " bounds=(x1=%.0f, y1=%.0f, x2=%.0f, y2=%.0f)",
                                i + 1, position, w, h, img.x1(), img.y1(), img.x2(), img.y2()));
            }
            return sb.toString();
        } catch (Exception e) {
            log.debug(
                    "Failed to extract image positions for page {}: {}", pageIndex, e.getMessage());
            return "";
        }
    }

    /**
     * Returns a human-readable spatial label (e.g. "top-left", "center") for an image based on its
     * centre relative to the page dimensions. Coordinates are in PDF user-space (Y up).
     */
    private static String spatialLabel(ImageBlock img, float pageWidth, float pageHeight) {
        float cx = (img.x1() + img.x2()) / 2f;
        float cy = (img.y1() + img.y2()) / 2f;

        String horiz = cx < pageWidth / 3f ? "left" : cx < 2 * pageWidth / 3f ? "center" : "right";
        // PDF Y increases upward, so higher Y = higher on the page = "top"
        String vert = cy > 2 * pageHeight / 3f ? "top" : cy > pageHeight / 3f ? "middle" : "bottom";
        return vert + "-" + horiz;
    }

    private ExtractedFileText buildExtractedFileText(
            String fileName, List<AiWorkflowTextSelection> pages) {
        ExtractedFileText fileText = new ExtractedFileText();
        fileText.setFileName(fileName);
        fileText.setPages(pages);
        return fileText;
    }

    private String clip(String text, int maxLength) {
        if (text.length() <= maxLength) {
            return text;
        }
        // Avoid splitting a surrogate pair at the boundary
        int end = maxLength;
        if (Character.isHighSurrogate(text.charAt(end - 1))) {
            end--;
        }
        return text.substring(0, end);
    }

    // -----------------------------------------------------------------------
    // Text position finding
    // -----------------------------------------------------------------------

    /**
     * A located text match inside a PDF: 0-based page index and bounding box in PDFBox coordinates
     * (origin bottom-left).
     */
    public record TextBlock(int pageIndex, float x1, float y1, float x2, float y2) {}

    /**
     * An image found on a PDF page: 0-based page index and bounding box in PDF user-space
     * coordinates (origin bottom-left, Y increases upward).
     */
    public record ImageBlock(int pageIndex, float x1, float y1, float x2, float y2) {}

    /**
     * Extract the bounding boxes of all raster/vector images on the given (0-based) page.
     *
     * @param document the open PDF
     * @param pageIndex 0-based page index
     * @return list of located images in document order
     */
    public List<ImageBlock> extractImagePositions(PDDocument document, int pageIndex)
            throws IOException {
        PDPage page = document.getPage(pageIndex);
        ImageBoundsExtractor extractor = new ImageBoundsExtractor(page, pageIndex);
        extractor.processPage(page);
        return extractor.getImageBlocks();
    }

    /**
     * Find all occurrences of {@code pattern} in {@code document} and return their bounding boxes.
     *
     * @param document the open PDF
     * @param pattern the search string or regex
     * @param useRegex {@code true} to treat {@code pattern} as a regular expression
     * @return list of located matches, in page order
     */
    public List<TextBlock> findTextPositions(PDDocument document, String pattern, boolean useRegex)
            throws IOException {
        LocalTextFinder finder = new LocalTextFinder(pattern, useRegex);
        finder.getText(document);
        return finder.found;
    }

    private static final class LocalTextFinder extends PDFTextStripper {

        private final String searchTerm;
        private final boolean useRegex;
        final List<TextBlock> found = new ArrayList<>();

        private final List<TextPosition> pagePositions = new ArrayList<>();
        private final StringBuilder pageText = new StringBuilder();

        LocalTextFinder(String searchTerm, boolean useRegex) throws IOException {
            this.searchTerm = searchTerm;
            this.useRegex = useRegex;
            setWordSeparator(" ");
            setLineSeparator("\n");
        }

        @Override
        protected void startPage(PDPage page) throws IOException {
            super.startPage(page);
            pagePositions.clear();
            pageText.setLength(0);
        }

        @Override
        protected void writeString(String text, List<TextPosition> positions) {
            pageText.append(text);
            pagePositions.addAll(positions);
        }

        @Override
        protected void writeWordSeparator() {
            pageText.append(getWordSeparator());
            pagePositions.add(null);
        }

        @Override
        protected void writeLineSeparator() {
            pageText.append(getLineSeparator());
            pagePositions.add(null);
        }

        @Override
        protected void endPage(PDPage page) throws IOException {
            String text = pageText.toString();
            if (!text.isEmpty() && searchTerm != null && !searchTerm.isBlank()) {
                String term = searchTerm.trim();
                String regex = useRegex ? term : "\\Q" + term + "\\E";
                Pattern pat = RegexPatternUtils.getInstance().createSearchPattern(regex, true);
                Matcher matcher = pat.matcher(text);
                while (matcher.find()) {
                    float minX = Float.MAX_VALUE;
                    float minY = Float.MAX_VALUE;
                    float maxX = -Float.MAX_VALUE;
                    float maxY = -Float.MAX_VALUE;
                    boolean hit = false;
                    for (int i = matcher.start(); i < matcher.end(); i++) {
                        if (i < pagePositions.size()) {
                            TextPosition tp = pagePositions.get(i);
                            if (tp != null) {
                                hit = true;
                                minX = Math.min(minX, tp.getX());
                                maxX = Math.max(maxX, tp.getX() + tp.getWidth());
                                minY = Math.min(minY, tp.getY() - tp.getHeight());
                                maxY = Math.max(maxY, tp.getY());
                            }
                        }
                    }
                    if (hit) {
                        found.add(new TextBlock(getCurrentPageNo() - 1, minX, minY, maxX, maxY));
                    }
                }
            }
            super.endPage(page);
        }
    }

    /**
     * PDFGraphicsStreamEngine that intercepts {@code drawImage} calls and records each image's
     * bounding box in PDF user space (origin bottom-left, Y up) by reading the current
     * transformation matrix.
     */
    private static final class ImageBoundsExtractor extends PDFGraphicsStreamEngine {

        private final int pageIndex;
        private final List<ImageBlock> imageBlocks = new ArrayList<>();
        private final Point2D.Float currentPoint = new Point2D.Float();

        ImageBoundsExtractor(PDPage page, int pageIndex) {
            super(page);
            this.pageIndex = pageIndex;
        }

        List<ImageBlock> getImageBlocks() {
            return imageBlocks;
        }

        @Override
        public void drawImage(PDImage pdImage) throws IOException {
            Matrix ctm = getGraphicsState().getCurrentTransformationMatrix();
            // An image occupies the unit square (0,0)→(1,1) in image space.
            // Transform all four corners through the CTM to get the page-space bounding box.
            float a = ctm.getScaleX();
            float b = ctm.getShearY();
            float c = ctm.getShearX();
            float d = ctm.getScaleY();
            float e = ctm.getTranslateX();
            float f = ctm.getTranslateY();
            float[] xs = {e, a + e, c + e, a + c + e};
            float[] ys = {f, b + f, d + f, b + d + f};
            float x1 = Float.MAX_VALUE, y1 = Float.MAX_VALUE;
            float x2 = -Float.MAX_VALUE, y2 = -Float.MAX_VALUE;
            for (float x : xs) {
                x1 = Math.min(x1, x);
                x2 = Math.max(x2, x);
            }
            for (float y : ys) {
                y1 = Math.min(y1, y);
                y2 = Math.max(y2, y);
            }
            imageBlocks.add(new ImageBlock(pageIndex, x1, y1, x2, y2));
        }

        // ---------- required abstract methods (no-op for path operations) ----------

        @Override
        public void appendRectangle(Point2D p0, Point2D p1, Point2D p2, Point2D p3) {}

        @Override
        public void clip(int windingRule) {}

        @Override
        public void moveTo(float x, float y) {
            currentPoint.setLocation(x, y);
        }

        @Override
        public void lineTo(float x, float y) {
            currentPoint.setLocation(x, y);
        }

        @Override
        public void curveTo(float x1, float y1, float x2, float y2, float x3, float y3) {
            currentPoint.setLocation(x3, y3);
        }

        @Override
        public Point2D getCurrentPoint() {
            return currentPoint;
        }

        @Override
        public void closePath() {}

        @Override
        public void endPath() {}

        @Override
        public void strokePath() {}

        @Override
        public void fillPath(int windingRule) {}

        @Override
        public void fillAndStrokePath(int windingRule) {}

        @Override
        public void shadingFill(COSName shadingName) {}
    }

    // --- Types shared with AiWorkflowService (package-private) ---

    interface PdfContentResult {
        @JsonIgnore
        ArtifactKind getArtifactKind();

        @JsonIgnore
        default int pagesConsumed() {
            return 0;
        }

        @JsonIgnore
        default int charactersConsumed() {
            return 0;
        }
    }

    /**
     * Values MUST match {@code ArtifactKind} in {@code engine/src/stirling/contracts/common.py}.
     */
    enum ArtifactKind {
        EXTRACTED_TEXT("extracted_text");

        private final String value;

        ArtifactKind(String value) {
            this.value = value;
        }

        @JsonValue
        public String getValue() {
            return value;
        }
    }

    interface WorkflowArtifact {
        ArtifactKind getKind();
    }

    @Data
    static class ExtractedFileText implements PdfContentResult {
        private String fileName;
        private List<AiWorkflowTextSelection> pages = new ArrayList<>();

        @Override
        public ArtifactKind getArtifactKind() {
            return ArtifactKind.EXTRACTED_TEXT;
        }

        @Override
        public int pagesConsumed() {
            return pages.size();
        }

        @Override
        public int charactersConsumed() {
            return pages.stream().mapToInt(p -> p.getText().length()).sum();
        }
    }

    @Data
    static final class ExtractedTextArtifact implements WorkflowArtifact {
        private final ArtifactKind kind = ArtifactKind.EXTRACTED_TEXT;
        private List<ExtractedFileText> files = new ArrayList<>();
    }
}
