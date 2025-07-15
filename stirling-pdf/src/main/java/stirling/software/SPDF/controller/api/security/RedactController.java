package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNumber;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdfwriter.ContentStreamWriter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.SPDF.pdf.TextFinder;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.common.util.propertyeditor.StringToArrayListPropertyEditor;

@RestController
@RequestMapping("/api/v1/security")
@Slf4j
@Tag(name = "Security", description = "Security APIs")
@RequiredArgsConstructor
public class RedactController {

    private static final float DEFAULT_TEXT_PADDING_MULTIPLIER = 0.6f;
    private static final float PRECISION_THRESHOLD = 1e-3f;
    private static final int FONT_SCALE_FACTOR = 1000;

    // Text showing operators
    private static final Set<String> TEXT_SHOWING_OPERATORS = Set.of("Tj", "TJ", "'", "\"");

    private static final COSString EMPTY_COS_STRING = new COSString("");

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private String removeFileExtension(String filename) {
        return filename.replaceFirst("[.][^.]+$", "");
    }

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                List.class, "redactions", new StringToArrayListPropertyEditor());
    }

    @PostMapping(value = "/redact", consumes = "multipart/form-data")
    @Operation(
            summary = "Redact PDF manually",
            description =
                    "This endpoint redacts content from a PDF file based on manually specified areas. "
                            + "Users can specify areas to redact and optionally convert the PDF to an image. "
                            + "Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> redactPDF(@ModelAttribute ManualRedactPdfRequest request)
            throws IOException {

        MultipartFile file = request.getFileInput();
        List<RedactionArea> redactionAreas = request.getRedactions();

        try (PDDocument document = pdfDocumentFactory.load(file)) {
            PDPageTree allPages = document.getDocumentCatalog().getPages();

            redactPages(request, document, allPages);

            redactAreas(redactionAreas, document, allPages);

            if (Boolean.TRUE.equals(request.getConvertPDFToImage())) {
                try (PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document)) {
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    convertedPdf.save(baos);
                    byte[] pdfContent = baos.toByteArray();

                    return WebResponseUtils.bytesToWebResponse(
                            pdfContent,
                            removeFileExtension(
                                            Objects.requireNonNull(
                                                    Filenames.toSimpleFileName(
                                                            file.getOriginalFilename())))
                                    + "_redacted.pdf");
                }
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            byte[] pdfContent = baos.toByteArray();

            return WebResponseUtils.bytesToWebResponse(
                    pdfContent,
                    removeFileExtension(
                                    Objects.requireNonNull(
                                            Filenames.toSimpleFileName(file.getOriginalFilename())))
                            + "_redacted.pdf");
        }
    }

    private void redactAreas(
            List<RedactionArea> redactionAreas, PDDocument document, PDPageTree allPages)
            throws IOException {

        if (redactionAreas == null || redactionAreas.isEmpty()) {
            return;
        }

        Map<Integer, List<RedactionArea>> redactionsByPage = new HashMap<>();

        for (RedactionArea redactionArea : redactionAreas) {

            if (redactionArea.getPage() == null
                    || redactionArea.getPage() <= 0
                    || redactionArea.getHeight() == null
                    || redactionArea.getHeight() <= 0.0D
                    || redactionArea.getWidth() == null
                    || redactionArea.getWidth() <= 0.0D) {
                continue;
            }

            redactionsByPage
                    .computeIfAbsent(redactionArea.getPage(), k -> new ArrayList<>())
                    .add(redactionArea);
        }

        for (Map.Entry<Integer, List<RedactionArea>> entry : redactionsByPage.entrySet()) {
            Integer pageNumber = entry.getKey();
            List<RedactionArea> areasForPage = entry.getValue();

            if (pageNumber > allPages.getCount()) {
                continue; // Skip if the page number is out of bounds
            }

            PDPage page = allPages.get(pageNumber - 1);

            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {

                contentStream.saveGraphicsState();
                for (RedactionArea redactionArea : areasForPage) {
                    Color redactColor = decodeOrDefault(redactionArea.getColor());

                    contentStream.setNonStrokingColor(redactColor);

                    float x = redactionArea.getX().floatValue();
                    float y = redactionArea.getY().floatValue();
                    float width = redactionArea.getWidth().floatValue();
                    float height = redactionArea.getHeight().floatValue();

                    float pdfY = page.getBBox().getHeight() - y - height;

                    contentStream.addRect(x, pdfY, width, height);
                    contentStream.fill();
                }
                contentStream.restoreGraphicsState();
            }
        }
    }

    private void redactPages(
            ManualRedactPdfRequest request, PDDocument document, PDPageTree allPages)
            throws IOException {

        Color redactColor = decodeOrDefault(request.getPageRedactionColor());
        List<Integer> pageNumbers = getPageNumbers(request, allPages.getCount());

        for (Integer pageNumber : pageNumbers) {

            PDPage page = allPages.get(pageNumber);

            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                contentStream.setNonStrokingColor(redactColor);

                PDRectangle box = page.getBBox();

                contentStream.addRect(0, 0, box.getWidth(), box.getHeight());
                contentStream.fill();
            }
        }
    }

    private void redactFoundText(
            PDDocument document, List<PDFText> blocks, float customPadding, Color redactColor)
            throws IOException {

        var allPages = document.getDocumentCatalog().getPages();

        Map<Integer, List<PDFText>> blocksByPage = new HashMap<>();
        for (PDFText block : blocks) {
            blocksByPage.computeIfAbsent(block.getPageIndex(), k -> new ArrayList<>()).add(block);
        }

        for (Map.Entry<Integer, List<PDFText>> entry : blocksByPage.entrySet()) {
            Integer pageIndex = entry.getKey();
            List<PDFText> pageBlocks = entry.getValue();

            if (pageIndex >= allPages.getCount()) {
                continue; // Skip if page index is out of bounds
            }

            var page = allPages.get(pageIndex);
            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {

                contentStream.saveGraphicsState();

                try {
                    contentStream.setNonStrokingColor(redactColor);
                    PDRectangle pageBox = page.getBBox();

                    for (PDFText block : pageBlocks) {
                        float padding =
                                (block.getY2() - block.getY1()) * DEFAULT_TEXT_PADDING_MULTIPLIER
                                        + customPadding;

                        contentStream.addRect(
                                block.getX1(),
                                pageBox.getHeight() - block.getY2() - padding,
                                block.getX2() - block.getX1(),
                                block.getY2() - block.getY1() + 2 * padding);
                    }

                    contentStream.fill();

                } finally {
                    contentStream.restoreGraphicsState();
                }
            }
        }
    }

    String createPlaceholder(String originalWord) {
        if (originalWord == null || originalWord.isEmpty()) {
            return originalWord;
        }

        return " ".repeat(originalWord.length());
    }

    void writeFilteredContentStream(PDDocument document, PDPage page, List<Object> tokens)
            throws IOException {

        PDStream newStream = new PDStream(document);

        try {
            try (var out = newStream.createOutputStream()) {
                ContentStreamWriter writer = new ContentStreamWriter(out);
                writer.writeTokens(tokens);
            }

            page.setContents(newStream);

        } catch (IOException e) {
            throw new IOException("Failed to write filtered content stream to page", e);
        }
    }

    Color decodeOrDefault(String hex) {
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

    boolean isTextShowingOperator(String opName) {
        return TEXT_SHOWING_OPERATORS.contains(opName);
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

    @PostMapping(value = "/auto-redact", consumes = "multipart/form-data")
    @Operation(
            summary = "Redact PDF automatically",
            description =
                    "This endpoint automatically redacts text from a PDF file based on specified patterns. "
                            + "Users can provide text patterns to redact, with options for regex and whole word matching. "
                            + "Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> redactPdf(@ModelAttribute RedactPdfRequest request) {
        String[] listOfText = request.getListOfText().split("\n");
        boolean useRegex = Boolean.TRUE.equals(request.getUseRegex());
        boolean wholeWordSearchBool = Boolean.TRUE.equals(request.getWholeWordSearch());

        if (listOfText.length == 0 || (listOfText.length == 1 && listOfText[0].trim().isEmpty())) {
            throw new IllegalArgumentException("No text patterns provided for redaction");
        }

        PDDocument document = null;
        PDDocument fallbackDocument = null;

        try {
            if (request.getFileInput() == null) {
                log.error("File input is null");
                throw new IllegalArgumentException("File input cannot be null");
            }

            document = pdfDocumentFactory.load(request.getFileInput());

            if (document == null) {
                log.error("Failed to load PDF document");
                throw new IllegalArgumentException("Failed to load PDF document");
            }

            Map<Integer, List<PDFText>> allFoundTextsByPage =
                    findTextToRedact(document, listOfText, useRegex, wholeWordSearchBool);

            int totalMatches = allFoundTextsByPage.values().stream().mapToInt(List::size).sum();
            log.info(
                    "Redaction scan: {} occurrences across {} pages (patterns={}, regex={}, wholeWord={})",
                    totalMatches,
                    allFoundTextsByPage.size(),
                    listOfText.length,
                    useRegex,
                    wholeWordSearchBool);

            if (allFoundTextsByPage.isEmpty()) {
                log.info("No text found matching redaction patterns");
                byte[] originalContent;
                try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    document.save(baos);
                    originalContent = baos.toByteArray();
                }

                return WebResponseUtils.bytesToWebResponse(
                        originalContent,
                        removeFileExtension(
                                        Objects.requireNonNull(
                                                Filenames.toSimpleFileName(
                                                        request.getFileInput()
                                                                .getOriginalFilename())))
                                + "_redacted.pdf");
            }

            boolean fallbackToBoxOnlyMode;
            try {
                fallbackToBoxOnlyMode =
                        performTextReplacement(
                                document,
                                allFoundTextsByPage,
                                listOfText,
                                useRegex,
                                wholeWordSearchBool);
            } catch (Exception e) {
                log.warn(
                        "Text replacement redaction failed, falling back to box-only mode: {}",
                        e.getMessage());
                fallbackToBoxOnlyMode = true;
            }

            if (fallbackToBoxOnlyMode) {
                log.warn(
                        "Font compatibility issues detected. Using box-only redaction mode for better reliability.");

                fallbackDocument = pdfDocumentFactory.load(request.getFileInput());

                allFoundTextsByPage =
                        findTextToRedact(
                                fallbackDocument, listOfText, useRegex, wholeWordSearchBool);

                byte[] pdfContent =
                        finalizeRedaction(
                                fallbackDocument,
                                allFoundTextsByPage,
                                request.getRedactColor(),
                                request.getCustomPadding(),
                                request.getConvertPDFToImage());

                return WebResponseUtils.bytesToWebResponse(
                        pdfContent,
                        removeFileExtension(
                                        Objects.requireNonNull(
                                                Filenames.toSimpleFileName(
                                                        request.getFileInput()
                                                                .getOriginalFilename())))
                                + "_redacted.pdf");
            }

            byte[] pdfContent =
                    finalizeRedaction(
                            document,
                            allFoundTextsByPage,
                            request.getRedactColor(),
                            request.getCustomPadding(),
                            request.getConvertPDFToImage());

            return WebResponseUtils.bytesToWebResponse(
                    pdfContent,
                    removeFileExtension(
                                    Objects.requireNonNull(
                                            Filenames.toSimpleFileName(
                                                    request.getFileInput().getOriginalFilename())))
                            + "_redacted.pdf");

        } catch (Exception e) {
            log.error("Redaction operation failed: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to perform PDF redaction: " + e.getMessage(), e);

        } finally {
            if (document != null) {
                try {
                    if (fallbackDocument == null) {
                        document.close();
                    }
                } catch (IOException e) {
                    log.warn("Failed to close main document: {}", e.getMessage());
                }
            }

            if (fallbackDocument != null) {
                try {
                    fallbackDocument.close();
                } catch (IOException e) {
                    log.warn("Failed to close fallback document: {}", e.getMessage());
                }
            }
        }
    }

    private Map<Integer, List<PDFText>> findTextToRedact(
            PDDocument document, String[] listOfText, boolean useRegex, boolean wholeWordSearch) {
        Map<Integer, List<PDFText>> allFoundTextsByPage = new HashMap<>();

        for (String text : listOfText) {
            text = text.trim();
            if (text.isEmpty()) continue;

            try {
                int pageCount = document.getNumberOfPages();
                for (int pageIndex = 0; pageIndex < pageCount; pageIndex++) {
                    try (PDDocument singlePageDoc = new PDDocument()) {
                        PDPage page = document.getPage(pageIndex);
                        singlePageDoc.addPage(page);

                        TextFinder pageFinder = new TextFinder(text, useRegex, wholeWordSearch);

                        pageFinder.getText(singlePageDoc);

                        for (PDFText found : pageFinder.getFoundTexts()) {
                            PDFText adjustedText =
                                    new PDFText(
                                            pageIndex,
                                            found.getX1(),
                                            found.getY1(),
                                            found.getX2(),
                                            found.getY2(),
                                            found.getText());

                            allFoundTextsByPage
                                    .computeIfAbsent(pageIndex, k -> new ArrayList<>())
                                    .add(adjustedText);
                        }
                    } catch (Exception e) {
                        log.error(
                                "Error processing page {} for search term '{}': {}",
                                pageIndex,
                                text,
                                e.getMessage());
                    }
                }
            } catch (Exception e) {
                log.error(
                        "Error initializing TextFinder for search term '{}': {}",
                        text,
                        e.getMessage());
            }
        }

        return allFoundTextsByPage;
    }

    private boolean performTextReplacement(
            PDDocument document,
            Map<Integer, List<PDFText>> allFoundTextsByPage,
            String[] listOfText,
            boolean useRegex,
            boolean wholeWordSearchBool) {
        if (allFoundTextsByPage.isEmpty()) {
            return false;
        }

        if (detectCustomEncodingFonts(document)) {
            log.warn(
                    "Problematic fonts detected (custom encodings / Type3 / damaged). "
                            + "Skipping inline text replacement and using box-only redaction for safety.");
            return true; // signal caller to fall back
        }

        try {
            Set<String> allSearchTerms =
                    Arrays.stream(listOfText)
                            .map(String::trim)
                            .filter(s -> !s.isEmpty())
                            .collect(Collectors.toSet());

            for (PDPage page : document.getPages()) {
                List<Object> filteredTokens =
                        createTokensWithoutTargetText(
                                document, page, allSearchTerms, useRegex, wholeWordSearchBool);
                writeFilteredContentStream(document, page, filteredTokens);
            }
            log.info("Successfully performed text replacement redaction.");
            return false;
        } catch (Exception e) {
            log.error(
                    "Text replacement redaction failed due to font or encoding issues. "
                            + "Will fall back to box-only redaction mode. Error: {}",
                    e.getMessage());
            return true;
        }
    }

    private byte[] finalizeRedaction(
            PDDocument document,
            Map<Integer, List<PDFText>> allFoundTextsByPage,
            String colorString,
            float customPadding,
            Boolean convertToImage)
            throws IOException {

        List<PDFText> allFoundTexts = new ArrayList<>();
        for (List<PDFText> pageTexts : allFoundTextsByPage.values()) {
            allFoundTexts.addAll(pageTexts);
        }

        if (!allFoundTexts.isEmpty()) {
            Color redactColor = decodeOrDefault(colorString);

            redactFoundText(document, allFoundTexts, customPadding, redactColor);

            cleanDocumentMetadata(document);
        }

        if (Boolean.TRUE.equals(convertToImage)) {
            try (PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document)) {
                cleanDocumentMetadata(convertedPdf);

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                convertedPdf.save(baos);
                byte[] out = baos.toByteArray();

                log.info(
                        "Redaction finalized (image mode): {} pages ➜ {} KB",
                        convertedPdf.getNumberOfPages(),
                        out.length / 1024);

                return out;
            }
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        byte[] out = baos.toByteArray();

        log.info(
                "Redaction finalized: {} pages ➜ {} KB",
                document.getNumberOfPages(),
                out.length / 1024);

        return out;
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

    List<Object> createTokensWithoutTargetText(
            PDDocument document,
            PDPage page,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch)
            throws IOException {

        PDFStreamParser parser = new PDFStreamParser(page);
        List<Object> tokens = new ArrayList<>();
        Object token;
        while ((token = parser.parseNextToken()) != null) {
            tokens.add(token);
        }

        PDResources resources = page.getResources();
        if (resources != null) {
            processPageXObjects(document, resources, targetWords, useRegex, wholeWordSearch);
        }

        List<TextSegment> textSegments = extractTextSegments(page, tokens);

        String completeText = buildCompleteText(textSegments);

        List<MatchRange> matches =
                findAllMatches(completeText, targetWords, useRegex, wholeWordSearch);

        return applyRedactionsToTokens(tokens, textSegments, matches);
    }

    List<Object> createTokensWithoutTargetText(
            PDPage page, Set<String> targetWords, boolean useRegex, boolean wholeWordSearch)
            throws IOException {
        try (PDDocument tempDoc = new PDDocument()) {
            return createTokensWithoutTargetText(
                    tempDoc, page, targetWords, useRegex, wholeWordSearch);
        }
    }

    private void processPageXObjects(
            PDDocument document,
            PDResources resources,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch) {

        for (COSName xobjName : resources.getXObjectNames()) {
            try {
                PDXObject xobj = resources.getXObject(xobjName);
                if (xobj instanceof PDFormXObject formXObj) {
                    processFormXObject(document, formXObj, targetWords, useRegex, wholeWordSearch);
                    log.debug("Processed Form XObject: {}", xobjName.getName());
                }
            } catch (Exception e) {
                log.warn("Failed to process XObject {}: {}", xobjName.getName(), e.getMessage());
            }
        }
    }

    @Data
    private static class GraphicsState {
        private PDFont font = null;
        private float fontSize = 0;
    }

    @Data
    @AllArgsConstructor
    private static class TextSegment {
        private int tokenIndex;
        private String operatorName;
        private String text;
        private int startPos;
        private int endPos;
        private PDFont font;
        private float fontSize;
    }

    @Data
    @AllArgsConstructor
    private static class MatchRange {
        private int startPos;
        private int endPos;
    }

    private List<TextSegment> extractTextSegments(PDPage page, List<Object> tokens) {

        List<TextSegment> segments = new ArrayList<>();
        int currentTextPos = 0;
        GraphicsState graphicsState = new GraphicsState();
        PDResources resources = page.getResources();

        for (int i = 0; i < tokens.size(); i++) {
            Object currentToken = tokens.get(i);

            if (currentToken instanceof Operator op) {
                String opName = op.getName();

                if ("Tf".equals(opName) && i >= 2) {
                    try {
                        COSName fontName = (COSName) tokens.get(i - 2);
                        COSBase fontSizeBase = (COSBase) tokens.get(i - 1);
                        if (fontSizeBase instanceof COSNumber cosNumber) {
                            graphicsState.setFont(resources.getFont(fontName));
                            graphicsState.setFontSize(cosNumber.floatValue());
                        }
                    } catch (ClassCastException | IOException e) {
                        log.debug(
                                "Failed to extract font and font size from Tf operator: {}",
                                e.getMessage());
                    }
                }

                currentTextPos =
                        getCurrentTextPos(
                                tokens, segments, currentTextPos, graphicsState, i, opName);
            }
        }

        return segments;
    }

    private String buildCompleteText(List<TextSegment> segments) {
        StringBuilder sb = new StringBuilder();
        for (TextSegment segment : segments) {
            sb.append(segment.text);
        }
        return sb.toString();
    }

    private List<MatchRange> findAllMatches(
            String completeText,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch) {

        return targetWords.stream()
                .map(
                        target -> {
                            String patternString = useRegex ? target : Pattern.quote(target);
                            if (wholeWordSearch) {
                                patternString = "\\b" + patternString + "\\b";
                            }
                            return Pattern.compile(patternString, Pattern.CASE_INSENSITIVE);
                        })
                .flatMap(pattern -> pattern.matcher(completeText).results())
                .map(matchResult -> new MatchRange(matchResult.start(), matchResult.end()))
                .sorted(Comparator.comparingInt(MatchRange::getStartPos))
                .collect(Collectors.toList());
    }

    private List<Object> applyRedactionsToTokens(
            List<Object> tokens, List<TextSegment> textSegments, List<MatchRange> matches) {

        long startTime = System.currentTimeMillis();

        try {
            List<Object> newTokens = new ArrayList<>(tokens);

            Map<Integer, List<MatchRange>> matchesBySegment = new HashMap<>();
            for (MatchRange match : matches) {
                for (int i = 0; i < textSegments.size(); i++) {
                    TextSegment segment = textSegments.get(i);
                    int overlapStart = Math.max(match.startPos, segment.startPos);
                    int overlapEnd = Math.min(match.endPos, segment.endPos);
                    if (overlapStart < overlapEnd) {
                        matchesBySegment.computeIfAbsent(i, k -> new ArrayList<>()).add(match);
                    }
                }
            }

            List<ModificationTask> tasks = new ArrayList<>();
            for (Map.Entry<Integer, List<MatchRange>> entry : matchesBySegment.entrySet()) {
                int segmentIndex = entry.getKey();
                List<MatchRange> segmentMatches = entry.getValue();
                TextSegment segment = textSegments.get(segmentIndex);

                if ("Tj".equals(segment.operatorName) || "'".equals(segment.operatorName)) {
                    String newText = applyRedactionsToSegmentText(segment, segmentMatches);
                    try {
                        float adjustment = calculateWidthAdjustment(segment, segmentMatches);
                        tasks.add(new ModificationTask(segment, newText, adjustment));
                    } catch (Exception e) {
                        log.debug(
                                "Width adjustment calculation failed for segment: {}",
                                e.getMessage());
                    }
                } else if ("TJ".equals(segment.operatorName)) {
                    tasks.add(new ModificationTask(segment, null, 0));
                }
            }

            tasks.sort((a, b) -> Integer.compare(b.segment.tokenIndex, a.segment.tokenIndex));

            for (ModificationTask task : tasks) {
                List<MatchRange> segmentMatches =
                        matchesBySegment.getOrDefault(
                                textSegments.indexOf(task.segment), Collections.emptyList());
                modifyTokenForRedaction(
                        newTokens, task.segment, task.newText, task.adjustment, segmentMatches);
            }

            return newTokens;

        } finally {
            long processingTime = System.currentTimeMillis() - startTime;
            log.debug(
                    "Token redaction processing completed in {} ms for {} matches",
                    processingTime,
                    matches.size());
        }
    }

    @Data
    @AllArgsConstructor
    private static class ModificationTask {
        private TextSegment segment;
        private String newText; // Only for Tj
        private float adjustment; // Only for Tj
    }

    private String applyRedactionsToSegmentText(TextSegment segment, List<MatchRange> matches) {
        String text = segment.getText();
        StringBuilder result = new StringBuilder(text);

        for (MatchRange match : matches) {
            int segmentStart = Math.max(0, match.getStartPos() - segment.getStartPos());
            int segmentEnd = Math.min(text.length(), match.getEndPos() - segment.getStartPos());

            if (segmentStart < text.length() && segmentEnd > segmentStart) {
                String placeholder = createPlaceholder(text.substring(segmentStart, segmentEnd));
                result.replace(segmentStart, segmentEnd, placeholder);
            }
        }

        return result.toString();
    }

    private float safeGetStringWidth(PDFont font, String text) {
        if (font == null || text == null || text.isEmpty()) {
            return 0;
        }

        try {
            return font.getStringWidth(text);
        } catch (Exception e) {
            try {
                float totalWidth = 0;
                for (int i = 0; i < text.length(); i++) {
                    String character = text.substring(i, i + 1);
                    try {
                        byte[] encoded = font.encode(character);
                        if (encoded.length > 0) {
                            int glyphCode = encoded[0] & 0xFF;

                            float glyphWidth = font.getWidth(glyphCode);

                            if (glyphWidth == 0) {
                                try {
                                    glyphWidth = font.getWidthFromFont(glyphCode);
                                } catch (Exception e2) {
                                    glyphWidth = font.getAverageFontWidth();
                                }
                            }

                            totalWidth += glyphWidth;
                        } else {
                            totalWidth += font.getAverageFontWidth();
                        }
                    } catch (Exception e2) {
                        totalWidth += font.getAverageFontWidth();
                    }
                }
                return totalWidth;
            } catch (Exception e2) {
                log.debug("PDFBox API width calculation failed: {}", e2.getMessage());
            }

            try {
                if (font.getFontDescriptor() != null
                        && font.getFontDescriptor().getFontBoundingBox() != null) {
                    PDRectangle bbox = font.getFontDescriptor().getFontBoundingBox();
                    float avgCharWidth = bbox.getHeight() / 1000f * 0.865f;
                    return text.length() * avgCharWidth * FONT_SCALE_FACTOR;
                }
            } catch (Exception e2) {
                log.debug("Font bounding box width calculation failed: {}", e2.getMessage());
            }

            try {
                float avgWidth = font.getAverageFontWidth();
                return text.length() * avgWidth;
            } catch (Exception e2) {
                log.debug("Average font width calculation failed: {}", e2.getMessage());
            }

            float conservativeWidth = text.length() * 500f; // 500 units per character
            log.debug(
                    "All width calculation methods failed for font {}, using conservative estimate: {}",
                    font.getName(),
                    conservativeWidth);
            return conservativeWidth;
        }
    }

    private float calculateWidthAdjustment(TextSegment segment, List<MatchRange> matches) {
        try {
            if (segment.getFont() == null || segment.getFontSize() <= 0) {
                return 0;
            }

            String fontName = segment.getFont().getName();
            if (fontName != null && (fontName.contains("HOEPAP") || isFontSubset(fontName))) {
                log.debug("Skipping width adjustment for problematic/subset font: {}", fontName);
                return 0;
            }

            float totalOriginal = 0;
            float totalPlaceholder = 0;

            String text = segment.getText();

            for (MatchRange match : matches) {
                int segStart = Math.max(0, match.getStartPos() - segment.getStartPos());
                int segEnd = Math.min(text.length(), match.getEndPos() - segment.getStartPos());

                if (segStart < text.length() && segEnd > segStart) {
                    String originalPart = text.substring(segStart, segEnd);
                    String placeholderPart = createPlaceholder(originalPart);

                    float origUnits = safeGetStringWidth(segment.getFont(), originalPart);
                    float placeUnits = safeGetStringWidth(segment.getFont(), placeholderPart);

                    float orig = (origUnits / FONT_SCALE_FACTOR) * segment.getFontSize();
                    float place = (placeUnits / FONT_SCALE_FACTOR) * segment.getFontSize();

                    totalOriginal += orig;
                    totalPlaceholder += place;
                }
            }

            float adjustment = totalOriginal - totalPlaceholder;

            float maxReasonableAdjustment = segment.getText().length() * segment.getFontSize() * 2;
            if (Math.abs(adjustment) > maxReasonableAdjustment) {
                log.debug(
                        "Width adjustment {} seems unreasonable for text length {}, capping to 0",
                        adjustment,
                        segment.getText().length());
                return 0;
            }

            return adjustment;
        } catch (Exception ex) {
            log.debug("Width adjustment failed: {}", ex.getMessage());
            return 0;
        }
    }

    private void modifyTokenForRedaction(
            List<Object> tokens,
            TextSegment segment,
            String newText,
            float adjustment,
            List<MatchRange> matches) {

        if (segment.getTokenIndex() < 0 || segment.getTokenIndex() >= tokens.size()) {
            return;
        }

        Object token = tokens.get(segment.getTokenIndex());
        String operatorName = segment.getOperatorName();

        try {
            if (("Tj".equals(operatorName) || "'".equals(operatorName))
                    && token instanceof COSString) {

                if (Math.abs(adjustment) < PRECISION_THRESHOLD) {
                    if (newText.isEmpty()) {
                        tokens.set(segment.getTokenIndex(), EMPTY_COS_STRING);
                    } else {
                        tokens.set(segment.getTokenIndex(), new COSString(newText));
                    }
                } else {
                    COSArray newArray = new COSArray();
                    newArray.add(new COSString(newText));
                    if (segment.getFontSize() > 0) {

                        float kerning = (-adjustment / segment.getFontSize()) * FONT_SCALE_FACTOR;

                        newArray.add(new COSFloat(kerning));
                    }
                    tokens.set(segment.getTokenIndex(), newArray);

                    int operatorIndex = segment.getTokenIndex() + 1;
                    if (operatorIndex < tokens.size()
                            && tokens.get(operatorIndex) instanceof Operator op
                            && op.getName().equals(operatorName)) {
                        tokens.set(operatorIndex, Operator.getOperator("TJ"));
                    }
                }
            } else if ("TJ".equals(operatorName) && token instanceof COSArray) {
                COSArray newArray = createRedactedTJArray((COSArray) token, segment, matches);
                tokens.set(segment.getTokenIndex(), newArray);
            }
        } catch (Exception e) {
            log.debug(
                    "Token modification failed for segment at index {}: {}",
                    segment.getTokenIndex(),
                    e.getMessage());
        }
    }

    private COSArray createRedactedTJArray(
            COSArray originalArray, TextSegment segment, List<MatchRange> matches) {
        try {
            COSArray newArray = new COSArray();
            int textOffsetInSegment = 0;

            for (COSBase element : originalArray) {
                if (element instanceof COSString cosString) {
                    String originalText = cosString.getString();
                    StringBuilder newText = new StringBuilder(originalText);
                    boolean modified = false;

                    for (MatchRange match : matches) {
                        int stringStartInPage = segment.getStartPos() + textOffsetInSegment;
                        int stringEndInPage = stringStartInPage + originalText.length();

                        int overlapStart = Math.max(match.getStartPos(), stringStartInPage);
                        int overlapEnd = Math.min(match.getEndPos(), stringEndInPage);

                        if (overlapStart < overlapEnd) {
                            modified = true;
                            int redactionStartInString = overlapStart - stringStartInPage;
                            int redactionEndInString = overlapEnd - stringStartInPage;
                            if (redactionStartInString >= 0
                                    && redactionEndInString <= originalText.length()) {
                                String placeholder =
                                        createPlaceholder(
                                                originalText.substring(
                                                        redactionStartInString,
                                                        redactionEndInString));
                                newText.replace(
                                        redactionStartInString, redactionEndInString, placeholder);
                            }
                        }
                    }

                    String modifiedString = newText.toString();
                    newArray.add(new COSString(modifiedString));

                    if (modified && segment.getFont() != null && segment.getFontSize() > 0) {
                        try {
                            float originalWidth =
                                    safeGetStringWidth(segment.getFont(), originalText)
                                            / FONT_SCALE_FACTOR
                                            * segment.getFontSize();
                            float modifiedWidth =
                                    safeGetStringWidth(segment.getFont(), modifiedString)
                                            / FONT_SCALE_FACTOR
                                            * segment.getFontSize();
                            float adjustment = originalWidth - modifiedWidth;
                            if (Math.abs(adjustment) > PRECISION_THRESHOLD) {
                                float kerning =
                                        (-adjustment / segment.getFontSize())
                                                * FONT_SCALE_FACTOR
                                                * 1.10f;

                                newArray.add(new COSFloat(kerning));
                            }
                        } catch (Exception e) {
                            log.debug(
                                    "Width adjustment calculation failed for segment: {}",
                                    e.getMessage());
                        }
                    }

                    textOffsetInSegment += originalText.length();
                } else {
                    newArray.add(element);
                }
            }
            return newArray;
        } catch (Exception e) {
            return originalArray;
        }
    }

    private String extractTextFromToken(Object token, String operatorName) {
        return switch (operatorName) {
            case "Tj", "'" -> {
                if (token instanceof COSString cosString) {
                    yield cosString.getString();
                }
                yield "";
            }
            case "TJ" -> {
                if (token instanceof COSArray cosArray) {
                    StringBuilder sb = new StringBuilder();
                    for (COSBase element : cosArray) {
                        if (element instanceof COSString cosString) {
                            sb.append(cosString.getString());
                        }
                    }
                    yield sb.toString();
                }
                yield "";
            }
            default -> "";
        };
    }

    private boolean detectCustomEncodingFonts(PDDocument document) {
        try {
            var documentCatalog = document.getDocumentCatalog();
            if (documentCatalog == null) {
                return false;
            }

            for (PDPage page : document.getPages()) {
                PDResources resources = page.getResources();
                if (resources == null) {
                    continue;
                }

                for (COSName fontName : resources.getFontNames()) {
                    try {
                        PDFont font = resources.getFont(fontName);
                        if (font != null && hasProblematicFontCharacteristics(font)) {
                            log.debug(
                                    "Detected problematic font: {} (type: {})",
                                    font.getName(),
                                    font.getClass().getSimpleName());
                            return true;
                        }
                    } catch (IOException e) {
                        log.debug(
                                "Font loading failed for {}: {}",
                                fontName.getName(),
                                e.getMessage());
                        return true;
                    }
                }
            }
            return false;
        } catch (Exception e) {
            log.warn("Font detection analysis failed: {}", e.getMessage());
            return false;
        }
    }

    private boolean hasProblematicFontCharacteristics(PDFont font) {
        try {
            if (font.isDamaged()) {
                log.debug("Font {} is marked as damaged by PDFBox", font.getName());
                return true;
            }

            String fontName = font.getName();
            if (isFontSubset(fontName)) {
                if (hasKnownProblematicPattern(fontName)) {
                    return cannotCalculateBasicWidths(font);
                }
                return false;
            }

            String fontType = font.getClass().getSimpleName();
            if ("PDType3Font".equals(fontType)) {
                return cannotCalculateBasicWidths(font);
            }

            return false;

        } catch (Exception e) {
            log.debug("Font analysis failed for {}: {}", font.getName(), e.getMessage());
            return true;
        }
    }

    private boolean cannotCalculateBasicWidths(PDFont font) {
        try {
            float spaceWidth = font.getStringWidth(" ");
            if (spaceWidth <= 0) {
                return true;
            }

            String[] testChars = {"a", "A", "0", ".", "e", "!"};
            for (String ch : testChars) {
                try {
                    float width = font.getStringWidth(ch);
                    if (width > 0) {
                        return false; // Found at least one character we can measure
                    }
                } catch (Exception e) {
                }
            }

            return true; // Can't calculate width for any test characters
        } catch (Exception e) {
            return true; // Font failed basic width calculation
        }
    }

    private boolean isFontSubset(String fontName) {
        if (fontName == null) {
            return false;
        }
        return fontName.matches("^[A-Z]{6}\\+.*");
    }

    private boolean hasKnownProblematicPattern(String fontName) {
        if (fontName == null) {
            return false;
        }

        return fontName.contains("HOEPAP")
                || fontName.contains("HOEPGL")
                || fontName.contains("HOEPNL")
                || fontName.toLowerCase().contains("corrupt")
                || fontName.toLowerCase().contains("damaged");
    }

    private void processFormXObject(
            PDDocument document,
            PDFormXObject formXObject,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch) {

        try {
            PDResources xobjResources = formXObject.getResources();
            if (xobjResources == null) {
                return;
            }

            for (COSName xobjName : xobjResources.getXObjectNames()) {
                PDXObject nestedXObj = xobjResources.getXObject(xobjName);
                if (nestedXObj instanceof PDFormXObject nestedFormXObj) {
                    processFormXObject(
                            document, nestedFormXObj, targetWords, useRegex, wholeWordSearch);
                }
            }

            PDFStreamParser parser = new PDFStreamParser(formXObject);
            List<Object> tokens = new ArrayList<>();
            Object token;
            while ((token = parser.parseNextToken()) != null) {
                tokens.add(token);
            }

            List<TextSegment> textSegments = extractTextSegmentsFromXObject(xobjResources, tokens);
            String completeText = buildCompleteText(textSegments);

            List<MatchRange> matches =
                    findAllMatches(completeText, targetWords, useRegex, wholeWordSearch);

            if (!matches.isEmpty()) {
                List<Object> redactedTokens =
                        applyRedactionsToTokens(tokens, textSegments, matches);
                writeRedactedContentToXObject(document, formXObject, redactedTokens);
                log.debug("Processed {} redactions in Form XObject", matches.size());
            }

        } catch (Exception e) {
            log.warn("Failed to process Form XObject: {}", e.getMessage());
        }
    }

    private List<TextSegment> extractTextSegmentsFromXObject(
            PDResources resources, List<Object> tokens) {
        List<TextSegment> segments = new ArrayList<>();
        int currentTextPos = 0;
        GraphicsState graphicsState = new GraphicsState();

        for (int i = 0; i < tokens.size(); i++) {
            Object currentToken = tokens.get(i);

            if (currentToken instanceof Operator op) {
                String opName = op.getName();

                if ("Tf".equals(opName) && i >= 2) {
                    try {
                        COSName fontName = (COSName) tokens.get(i - 2);
                        COSBase fontSizeBase = (COSBase) tokens.get(i - 1);
                        if (fontSizeBase instanceof COSNumber cosNumber) {
                            graphicsState.setFont(resources.getFont(fontName));
                            graphicsState.setFontSize(cosNumber.floatValue());
                        }
                    } catch (ClassCastException | IOException e) {
                        log.debug("Font extraction failed in XObject: {}", e.getMessage());
                    }
                }

                currentTextPos =
                        getCurrentTextPos(
                                tokens, segments, currentTextPos, graphicsState, i, opName);
            }
        }

        return segments;
    }

    private int getCurrentTextPos(
            List<Object> tokens,
            List<TextSegment> segments,
            int currentTextPos,
            GraphicsState graphicsState,
            int i,
            String opName) {
        if (isTextShowingOperator(opName) && i > 0) {
            String textContent = extractTextFromToken(tokens.get(i - 1), opName);
            if (!textContent.isEmpty()) {
                segments.add(
                        new TextSegment(
                                i - 1,
                                opName,
                                textContent,
                                currentTextPos,
                                currentTextPos + textContent.length(),
                                graphicsState.font,
                                graphicsState.fontSize));
                currentTextPos += textContent.length();
            }
        }
        return currentTextPos;
    }

    private void writeRedactedContentToXObject(
            PDDocument document, PDFormXObject formXObject, List<Object> redactedTokens)
            throws IOException {

        PDStream newStream = new PDStream(document);

        try (var out = newStream.createOutputStream()) {
            ContentStreamWriter writer = new ContentStreamWriter(out);
            writer.writeTokens(redactedTokens);
        }

        formXObject.getCOSObject().removeItem(COSName.CONTENTS);
        formXObject.getCOSObject().setItem(COSName.CONTENTS, newStream.getCOSObject());
    }
}
