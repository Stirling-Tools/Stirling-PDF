package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
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
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
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

    private static final float DEFAULT_TEXT_PADDING_MULTIPLIER = 0.3f;
    private static final float PRECISION_THRESHOLD = 1e-3f;
    private static final int FONT_SCALE_FACTOR = 1000;

    // Text showing operators
    private static final Set<String> TEXT_SHOWING_OPERATORS = Set.of("Tj", "TJ", "'", "\"");

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                List.class, "redactions", new StringToArrayListPropertyEditor());
    }

    @PostMapping(value = "/redact", consumes = "multipart/form-data")
    @Operation(
            summary = "Redacts areas and pages in a PDF document",
            description =
                    "This operation takes an input PDF file with a list of areas, page"
                            + " number(s)/range(s)/function(s) to redact. Input:PDF, Output:PDF,"
                            + " Type:SISO")
    public ResponseEntity<byte[]> redactPDF(@ModelAttribute ManualRedactPdfRequest request)
            throws IOException {
        log.debug(
                "Starting manual redaction for file: {}",
                request.getFileInput().getOriginalFilename());

        MultipartFile file = request.getFileInput();
        List<RedactionArea> redactionAreas = request.getRedactions();

        log.debug(
                "Processing {} redaction areas",
                redactionAreas != null ? redactionAreas.size() : 0);

        PDDocument document = pdfDocumentFactory.load(file);
        log.debug("Loaded PDF document with {} pages", document.getNumberOfPages());

        PDPageTree allPages = document.getDocumentCatalog().getPages();

        log.debug("Starting page redactions");
        redactPages(request, document, allPages);

        log.debug("Starting area redactions");
        redactAreas(redactionAreas, document, allPages);

        if (Boolean.TRUE.equals(request.getConvertPDFToImage())) {
            log.debug("Converting PDF to image format");
            PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document);
            document.close();
            document = convertedPdf;
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        document.close();

        byte[] pdfContent = baos.toByteArray();
        log.debug("Manual redaction completed. Output PDF size: {} bytes", pdfContent.length);

        return WebResponseUtils.bytesToWebResponse(
                pdfContent,
                Objects.requireNonNull(Filenames.toSimpleFileName(file.getOriginalFilename()))
                                .replaceFirst("[.][^.]+$", "")
                        + "_redacted.pdf");
    }

    private void redactAreas(
            List<RedactionArea> redactionAreas, PDDocument document, PDPageTree allPages)
            throws IOException {
        log.debug("Processing redaction areas");

        if (redactionAreas == null || redactionAreas.isEmpty()) {
            log.debug("No redaction areas to process");
            return;
        }

        // Group redaction areas by page
        Map<Integer, List<RedactionArea>> redactionsByPage = new HashMap<>();

        // Process and validate each redaction area
        for (RedactionArea redactionArea : redactionAreas) {
            log.debug(
                    "Validating redaction area on page {}: x={}, y={}, width={}, height={}",
                    redactionArea.getPage(),
                    redactionArea.getX(),
                    redactionArea.getY(),
                    redactionArea.getWidth(),
                    redactionArea.getHeight());

            if (redactionArea.getPage() == null
                    || redactionArea.getPage() <= 0
                    || redactionArea.getHeight() == null
                    || redactionArea.getHeight() <= 0.0D
                    || redactionArea.getWidth() == null
                    || redactionArea.getWidth() <= 0.0D) {
                log.debug("Skipping invalid redaction area: {}", redactionArea);
                continue;
            }

            // Group by page number
            redactionsByPage
                    .computeIfAbsent(redactionArea.getPage(), k -> new ArrayList<>())
                    .add(redactionArea);
        }

        log.debug("Grouped redactions by page: {} pages affected", redactionsByPage.size());

        // Process each page only once
        for (Map.Entry<Integer, List<RedactionArea>> entry : redactionsByPage.entrySet()) {
            Integer pageNumber = entry.getKey();
            List<RedactionArea> areasForPage = entry.getValue();

            log.debug(
                    "Processing page {} with {} redaction areas", pageNumber, areasForPage.size());

            if (pageNumber > allPages.getCount()) {
                log.debug(
                        "Skipping page {} - out of bounds (total pages: {})",
                        pageNumber,
                        allPages.getCount());
                continue; // Skip if the page number is out of bounds
            }

            PDPage page = allPages.get(pageNumber - 1);

            // Create only one content stream per page to draw all redaction boxes
            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {

                // Process all redactions for this page
                for (RedactionArea redactionArea : areasForPage) {
                    Color redactColor = decodeOrDefault(redactionArea.getColor());
                    log.debug(
                            "Applying redaction with color {} at ({}, {}) size {}x{}",
                            redactColor,
                            redactionArea.getX(),
                            redactionArea.getY(),
                            redactionArea.getWidth(),
                            redactionArea.getHeight());

                    contentStream.setNonStrokingColor(redactColor);

                    float x = redactionArea.getX().floatValue();
                    float y = redactionArea.getY().floatValue();
                    float width = redactionArea.getWidth().floatValue();
                    float height = redactionArea.getHeight().floatValue();

                    // The y-coordinate needs to be transformed from a top-left origin to a
                    // bottom-left origin.
                    float pdfY = page.getBBox().getHeight() - y - height;

                    contentStream.addRect(x, pdfY, width, height);
                    contentStream.fill();
                }
            }
        }

        log.debug("Completed redaction areas processing");
    }

    private void redactPages(
            ManualRedactPdfRequest request, PDDocument document, PDPageTree allPages)
            throws IOException {

        Color redactColor = decodeOrDefault(request.getPageRedactionColor());
        List<Integer> pageNumbers = getPageNumbers(request, allPages.getCount());

        log.debug("Redacting {} pages with color {}", pageNumbers.size(), redactColor);

        for (Integer pageNumber : pageNumbers) {
            log.debug("Redacting entire page {}", pageNumber + 1);

            PDPage page = allPages.get(pageNumber);

            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                contentStream.setNonStrokingColor(redactColor);

                PDRectangle box = page.getBBox();
                log.debug(
                        "Page {} dimensions: {}x{}",
                        pageNumber + 1,
                        box.getWidth(),
                        box.getHeight());

                contentStream.addRect(0, 0, box.getWidth(), box.getHeight());
                contentStream.fill();
            }
        }

        log.debug("Completed page redactions");
    }

    private void redactFoundText(
            PDDocument document, List<PDFText> blocks, float customPadding, Color redactColor)
            throws IOException {
        log.debug(
                "Redacting {} text blocks with padding {} and color {}",
                blocks.size(),
                customPadding,
                redactColor);

        var allPages = document.getDocumentCatalog().getPages();

        for (PDFText block : blocks) {
            log.debug(
                    "Redacting text block on page {}: '{}' at ({}, {}) to ({}, {})",
                    block.getPageIndex() + 1,
                    block.getText(),
                    block.getX1(),
                    block.getY1(),
                    block.getX2(),
                    block.getY2());

            var page = allPages.get(block.getPageIndex());
            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                contentStream.setNonStrokingColor(redactColor);
                float padding =
                        (block.getY2() - block.getY1()) * DEFAULT_TEXT_PADDING_MULTIPLIER
                                + customPadding;
                PDRectangle pageBox = page.getBBox();
                contentStream.addRect(
                        block.getX1(),
                        pageBox.getHeight() - block.getY2() - padding,
                        block.getX2() - block.getX1(),
                        block.getY2() - block.getY1() + 2 * padding);
                contentStream.fill();
            }
        }

        log.debug("Completed text block redactions");
    }

    String createPlaceholder(String originalWord) {
        if (originalWord == null || originalWord.isEmpty()) {
            return originalWord;
        }

        return " ".repeat(originalWord.length());
    }

    void writeFilteredContentStream(PDDocument document, PDPage page, List<Object> tokens)
            throws IOException {
        log.debug("Writing filtered content stream with {} tokens", tokens.size());

        PDStream newStream = new PDStream(document);
        try (var out = newStream.createOutputStream()) {
            ContentStreamWriter writer = new ContentStreamWriter(out);
            writer.writeTokens(tokens);
        }
        page.setContents(newStream);

        log.debug("Successfully wrote filtered content stream");
    }

    Color decodeOrDefault(String hex) {
        if (hex == null) {
            return Color.BLACK;
        }

        String colorString = hex.startsWith("#") ? hex : "#" + hex;

        try {
            return Color.decode(colorString);
        } catch (NumberFormatException e) {
            log.warn("Invalid color string '{}'. Using default color BLACK.", hex);
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
            summary = "Redacts listOfText in a PDF document",
            description =
                    "This operation takes an input PDF file and redacts the provided listOfText."
                            + " Input:PDF, Output:PDF, Type:SISO")
    public ResponseEntity<byte[]> redactPdf(@ModelAttribute RedactPdfRequest request)
            throws Exception {
        log.debug(
                "Starting auto-redaction for file: {}",
                request.getFileInput().getOriginalFilename());

        MultipartFile file = request.getFileInput();
        String listOfTextString = request.getListOfText();
        boolean useRegex = Boolean.TRUE.equals(request.getUseRegex());
        boolean wholeWordSearchBool = Boolean.TRUE.equals(request.getWholeWordSearch());
        String colorString = request.getRedactColor();
        float customPadding = request.getCustomPadding();
        boolean convertPDFToImage = Boolean.TRUE.equals(request.getConvertPDFToImage());

        log.debug(
                "Auto-redaction parameters: useRegex={}, wholeWordSearch={}, customPadding={}, convertToImage={}",
                useRegex,
                wholeWordSearchBool,
                customPadding,
                convertPDFToImage);

        String[] listOfText = listOfTextString.split("\n");
        log.debug("Searching for {} text patterns", listOfText.length);

        PDDocument document = pdfDocumentFactory.load(file);

        Color redactColor = decodeOrDefault(colorString);
        log.debug("Using redaction color: {}", redactColor);

        // Step 1: Find all text locations for all search terms
        log.debug("Step 1: Finding all text locations");
        Map<Integer, List<PDFText>> allFoundTextsByPage = new HashMap<>();
        Set<String> allSearchTerms = new HashSet<>();
        for (String text : listOfText) {
            text = text.trim();
            if (text.isEmpty()) continue;

            log.debug("Searching for text pattern: '{}'", text);
            allSearchTerms.add(text);
            TextFinder textFinder = new TextFinder(text, useRegex, wholeWordSearchBool);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            log.debug("Found {} instances of pattern '{}'", foundTexts.size(), text);

            // Log details of found text instances
            for (int i = 0; i < foundTexts.size(); i++) {
                PDFText found = foundTexts.get(i);
                log.debug(
                        "  Match {}: '{}' on page {} at ({}, {}) to ({}, {})",
                        i + 1,
                        found.getText(),
                        found.getPageIndex() + 1,
                        found.getX1(),
                        found.getY1(),
                        found.getX2(),
                        found.getY2());
            }

            for (PDFText found : foundTexts) {
                allFoundTextsByPage
                        .computeIfAbsent(found.getPageIndex(), k -> new ArrayList<>())
                        .add(found);
            }
        }

        log.debug("Total pages with found text: {}", allFoundTextsByPage.size());

        // Step 2: Process each page with better font fallback handling
        log.debug("Step 2: Processing each page for text replacement");
        boolean fallbackToBoxOnlyMode = false;

        // Check if document uses custom encoding fonts that may cause issues
        boolean hasCustomEncodingFonts = detectCustomEncodingFonts(document);
        if (hasCustomEncodingFonts) {
            log.info(
                    "Detected fonts with custom encoding. Using box-only redaction mode to preserve document integrity.");
            fallbackToBoxOnlyMode = true;
        }

        if (!fallbackToBoxOnlyMode) {
            try {
                for (PDPage page : document.getPages()) {
                    // Replace text content
                    List<Object> filteredTokens =
                            createTokensWithoutTargetText(
                                    page, allSearchTerms, useRegex, wholeWordSearchBool);
                    writeFilteredContentStream(document, page, filteredTokens);
                }
            } catch (Exception e) {
                log.warn(
                        "Font encoding error encountered during text modification: {}. Falling back to box-only redaction mode.",
                        e.getMessage());
                fallbackToBoxOnlyMode = true;

                // Reload the document to reset any partial modifications
                document.close();
                document = pdfDocumentFactory.load(file);
            }
        }

        // Draw redaction boxes for all found texts
        List<PDFText> allFoundTexts = new ArrayList<>();
        for (List<PDFText> pageTexts : allFoundTextsByPage.values()) {
            allFoundTexts.addAll(pageTexts);
        }

        log.debug("Drawing redaction boxes for {} total found texts", allFoundTexts.size());

        if (!allFoundTexts.isEmpty()) {
            if (fallbackToBoxOnlyMode) {
                log.info("Using fallback box-only redaction mode due to font encoding issues");
                log.debug(
                        "Text removal was skipped to preserve document integrity. Only drawing redaction boxes over {} text instances.",
                        allFoundTexts.size());
            } else {
                log.debug(
                        "Using full text replacement redaction mode with {} text instances.",
                        allFoundTexts.size());
            }
            redactFoundText(document, allFoundTexts, customPadding, redactColor);
        } else {
            log.debug("No matching text found for redaction patterns");
        }

        if (convertPDFToImage) {
            log.debug("Converting redacted PDF to image format");
            PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document);
            document.close();
            document = convertedPdf;
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        document.close();

        byte[] pdfContent = baos.toByteArray();
        log.debug("Auto-redaction completed. Output PDF size: {} bytes", pdfContent.length);

        return WebResponseUtils.bytesToWebResponse(
                pdfContent,
                Objects.requireNonNull(Filenames.toSimpleFileName(file.getOriginalFilename()))
                                .replaceFirst("[.][^.]+$", "")
                        + "_redacted.pdf");
    }

    /**
     * Creates a list of tokens from the page content stream, without the target text.
     *
     * @param page The PDF page to process.
     * @param targetWords The set of words to redact.
     * @param useRegex Whether to treat target words as regex patterns.
     * @param wholeWordSearch Whether to match whole words only.
     * @return A list of tokens with redactions applied.
     * @throws IOException If an error occurs while parsing the PDF content stream.
     */
    List<Object> createTokensWithoutTargetText(
            PDPage page, Set<String> targetWords, boolean useRegex, boolean wholeWordSearch)
            throws IOException {
        log.debug(
                "Creating tokens without target text for page, searching for {} words",
                targetWords.size());

        PDFStreamParser parser = new PDFStreamParser(page);
        List<Object> tokens = new ArrayList<>();
        Object token;
        while ((token = parser.parseNextToken()) != null) {
            tokens.add(token);
        }

        log.debug("Parsed {} tokens from page content stream", tokens.size());

        List<TextSegment> textSegments = extractTextSegments(page, tokens);
        log.debug("Extracted {} text segments", textSegments.size());

        // Log detailed text segment information
        for (int i = 0;
                i < Math.min(textSegments.size(), 20);
                i++) { // Log first 20 segments to avoid spam
            TextSegment segment = textSegments.get(i);
            log.debug(
                    "Text segment {}: '{}' (font: {}, operator: {}, pos: {}-{})",
                    i,
                    segment.getText(),
                    segment.getFont() != null ? segment.getFont().getName() : "null",
                    segment.getOperatorName(),
                    segment.getStartPos(),
                    segment.getEndPos());
        }
        if (textSegments.size() > 20) {
            log.debug("... and {} more text segments", textSegments.size() - 20);
        }

        String completeText = buildCompleteText(textSegments);
        log.debug(
                "Built complete text of {} characters: '{}'",
                completeText.length(),
                completeText.length() > 200
                        ? completeText.substring(0, 200) + "..."
                        : completeText);

        List<MatchRange> matches =
                findAllMatches(completeText, targetWords, useRegex, wholeWordSearch);
        log.debug("Found {} matches in complete text", matches.size());

        return applyRedactionsToTokens(tokens, textSegments, matches);
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
        log.debug("Extracting text segments from {} tokens", tokens.size());

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
                        if (fontSizeBase instanceof org.apache.pdfbox.cos.COSNumber cosNumber) {
                            graphicsState.setFont(resources.getFont(fontName));
                            graphicsState.setFontSize(cosNumber.floatValue());
                            log.debug(
                                    "Updated font state: {} size {}",
                                    fontName.getName(),
                                    graphicsState.getFontSize());
                        }
                    } catch (ClassCastException | IOException e) {
                        log.warn("Failed to update font state", e);
                    }
                }

                if (isTextShowingOperator(opName) && i > 0) {
                    String textContent = extractTextFromToken(tokens.get(i - 1), opName);
                    if (!textContent.isEmpty()) {
                        log.debug(
                                "Found text segment '{}' at position {} with operator {}",
                                textContent,
                                currentTextPos,
                                opName);
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
            }
        }

        log.debug("Extracted {} text segments from page", segments.size());
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
        log.debug(
                "Finding matches in text of {} characters for {} target words",
                completeText.length(),
                targetWords.size());

        List<MatchRange> matches = new ArrayList<>();

        for (String target : targetWords) {
            log.debug("Searching for pattern: '{}'", target);

            String patternString = useRegex ? target : Pattern.quote(target);
            if (wholeWordSearch) {
                patternString = "\\b" + patternString + "\\b";
            }
            Pattern pattern = Pattern.compile(patternString, Pattern.CASE_INSENSITIVE);
            Matcher matcher = pattern.matcher(completeText);

            int matchCount = 0;
            while (matcher.find()) {
                matches.add(new MatchRange(matcher.start(), matcher.end()));
                matchCount++;
                log.debug(
                        "Found match for '{}' at positions {}-{}",
                        target,
                        matcher.start(),
                        matcher.end());
            }

            log.debug("Total matches for '{}': {}", target, matchCount);
        }

        matches.sort(Comparator.comparingInt(a -> a.startPos));
        log.debug("Found {} total matches across all patterns", matches.size());

        return matches;
    }

    private List<Object> applyRedactionsToTokens(
            List<Object> tokens, List<TextSegment> textSegments, List<MatchRange> matches) {
        log.debug(
                "Applying redactions to {} tokens with {} text segments and {} matches",
                tokens.size(),
                textSegments.size(),
                matches.size());

        List<Object> newTokens = new ArrayList<>(tokens);

        // Group matches by segment to pass to modification methods
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

        log.debug("Grouped matches by segment: {} segments affected", matchesBySegment.size());

        // Create a list of modification tasks
        List<ModificationTask> tasks = new ArrayList<>();
        for (Map.Entry<Integer, List<MatchRange>> entry : matchesBySegment.entrySet()) {
            int segmentIndex = entry.getKey();
            List<MatchRange> segmentMatches = entry.getValue();
            TextSegment segment = textSegments.get(segmentIndex);

            log.debug(
                    "Creating modification task for segment {} with {} matches",
                    segmentIndex,
                    segmentMatches.size());

            if ("Tj".equals(segment.operatorName) || "'".equals(segment.operatorName)) {
                String newText = applyRedactionsToSegmentText(segment, segmentMatches);
                try {
                    float adjustment = calculateWidthAdjustment(segment, segmentMatches);
                    tasks.add(new ModificationTask(segment, newText, adjustment));
                } catch (Exception e) {
                    log.warn(
                            "Failed to calculate width adjustment for redaction due to font encoding issues: {}. Using zero adjustment.",
                            e.getMessage());
                    tasks.add(new ModificationTask(segment, newText, 0));
                }
            } else if ("TJ".equals(segment.operatorName)) {
                tasks.add(new ModificationTask(segment, null, 0));
            }
        }

        // Sort tasks by token index in descending order to avoid index shifting issues
        tasks.sort((a, b) -> Integer.compare(b.segment.tokenIndex, a.segment.tokenIndex));

        log.debug("Applying {} modification tasks", tasks.size());

        // Apply modifications
        for (ModificationTask task : tasks) {
            List<MatchRange> segmentMatches =
                    matchesBySegment.getOrDefault(
                            textSegments.indexOf(task.segment), Collections.emptyList());
            modifyTokenForRedaction(
                    newTokens, task.segment, task.newText, task.adjustment, segmentMatches);
        }

        log.debug("Completed applying redactions to tokens");
        return newTokens;
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

    private float safeGetStringWidth(PDFont font, String text) throws IOException {
        if (font == null || text == null || text.isEmpty()) {
            return 0;
        }

        try {
            // First, try to get the width directly for standard fonts
            return font.getStringWidth(text);
        } catch (Exception e) {
            log.debug(
                    "Font width calculation failed for '{}' in font {}: {}. Using fallback strategies.",
                    text,
                    font.getName(),
                    e.getMessage());

            // Strategy 1: Character-by-character encoding test
            float charByCharWidth = getCharacterByCharacterWidth(font, text);
            if (charByCharWidth > 0) {
                return charByCharWidth;
            }

            // Strategy 2: Use font substitution with Standard 14 fonts
            float substitutionWidth = getWidthWithFontSubstitution(font, text);
            if (substitutionWidth > 0) {
                return substitutionWidth;
            }

            // Strategy 3: Statistical estimation based on real font metrics
            return getStatisticalWidth(text, font);
        }
    }

    private float getCharacterByCharacterWidth(PDFont font, String text) {
        if (text == null || text.isEmpty()) {
            return 0;
        }

        try {
            float totalWidth = 0;
            for (char c : text.toCharArray()) {
                try {
                    String charStr = String.valueOf(c);
                    font.encode(charStr); // Test if character can be encoded
                    totalWidth += font.getStringWidth(charStr);
                } catch (Exception e) {
                    try {
                        totalWidth += font.getStringWidth(" ");
                    } catch (Exception e2) {
                        totalWidth += 500; // Standard average width
                    }
                }
            }
            return totalWidth;
        } catch (Exception e) {
            log.debug("Character-by-character width calculation failed: {}", e.getMessage());
            return 0; // Failed, try next strategy
        }
    }

    private float getWidthWithFontSubstitution(PDFont originalFont, String text) {
        try {
            PDFont substituteFont = findBestStandardFontSubstitute(originalFont);
            float width = substituteFont.getStringWidth(text);

            FontCharacteristics characteristics = getFontCharacteristics(originalFont);

            return width;
        } catch (Exception e) {
            log.debug("Font substitution width calculation failed: {}", e.getMessage());
        }
        return 0; // Failed, try next strategy
    }

    private PDFont findBestStandardFontSubstitute(PDFont originalFont) {
        String fontFamily = null;
        String fontName = null;
        boolean isBold = false;
        boolean isItalic = false;
        boolean isMonospace = false;

        try {
            // Try to get font metadata from PDFontDescriptor
            if (originalFont.getFontDescriptor() != null) {
                fontFamily = originalFont.getFontDescriptor().getFontFamily();

                if (fontFamily == null || fontFamily.isEmpty()) {
                    fontName = originalFont.getFontDescriptor().getFontName();
                }

                int flags = originalFont.getFontDescriptor().getFlags();
                isBold = (flags & 0x40) != 0; // Check if FORCE_BOLD flag is set (0x40)
                isItalic = (flags & 0x40000) != 0; // Check if ITALIC flag is set (0x40000)
                isMonospace = (flags & 0x1) != 0; // Check if FIXED_PITCH flag is set (0x1)
            }
        } catch (Exception e) {
            log.debug("Error accessing font descriptor: {}", e.getMessage());
        }

        // If we couldn't get metadata from descriptor, fall back to font name
        if ((fontFamily == null || fontFamily.isEmpty())
                && (fontName == null || fontName.isEmpty())) {
            fontName = originalFont.getName().toLowerCase();
        } else if (fontFamily != null) {
            fontFamily = fontFamily.toLowerCase();
        } else {
            fontName = fontName.toLowerCase();
        }

        // Determine font characteristics based on metadata or name
        boolean isSerif = false;
        boolean isCourier = false;

        // Check font family first
        if (fontFamily != null) {
            isCourier = fontFamily.contains("courier");
            isMonospace =
                    isMonospace
                            || isCourier
                            || fontFamily.contains("mono")
                            || fontFamily.contains("fixed");
            isSerif =
                    fontFamily.contains("times")
                            || fontFamily.contains("serif")
                            || fontFamily.contains("roman");
        }

        // If needed, check font name as fallback
        if (fontName != null) {
            isCourier = isCourier || fontName.contains("courier");
            isMonospace =
                    isMonospace
                            || isCourier
                            || fontName.contains("mono")
                            || fontName.contains("fixed");
            isSerif =
                    isSerif
                            || fontName.contains("times")
                            || fontName.contains("serif")
                            || fontName.contains("roman");
            isBold = isBold || fontName.contains("bold");
            isItalic = isItalic || fontName.contains("italic") || fontName.contains("oblique");
        }

        // Select the appropriate standard font based on characteristics
        if (isMonospace) {
            return new PDType1Font(Standard14Fonts.FontName.COURIER);
        }

        if (isSerif) {
            if (isBold && isItalic) {
                return new PDType1Font(Standard14Fonts.FontName.TIMES_BOLD_ITALIC);
            } else if (isBold) {
                return new PDType1Font(Standard14Fonts.FontName.TIMES_BOLD);
            } else if (isItalic) {
                return new PDType1Font(Standard14Fonts.FontName.TIMES_ITALIC);
            } else {
                return new PDType1Font(Standard14Fonts.FontName.TIMES_ROMAN);
            }
        }

        // Sans-serif fonts (Helvetica)
        if (isBold && isItalic) {
            return new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD_OBLIQUE);
        } else if (isBold) {
            return new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        } else if (isItalic) {
            return new PDType1Font(Standard14Fonts.FontName.HELVETICA_OBLIQUE);
        }

        return new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    }

    private float getStatisticalWidth(String text, PDFont font) {
        if (text == null || text.isEmpty()) {
            return 0;
        }

        PDFont referenceFont = findBestStandardFontSubstitute(font);

        // Get font characteristics using metadata
        FontCharacteristics characteristics = getFontCharacteristics(font);

        try {

            return referenceFont.getStringWidth(text);
        } catch (Exception e) {
            float avgCharWidth = getAverageCharacterWidth(font);
            return text.length() * avgCharWidth;
        }
    }

    private FontCharacteristics getFontCharacteristics(PDFont font) {
        FontCharacteristics characteristics = new FontCharacteristics();

        try {
            // Try to get font metadata from PDFontDescriptor
            if (font.getFontDescriptor() != null) {
                characteristics.fontFamily = font.getFontDescriptor().getFontFamily();

                if (characteristics.fontFamily == null || characteristics.fontFamily.isEmpty()) {
                    characteristics.fontName = font.getFontDescriptor().getFontName();
                }

                int flags = font.getFontDescriptor().getFlags();
                characteristics.isBold = (flags & 0x40) != 0; // FORCE_BOLD flag
                characteristics.isItalic = (flags & 0x40000) != 0; // ITALIC flag
                characteristics.isMonospace = (flags & 0x1) != 0; // FIXED_PITCH flag
            }
        } catch (Exception e) {
            log.debug("Error accessing font descriptor: {}", e.getMessage());
        }

        // If we couldn't get metadata from descriptor, fall back to font name
        if ((characteristics.fontFamily == null || characteristics.fontFamily.isEmpty())
                && (characteristics.fontName == null || characteristics.fontName.isEmpty())) {
            characteristics.fontName = font.getName();
        }

        if (characteristics.fontFamily != null) {
            characteristics.fontFamily = characteristics.fontFamily.toLowerCase();
        }
        if (characteristics.fontName != null) {
            characteristics.fontName = characteristics.fontName.toLowerCase();
        }

        if (characteristics.fontFamily != null) {
            characteristics.isCourier = characteristics.fontFamily.contains("courier");
            characteristics.isMonospace =
                    characteristics.isMonospace
                            || characteristics.isCourier
                            || characteristics.fontFamily.contains("mono")
                            || characteristics.fontFamily.contains("fixed");
            characteristics.isSerif =
                    characteristics.fontFamily.contains("times")
                            || characteristics.fontFamily.contains("serif")
                            || characteristics.fontFamily.contains("roman");
            characteristics.isTimesNewRoman =
                    characteristics.fontFamily.contains("timesnewroman")
                            || characteristics.fontFamily.contains("timesnew");
        }

        if (characteristics.fontName != null) {
            characteristics.isCourier =
                    characteristics.isCourier || characteristics.fontName.contains("courier");
            characteristics.isMonospace =
                    characteristics.isMonospace
                            || characteristics.isCourier
                            || characteristics.fontName.contains("mono")
                            || characteristics.fontName.contains("fixed");
            characteristics.isSerif =
                    characteristics.isSerif
                            || characteristics.fontName.contains("times")
                            || characteristics.fontName.contains("serif")
                            || characteristics.fontName.contains("roman");
            characteristics.isBold =
                    characteristics.isBold || characteristics.fontName.contains("bold");
            characteristics.isItalic =
                    characteristics.isItalic
                            || characteristics.fontName.contains("italic")
                            || characteristics.fontName.contains("oblique");
            characteristics.isTimesNewRoman =
                    characteristics.isTimesNewRoman
                            || (characteristics.fontName.contains("timesnewroman")
                                            || characteristics.fontName.contains("timesnew"))
                                    && (characteristics.fontName.contains("psmt")
                                            || characteristics.fontName.contains("ps-"));
        }

        return characteristics;
    }

    private static class FontCharacteristics {
        String fontFamily;
        String fontName;
        boolean isBold;
        boolean isItalic;
        boolean isMonospace;
        boolean isSerif;
        boolean isCourier;
        boolean isTimesNewRoman;
    }

    private float getAverageCharacterWidth(PDFont font) {
        String sampleText = "etaoinshrdlucmfwypvbgkjqxz0123456789 ,.";

        FontCharacteristics characteristics = getFontCharacteristics(font);

        try {

            return font.getStringWidth(sampleText) / sampleText.length();
        } catch (Exception e) {
            try {
                PDFont substituteFont = findBestStandardFontSubstitute(font);

                return substituteFont.getStringWidth(sampleText) / sampleText.length();
            } catch (Exception e2) {
                if (characteristics.isMonospace || characteristics.isCourier) {
                    return 600; // Monospace fonts
                } else if (characteristics.isTimesNewRoman) {
                    return 550; // TimesNewRoman fonts - increased from standard Times
                } else if (characteristics.isSerif) {
                    return 480; // Times-style serif fonts
                } else if (characteristics.fontFamily != null
                        && (characteristics.fontFamily.contains("arial")
                                || characteristics.fontFamily.contains("helvetica"))) {
                    return 520; // Helvetica/Arial-style sans-serif
                } else if (characteristics.fontName != null
                        && (characteristics.fontName.contains("arial")
                                || characteristics.fontName.contains("helvetica"))) {
                    return 520; // Helvetica/Arial-style sans-serif
                } else {
                    return 500; // Generic sans-serif average
                }
            }
        }
    }

    private float calculateWidthAdjustment(TextSegment segment, List<MatchRange> matches)
            throws IOException {
        try {
            float totalOriginalWidth = 0;
            float totalPlaceholderWidth = 0;
            String text = segment.getText();

            for (MatchRange match : matches) {
                int segmentStart = Math.max(0, match.getStartPos() - segment.getStartPos());
                int segmentEnd = Math.min(text.length(), match.getEndPos() - segment.getStartPos());

                if (segmentStart < text.length() && segmentEnd > segmentStart) {
                    String originalPart = text.substring(segmentStart, segmentEnd);
                    String placeholderPart = createPlaceholder(originalPart);

                    if (segment.getFont() != null) {
                        totalOriginalWidth +=
                                safeGetStringWidth(segment.getFont(), originalPart)
                                        / FONT_SCALE_FACTOR
                                        * segment.getFontSize();
                        totalPlaceholderWidth +=
                                safeGetStringWidth(segment.getFont(), placeholderPart)
                                        / FONT_SCALE_FACTOR
                                        * segment.getFontSize();
                    }
                }
            }
            return totalOriginalWidth - totalPlaceholderWidth;
        } catch (Exception e) {
            log.warn(
                    "Failed to calculate width adjustment for segment '{}' due to font encoding issues: {}. Skipping adjustment.",
                    segment.getText(),
                    e.getMessage());
            return 0; // No adjustment when font operations fail
        }
    }

    private void modifyTokenForRedaction(
            List<Object> tokens,
            TextSegment segment,
            String newText,
            float adjustment,
            List<MatchRange> matches) {
        log.debug(
                "Modifying token at index {} for segment '{}' with operator {}",
                segment.getTokenIndex(),
                segment.getText(),
                segment.getOperatorName());

        if (segment.getTokenIndex() < 0 || segment.getTokenIndex() >= tokens.size()) {
            log.debug(
                    "Token index {} out of bounds (0-{})",
                    segment.getTokenIndex(),
                    tokens.size() - 1);
            return;
        }

        Object token = tokens.get(segment.getTokenIndex());
        String operatorName = segment.getOperatorName();

        try {
            if (("Tj".equals(operatorName) || "'".equals(operatorName))
                    && token instanceof COSString) {
                log.debug("Modifying Tj/quote operator with adjustment {}", adjustment);

                if (Math.abs(adjustment) < PRECISION_THRESHOLD) {
                    tokens.set(segment.getTokenIndex(), new COSString(newText));
                } else {
                    COSArray newArray = new COSArray();
                    newArray.add(new COSString(newText));
                    if (segment.getFontSize() > 0) {

                        float adjustmentFactor =
                                1.2f; // Increase adjustment by 20% to compensate for spaces
                        float kerning =
                                -1
                                        * adjustment
                                        * adjustmentFactor
                                        * (FONT_SCALE_FACTOR / segment.getFontSize());

                        newArray.add(new org.apache.pdfbox.cos.COSFloat(kerning));
                        log.debug(
                                "Applied kerning adjustment: {} for width adjustment: {}",
                                kerning,
                                adjustment);
                    }
                    tokens.set(segment.getTokenIndex(), newArray);

                    int operatorIndex = segment.getTokenIndex() + 1;
                    if (operatorIndex < tokens.size()
                            && tokens.get(operatorIndex) instanceof Operator op
                            && op.getName().equals(operatorName)) {
                        tokens.set(operatorIndex, Operator.getOperator("TJ"));
                        log.debug("Changed operator from {} to TJ", operatorName);
                    }
                }
            } else if ("TJ".equals(operatorName) && token instanceof COSArray) {
                log.debug("Modifying TJ operator array");
                COSArray newArray = createRedactedTJArray((COSArray) token, segment, matches);
                tokens.set(segment.getTokenIndex(), newArray);
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to modify token for redaction due to font encoding issues: {}. Skipping text modification for segment '{}'.",
                    e.getMessage(),
                    segment.getText());
        }
    }

    private COSArray createRedactedTJArray(
            COSArray originalArray, TextSegment segment, List<MatchRange> matches)
            throws IOException {
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

                                float adjustmentFactor = 0.8f;
                                float kerning =
                                        -1
                                                * adjustment
                                                * adjustmentFactor
                                                * (FONT_SCALE_FACTOR / segment.getFontSize());

                                newArray.add(new org.apache.pdfbox.cos.COSFloat(kerning));
                                log.debug(
                                        "Applied kerning adjustment: {} for width adjustment: {}",
                                        kerning,
                                        adjustment);
                            }
                        } catch (Exception e) {
                            log.warn(
                                    "Failed to calculate kerning adjustment for TJ array element due to font encoding issues: {}. Skipping adjustment.",
                                    e.getMessage());
                            // Continue without kerning adjustment
                        }
                    }

                    textOffsetInSegment += originalText.length();
                } else {
                    newArray.add(element);
                }
            }
            return newArray;
        } catch (Exception e) {
            log.warn(
                    "Failed to create redacted TJ array due to font encoding issues: {}. Returning original array.",
                    e.getMessage());
            // Return the original array if we can't modify it safely
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

    /**
     * Detects if the document contains fonts with custom encoding that may cause text modification
     * issues. Custom encoding fonts often have internal character mappings that don't follow
     * Unicode standards.
     */
    private boolean detectCustomEncodingFonts(PDDocument document) {
        try {
            log.debug("Starting font encoding detection...");
            for (PDPage page : document.getPages()) {
                PDResources resources = page.getResources();
                if (resources != null) {
                    int fontCount = 0;
                    for (COSName fn : resources.getFontNames()) fontCount++;
                    log.debug("Found {} fonts on page", fontCount);
                    for (COSName fontName : resources.getFontNames()) {
                        try {
                            PDFont font = resources.getFont(fontName);
                            if (font != null) {
                                String name = font.getName();
                                log.debug(
                                        "Analyzing font: {} (type: {})",
                                        name,
                                        font.getClass().getSimpleName());

                                // Check for font names that commonly indicate custom encoding
                                if (name != null
                                        && (name.contains("HOEP")
                                                || // Common custom encoding prefix
                                                name.contains("+")
                                                || // Subset fonts often have custom encoding
                                                name.matches(".*[A-Z]{6}\\+.*") // Six letter prefix
                                        // pattern
                                        )) {
                                    log.debug("Detected potential custom encoding font: {}", name);
                                    // Try a simple encoding test
                                    try {
                                        font.encode(" "); // Test space character
                                        font.getStringWidth(" ");
                                        log.debug("Font {} passed basic encoding test", name);
                                    } catch (Exception e) {
                                        log.debug(
                                                "Font {} failed basic encoding test: {}",
                                                name,
                                                e.getMessage());
                                        return true;
                                    }
                                } else {
                                    log.debug("Font {} appears to use standard encoding", name);
                                }
                            }
                        } catch (Exception e) {
                            log.debug(
                                    "Error checking font for custom encoding: {}", e.getMessage());
                        }
                    }
                }
            }
            log.debug("Font encoding detection complete - no problematic fonts found");
            return false;
        } catch (Exception e) {
            log.warn(
                    "Error detecting custom encoding fonts: {}. Assuming custom encoding present.",
                    e.getMessage());
            return true; // Err on the side of caution
        }
    }
}
