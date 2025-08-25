package stirling.software.SPDF.service;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import javax.imageio.ImageIO;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNumber;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
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
import org.apache.pdfbox.pdmodel.graphics.pattern.PDTilingPattern;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.SPDF.pdf.TextFinder;
import stirling.software.SPDF.utils.text.TextDecodingHelper;
import stirling.software.SPDF.utils.text.TextEncodingHelper;
import stirling.software.SPDF.utils.text.TextFinderUtils;
import stirling.software.SPDF.utils.text.WidthCalculator;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempDirectory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@Service
@Slf4j
@RequiredArgsConstructor
public class RedactionService {

    private static final Pattern FUZZY_STRIP = Pattern.compile("[^a-z0-9]+");
    private static final float DEFAULT_TEXT_PADDING_MULTIPLIER = 0.6f;
    private static final float PRECISION_THRESHOLD = 1e-3f;
    private static final int FONT_SCALE_FACTOR = 1000;
    private static final Set<String> TEXT_SHOWING_OPERATORS = Set.of("Tj", "TJ", "'", "\"");
    private static final COSString EMPTY_COS_STRING = new COSString("");
    private static final int MAX_SWEEPS = 3;
    private boolean aggressiveMode = false;
    private Map<Integer, List<AggressiveSegMatch>> aggressiveSegMatches = null;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    private static void redactAreas(
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
            int pageNumber = entry.getKey();
            List<RedactionArea> areasForPage = entry.getValue();
            if (pageNumber > allPages.getCount()) {
                continue;
            }
            PDPage page = allPages.get(pageNumber - 1);

            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                contentStream.saveGraphicsState();
                for (RedactionArea redactionArea : areasForPage) {
                    contentStream.setNonStrokingColor(decodeOrDefault(redactionArea.getColor()));
                    float x = redactionArea.getX().floatValue();
                    float y = redactionArea.getY().floatValue();
                    float width = redactionArea.getWidth().floatValue();
                    float height = redactionArea.getHeight().floatValue();
                    contentStream.addRect(
                            x, page.getBBox().getHeight() - y - height, width, height);
                    contentStream.fill();
                }
                contentStream.restoreGraphicsState();
            }
        }
    }

    private static void redactPages(
            ManualRedactPdfRequest request, PDDocument document, PDPageTree allPages)
            throws IOException {
        Color redactColor = decodeOrDefault(request.getPageRedactionColor());
        String pageNumbers = request.getPageNumbers();

        List<Integer> pageNumberList = parsePageNumbers(pageNumbers);

        for (int pageNumber : pageNumberList) {
            if (pageNumber <= 0 || pageNumber > allPages.getCount()) {
                continue;
            }
            PDPage page = allPages.get(pageNumber - 1);
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

    private static List<Integer> parsePageNumbers(String pageNumbers) {
        if (pageNumbers == null || pageNumbers.trim().isEmpty()) {
            return Collections.emptyList();
        }

        List<Integer> result = new ArrayList<>();
        String[] parts = pageNumbers.split(",");

        for (String part : parts) {
            String trim = part.trim();
            if (trim.contains("-")) {
                String[] range = trim.split("-");
                if (range.length == 2) {
                    try {
                        int start = Integer.parseInt(range[0].trim());
                        int end = Integer.parseInt(range[1].trim());
                        for (int i = start; i <= end; i++) {
                            result.add(i);
                        }
                    } catch (NumberFormatException ignored) {
                    }
                }
            } else {
                try {
                    result.add(Integer.parseInt(trim));
                } catch (NumberFormatException ignored) {
                }
            }
        }

        return result;
    }

    private static Color decodeOrDefault(String hex) {
        if (hex == null) {
            return Color.BLACK;
        }
        String colorString = (!hex.isEmpty() && hex.charAt(0) == '#') ? hex : "#" + hex;
        try {
            return Color.decode(colorString);
        } catch (NumberFormatException e) {
            return Color.BLACK;
        }
    }

    private static void redactFoundText(
            PDDocument document, List<PDFText> blocks, float customPadding, Color redactColor)
            throws IOException {
        var allPages = document.getDocumentCatalog().getPages();
        Map<Integer, List<PDFText>> blocksByPage = new HashMap<>();
        for (PDFText block : blocks) {
            blocksByPage.computeIfAbsent(block.getPageIndex(), k -> new ArrayList<>()).add(block);
        }
        for (Map.Entry<Integer, List<PDFText>> entry : blocksByPage.entrySet()) {
            Integer pageIndex = entry.getKey();
            if (pageIndex >= allPages.getCount()) {
                continue;
            }
            PDPage page = allPages.get(pageIndex);
            List<PDFText> pageBlocks = entry.getValue();
            try (PDPageContentStream cs =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                cs.saveGraphicsState();
                try {
                    cs.setNonStrokingColor(redactColor);
                    PDRectangle pageBox = page.getBBox();
                    for (PDFText b : pageBlocks) {
                        float padding =
                                (b.getY2() - b.getY1()) * DEFAULT_TEXT_PADDING_MULTIPLIER
                                        + customPadding;
                        float width = b.getX2() - b.getX1();
                        cs.addRect(
                                b.getX1(),
                                pageBox.getHeight() - b.getY2() - padding,
                                width,
                                b.getY2() - b.getY1() + 2 * padding);
                    }
                    cs.fill();
                } finally {
                    cs.restoreGraphicsState();
                }
            }
        }
    }

    static void writeFilteredContentStream(PDDocument document, PDPage page, List<Object> tokens)
            throws IOException {
        PDStream newStream = new PDStream(document);
        try (var out = newStream.createOutputStream()) {
            new ContentStreamWriter(out).writeTokens(tokens);
        }
        page.setContents(newStream);
    }

    static boolean isTextShowingOperator(String opName) {
        return TEXT_SHOWING_OPERATORS.contains(opName);
    }

    private static boolean pageStillContainsTargets(
            PDDocument document,
            int pageIndex,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch) {
        try {
            for (String term : targetWords) {
                if (term == null || term.isBlank()) {
                    continue;
                }
                TextFinder finder = new TextFinder(term, useRegex, wholeWordSearch);
                finder.setStartPage(pageIndex + 1);
                finder.setEndPage(pageIndex + 1);
                finder.getText(document);

                List<PDFText> foundTexts = finder.getFoundTexts();
                for (PDFText ft : foundTexts) {
                    if (ft.getPageIndex() == pageIndex) {
                        return true;
                    }
                }

                if (!foundTexts.isEmpty()) {}
            }

            return false;

        } catch (Exception e) {
            return true;
        }
    }

    private static boolean documentStillContainsTargets(
            PDDocument document,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch) {
        try {
            int idx = -1;
            final int numberOfPages = document.getNumberOfPages();
            for (int i = 0; i < numberOfPages; i++) {
                idx++;
                if (pageStillContainsTargets(
                        document, idx, targetWords, useRegex, wholeWordSearch)) {
                    return true;
                }
            }

            return false;

        } catch (Exception e) {
            return true;
        }
    }

    public static Map<Integer, List<PDFText>> findTextToRedact(
            PDDocument document, String[] listOfText, boolean useRegex, boolean wholeWordSearch) {
        Map<Integer, List<PDFText>> allFoundTextsByPage = new HashMap<>();

        for (String text : listOfText) {
            String t = text.trim();
            if (t.isEmpty()) {
                continue;
            }
            try {
                TextFinder finder = new TextFinder(t, useRegex, wholeWordSearch);
                finder.getText(document);
                List<PDFText> foundTexts = finder.getFoundTexts();

                for (PDFText found : foundTexts) {
                    allFoundTextsByPage
                            .computeIfAbsent(found.getPageIndex(), k -> new ArrayList<>())
                            .add(found);
                }
            } catch (Exception e) {
            }
        }

        return allFoundTextsByPage;
    }

    public static byte[] finalizeRedaction(
            PDDocument document,
            Map<Integer, List<PDFText>> allFoundTextsByPage,
            String colorString,
            float customPadding,
            Boolean convertToImage,
            boolean isTextRemovalMode)
            throws IOException {
        List<PDFText> allFoundTexts = new ArrayList<>();
        for (List<PDFText> pageTexts : allFoundTextsByPage.values()) {
            allFoundTexts.addAll(pageTexts);
        }
        if (!allFoundTexts.isEmpty()) {
            if (!isTextRemovalMode) {
                Color redactColor = decodeOrDefault(colorString);
                redactFoundText(document, allFoundTexts, customPadding, redactColor);
            }
        }
        if (Boolean.TRUE.equals(convertToImage)) {
            try (PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document)) {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                convertedPdf.save(baos);
                return baos.toByteArray();
            }
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        return baos.toByteArray();
    }

    private static String normalizeForFuzzy(String s) {
        if (s == null) {
            return "";
        }
        String lower = s.toLowerCase();
        return FUZZY_STRIP.matcher(lower).replaceAll("");
    }

    private static NormalizedMap buildNormalizedMap(String original) {
        NormalizedMap nm = new NormalizedMap();
        if (original == null) {
            nm.norm = "";
            nm.map = new int[0];
            return nm;
        }
        StringBuilder norm = new StringBuilder();
        List<Integer> mapping = new ArrayList<>();
        for (int i = 0; i < original.length(); i++) {
            char c = Character.toLowerCase(original.charAt(i));
            if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
                norm.append(c);
                mapping.add(i);
            }
        }
        nm.norm = norm.toString();
        nm.map = mapping.stream().mapToInt(Integer::intValue).toArray();
        return nm;
    }

    private static List<MatchRange> findAllMatches(
            String completeText,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch) {
        List<Pattern> patterns =
                TextFinderUtils.createOptimizedSearchPatterns(
                        targetWords, useRegex, wholeWordSearch);
        return patterns.stream()
                .flatMap(
                        pattern -> {
                            try {
                                return pattern.matcher(completeText).results();
                            } catch (Exception e) {
                                return java.util.stream.Stream.empty();
                            }
                        })
                .map(mr -> new MatchRange(mr.start(), mr.end()))
                .sorted(Comparator.comparingInt(MatchRange::getStartPos))
                .collect(Collectors.toList());
    }

    private static void performFallbackModification(
            List<Object> tokens, int tokenIndex, String newText) {
        try {
            tokens.set(tokenIndex, newText.isEmpty() ? EMPTY_COS_STRING : new COSString(newText));
        } catch (Exception e) {
            performEmergencyFallback(tokens, tokenIndex);
        }
    }

    private static COSArray redactTJArrayByDecodedRanges(
            PDFont font, COSArray originalArray, List<AggressiveSegMatch> decRanges) {
        try {
            COSArray newArray = new COSArray();
            int decodedCursor = 0;
            for (COSBase element : originalArray) {
                if (element instanceof COSString cosString) {
                    byte[] bytes = cosString.getBytes();
                    DecodedMapping dm = TextDecodingHelper.buildDecodeMapping(font, bytes);
                    int decodedLen = dm.text.length();
                    if (decodedLen == 0 || dm.charByteStart.length == 0) {
                        newArray.add(element);
                        continue;
                    }
                    boolean[] delete = new boolean[bytes.length];
                    for (AggressiveSegMatch r : decRanges) {
                        int gStart = r.decodedStart;
                        int gEnd = r.decodedEnd;
                        int ovStart = Math.max(gStart, decodedCursor);
                        int ovEnd = Math.min(gEnd, decodedCursor + decodedLen);
                        if (ovStart < ovEnd) {
                            int localStart = ovStart - decodedCursor;
                            int localEnd = ovEnd - decodedCursor;
                            int byteStart = dm.charByteStart[localStart];
                            int byteEnd = dm.charByteEnd[localEnd - 1];
                            for (int bi = Math.max(0, byteStart);
                                    bi < Math.min(bytes.length, byteEnd);
                                    bi++) {
                                delete[bi] = true;
                            }
                        }
                    }
                    ByteArrayOutputStream baos = new ByteArrayOutputStream(bytes.length);
                    for (int bi = 0; bi < bytes.length; bi++) {
                        if (!delete[bi]) {
                            baos.write(bytes[bi]);
                        }
                    }
                    newArray.add(new COSString(baos.toByteArray()));
                    decodedCursor += decodedLen;
                } else {
                    newArray.add(element);
                }
            }
            return newArray;
        } catch (Exception e) {
            return originalArray;
        }
    }

    private static WipeResult wipeAllTextShowingOperators(List<Object> tokens) {
        List<Object> newTokens = new ArrayList<>(tokens);
        int modifications = 0;
        for (int i = 0; i < newTokens.size(); i++) {
            Object t = newTokens.get(i);
            if (t instanceof Operator op) {
                String name = op.getName();
                if (("Tj".equals(name) || "'".equals(name) || "\"".equals(name))
                        && i > 0
                        && newTokens.get(i - 1) instanceof COSString) {
                    newTokens.set(i - 1, EMPTY_COS_STRING);
                    modifications++;
                } else if ("TJ".equals(name)
                        && i > 0
                        && newTokens.get(i - 1) instanceof COSArray arr) {
                    COSArray newArr = new COSArray();
                    for (int j = 0; j < arr.size(); j++) {
                        COSBase el = arr.get(j);
                        if (el instanceof COSString) {
                            newArr.add(EMPTY_COS_STRING);
                            modifications++;
                        } else {
                            newArr.add(el);
                        }
                    }
                    newTokens.set(i - 1, newArr);
                }
            }
        }
        WipeResult res = new WipeResult();
        res.tokens = newTokens;
        res.modifications = modifications;
        return res;
    }

    private static int wipeAllSemanticTextInProperties(PDResources resources) {
        int modifications = 0;
        if (resources == null) {
            return 0;
        }
        var cosRes = resources.getCOSObject();
        var propsObj = cosRes.getDictionaryObject(COSName.PROPERTIES);
        if (propsObj instanceof COSDictionary propsDict) {
            for (COSName key : new ArrayList<>(propsDict.keySet())) {
                var val = propsDict.getDictionaryObject(key);
                if (val instanceof COSDictionary dict) {
                    boolean changed = false;
                    if (dict.containsKey(COSName.getPDFName("ActualText"))) {
                        dict.removeItem(COSName.getPDFName("ActualText"));
                        changed = true;
                    }
                    if (dict.containsKey(COSName.getPDFName("Alt"))) {
                        dict.removeItem(COSName.getPDFName("Alt"));
                        changed = true;
                    }
                    if (dict.containsKey(COSName.getPDFName("TU"))) {
                        dict.removeItem(COSName.getPDFName("TU"));
                        changed = true;
                    }
                    if (changed) {
                        modifications++;
                    }
                }
            }
        }
        return modifications;
    }

    private static void writeRedactedContentToXObject(
            PDDocument document, PDFormXObject formXObject, List<Object> redactedTokens)
            throws IOException {
        var cosStream = formXObject.getCOSObject();
        try (var out = cosStream.createOutputStream()) {
            new ContentStreamWriter(out).writeTokens(redactedTokens);
        }
    }

    public byte[] redactPDF(ManualRedactPdfRequest request) throws IOException {
        MultipartFile file = request.getFileInput();

        try (PDDocument document = pdfDocumentFactory.load(file)) {
            PDPageTree allPages = document.getDocumentCatalog().getPages();

            redactPages(request, document, allPages);
            redactAreas(request.getRedactions(), document, allPages);

            if (Boolean.TRUE.equals(request.getConvertPDFToImage())) {
                try (PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document)) {
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    convertedPdf.save(baos);
                    return baos.toByteArray();
                }
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }

    public byte[] redactPdf(RedactPdfRequest request) throws IOException {
        String mode = request.getRedactionMode();
        if (mode == null || mode.isBlank()) {
            mode = "moderate";
        }
        RedactionModeStrategy strategy =
                switch (mode.toLowerCase()) {
                    case "visual" -> new VisualRedactionService(pdfDocumentFactory, this);
                    case "aggressive" -> new AggressiveRedactionService(pdfDocumentFactory, this);
                    default -> new ModerateRedactionService(pdfDocumentFactory, this);
                };
        return strategy.redact(request);
    }

    private static boolean isTextSafeForRedaction(String text) {
        if (text == null || text.isEmpty()) return true;

        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            int codePoint = c;

            if (codePoint >= 65488) {
                return false;
            }
            if (Character.isISOControl(c) && c != '\n' && c != '\t' && c != '\r') {
                return false;
            }
        }

        return true;
    }

    private static List<Object> deepCopyTokens(List<Object> original) {
        List<Object> copy = new ArrayList<>(original.size());
        for (Object obj : original) {
            if (obj instanceof COSDictionary dict) {
                COSDictionary newDict = new COSDictionary();
                for (COSName key : dict.keySet()) {
                    newDict.setItem(key, dict.getDictionaryObject(key));
                }
                copy.add(newDict);
            } else if (obj instanceof List<?> nestedList
                    && !nestedList.isEmpty()
                    && nestedList.get(0) instanceof Object) {
                try {
                    @SuppressWarnings("unchecked")
                    List<Object> objectList = (List<Object>) nestedList;
                    copy.add(deepCopyTokens(objectList));
                } catch (ClassCastException e) {
                    copy.add(obj);
                }
            } else {
                copy.add(obj);
            }
        }
        return copy;
    }

    private static TokenModificationResult updateOperatorSafely(
            List<Object> tokens, int tokenIndex, String originalOperator) {
        try {
            int operatorIndex = tokenIndex + 1;
            if (isValidTokenIndex(tokens, operatorIndex)
                    && tokens.get(operatorIndex) instanceof Operator op
                    && op.getName().equals(originalOperator)) {
                tokens.set(operatorIndex, Operator.getOperator("TJ"));
            }
            return TokenModificationResult.success();
        } catch (Exception e) {
            return TokenModificationResult.success();
        }
    }

    private static WipeResult wipeAllSemanticTextInTokens(List<Object> tokens) {
        return wipeAllSemanticTextInTokens(tokens, true);
    }

    public byte[] performVisualRedactionWithOcrRestoration(
            RedactPdfRequest request,
            String[] listOfText,
            boolean useRegex,
            boolean wholeWordSearch)
            throws IOException {
        PDDocument visualRedactedDoc = null;
        try {
            visualRedactedDoc = pdfDocumentFactory.load(request.getFileInput());
            Map<Integer, List<PDFText>> allFound =
                    findTextToRedact(visualRedactedDoc, listOfText, useRegex, wholeWordSearch);
            String effectiveColor =
                    (request.getRedactColor() == null || request.getRedactColor().isBlank())
                            ? "#000000"
                            : request.getRedactColor();
            byte[] visualRedactedBytes =
                    finalizeRedaction(
                            visualRedactedDoc,
                            allFound,
                            effectiveColor,
                            request.getCustomPadding(),
                            true,
                            false);
            return performOcrRestoration(visualRedactedBytes, request);
        } catch (Exception e) {
            throw new IOException(
                    "Visual redaction with OCR restoration failed: " + e.getMessage(), e);
        } finally {
            if (visualRedactedDoc != null) {
                try {
                    visualRedactedDoc.close();
                } catch (IOException ignore) {
                }
            }
        }
    }

    private byte[] performOcrRestoration(byte[] redactedPdfBytes, RedactPdfRequest request)
            throws IOException, InterruptedException {
        try (TempFile tempInputFile = new TempFile(tempFileManager, ".pdf");
                TempFile tempOutputFile = new TempFile(tempFileManager, ".pdf")) {
            java.nio.file.Files.write(tempInputFile.getPath(), redactedPdfBytes);
            if (isOcrMyPdfAvailable()) {
                return processWithOcrMyPdfForRestoration(
                        tempInputFile.getPath(), tempOutputFile.getPath(), request);
            } else if (isTesseractAvailable()) {
                return processWithTesseractForRestoration(
                        tempInputFile.getPath(), tempOutputFile.getPath(), request);
            }
            return redactedPdfBytes;
        }
    }

    private static String getDecodedString(COSString cosString, PDFont font) {
        try {
            String decoded = TextDecodingHelper.tryDecodeWithFont(font, cosString);
            return (decoded != null && !decoded.trim().isEmpty()) ? decoded : cosString.getString();
        } catch (Exception e) {
            return cosString.getString();
        }
    }

    private static COSString createCompatibleCOSString(String text, COSString original) {
        try {
            COSString newString = new COSString(text);
            if (original.getBytes().length != original.getString().length()) {
                try {
                    byte[] originalBytes = original.getBytes();
                    if (originalBytes.length > 0) {
                        newString =
                                new COSString(
                                        text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    }
                } catch (Exception e) {
                }
            }
            return newString;
        } catch (Exception e) {
            return new COSString(text);
        }
    }

    private static String tryFontBasedExtraction(COSString cosString, PDFont font) {
        try {
            return TextDecodingHelper.tryDecodeWithFont(font, cosString);
        } catch (Exception e) {
            return null;
        }
    }

    private static int processSemanticTokens(List<Object> tokens, boolean removeTU) {
        int modifications = 0;
        Deque<Integer> markedContentStack = new ArrayDeque<>();

        for (int i = 0; i < tokens.size(); i++) {
            Object t = tokens.get(i);
            if (t instanceof Operator op) {
                String name = op.getName();
                if ("BDC".equals(name) || "BMC".equals(name)) {
                    markedContentStack.push(i);
                    if ("BDC".equals(name) && i > 0) {
                        Object prev = tokens.get(i - 1);
                        if (prev instanceof COSDictionary dict
                                && removeSemanticProperties(dict, removeTU)) {
                            modifications++;
                        }
                    }
                } else if ("EMC".equals(name) && !markedContentStack.isEmpty()) {
                    markedContentStack.pop();
                }
            }
        }
        return modifications;
    }

    private static void writeRedactedContentToPattern(
            PDTilingPattern pattern, List<Object> redactedTokens) throws IOException {
        var contentStream = pattern.getContentStream();
        try (var out = contentStream.createOutputStream()) {
            new ContentStreamWriter(out).writeTokens(redactedTokens);
        }
    }

    private static String normalizeTextForRedaction(String text) {
        if (text == null) return null;

        StringBuilder normalized = new StringBuilder();
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);

            if ((int) c >= 65488) {
                normalized.append(' ');
            } else if (Character.isISOControl(c) && c != '\n' && c != '\t' && c != '\r') {
                normalized.append(' ');
            } else {
                normalized.append(c);
            }
        }

        return normalized.toString();
    }

    private boolean isOcrMyPdfAvailable() {
        try {
            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.OCR_MY_PDF)
                            .runCommandWithOutputHandling(Arrays.asList("ocrmypdf", "--version"));
            return result.getRc() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isTesseractAvailable() {
        try {
            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.TESSERACT)
                            .runCommandWithOutputHandling(Arrays.asList("tesseract", "--version"));
            return result.getRc() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean isFontSuitableForWidthCalculation(PDFont font) {
        try {
            String fontName = font.getName();
            if (fontName == null
                    || isProperFontSubset(fontName)
                    || fontName.toLowerCase().matches(".*(hoepap|temp|generated).*")) {
                return false;
            }
            return hasReliableWidthMetrics(font);
        } catch (Exception e) {
            return false;
        }
    }

    private static String createSubsetFontPlaceholder(
            String originalWord, float targetWidth, PDFont font, float fontSize) {
        String result = createAlternativePlaceholder(originalWord, targetWidth, font, fontSize);
        return result != null
                ? result
                : " ".repeat(Math.max(1, originalWord != null ? originalWord.length() : 1));
    }

    public void performTextReplacementAggressive(
            PDDocument document,
            Map<Integer, List<PDFText>> allFoundTextsByPage,
            String[] listOfText,
            boolean useRegex,
            boolean wholeWordSearchBool) {
        if (allFoundTextsByPage.isEmpty()) {
            return;
        }
        Set<String> allSearchTerms =
                Arrays.stream(listOfText)
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .collect(Collectors.toSet());
        this.aggressiveMode = true;
        this.aggressiveSegMatches = new HashMap<>();
        try {
            for (int sweep = 0; sweep < MAX_SWEEPS; sweep++) {
                boolean anyResidual = false;
                int pageIndex = -1;
                for (PDPage page : document.getPages()) {
                    pageIndex++;
                    try {
                        this.aggressiveSegMatches = new HashMap<>();
                        List<Object> filtered =
                                createTokensWithoutTargetText(
                                        document,
                                        page,
                                        allSearchTerms,
                                        useRegex,
                                        wholeWordSearchBool);
                        writeFilteredContentStream(document, page, filtered);
                        boolean residual =
                                pageStillContainsTargets(
                                        document,
                                        pageIndex,
                                        allSearchTerms,
                                        useRegex,
                                        wholeWordSearchBool);
                        if (residual) {
                            anyResidual = true;
                            try {
                                var sem = wipeAllSemanticTextInTokens(filtered);
                                filtered = sem.tokens;
                                PDResources res = page.getResources();
                                if (res != null) {
                                    wipeAllSemanticTextInProperties(res);
                                    wipeAllTextInXObjects(document, res);
                                    wipeAllTextInPatterns(document, res);
                                }
                                writeFilteredContentStream(document, page, filtered);
                            } catch (Exception ignored) {
                            }
                        }
                    } catch (Exception ignored) {
                    }
                }
                if (!anyResidual) {
                    break;
                }
                if (!documentStillContainsTargets(
                        document, allSearchTerms, useRegex, wholeWordSearchBool)) {
                    break;
                }
            }
        } finally {
            this.aggressiveMode = false;
            this.aggressiveSegMatches = null;
        }
    }

    private static float calculateCharacterSumWidth(PDFont font, String text) {
        float totalWidth = 0f;
        for (char c : text.toCharArray()) {
            try {
                totalWidth += font.getStringWidth(String.valueOf(c));
            } catch (Exception e) {
                return -1f;
            }
        }
        return totalWidth;
    }

    private static boolean isValidTokenIndex(List<Object> tokens, int index) {
        return index >= 0 && index < tokens.size();
    }

    private static String buildCompleteText(List<TextSegment> segments) {
        StringBuilder sb = new StringBuilder();
        for (TextSegment segment : segments) {
            sb.append(segment.text);
        }
        return sb.toString();
    }

    private static boolean isProperFontSubset(String fontName) {
        if (fontName.length() < 7) return false;
        for (int i = 0; i < 6; i++) {
            if (fontName.charAt(i) < 'A' || fontName.charAt(i) > 'Z') return false;
        }
        return fontName.charAt(6) == '+';
    }

    private static TokenModificationResult modifySimpleTextOperator(
            List<Object> tokens,
            Object token,
            String operatorName,
            String newText,
            float adjustment,
            TextSegment segment) {
        if (!(token instanceof COSString)) {
            return TokenModificationResult.failure("Expected COSString");
        }

        try {
            int tokenIndex = segment.tokenIndex;
            if (Math.abs(adjustment) < PRECISION_THRESHOLD) {
                tokens.set(
                        tokenIndex, newText.isEmpty() ? EMPTY_COS_STRING : new COSString(newText));
                return TokenModificationResult.success();
            } else {
                return convertToTJWithAdjustment(
                        tokens, tokenIndex, operatorName, newText, adjustment, segment);
            }
        } catch (Exception e) {
            return TokenModificationResult.failure("Modification failed: " + e.getMessage());
        }
    }

    private static void performEmergencyFallback(List<Object> tokens, int tokenIndex) {
        try {
            tokens.set(tokenIndex, EMPTY_COS_STRING);
        } catch (Exception e) {
            log.error("Emergency fallback failed: {}", e.getMessage());
        }
    }

    private void processPageXObjects(
            PDDocument document,
            PDResources resources,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch,
            boolean aggressive) {
        for (COSName xobjName : resources.getXObjectNames()) {
            try {
                PDXObject xobj = resources.getXObject(xobjName);
                if (xobj instanceof PDFormXObject formXObj) {
                    processFormXObject(
                            document, formXObj, targetWords, useRegex, wholeWordSearch, aggressive);
                }
            } catch (Exception ignored) {
            }
        }
    }

    private static boolean isValidTokenForOperator(Object token, String operatorName) {
        if (token == null || operatorName == null) {
            return false;
        }

        return switch (operatorName) {
            case "Tj", "'", "\"" -> token instanceof COSString;
            case "TJ" -> token instanceof COSArray;
            default -> true;
        };
    }

    private List<TextSegment> extractTextSegments(
            PDPage page, List<Object> tokens, boolean aggressive) {
        return extractTextSegmentsEnhanced(page, tokens, aggressive);
    }

    private List<TextSegment> extractTextSegmentsEnhanced(
            PDPage page, List<Object> tokens, boolean aggressive) {
        return extractTextSegmentsFromTokens(page.getResources(), tokens, aggressive);
    }

    private static boolean hasReliableWidthMetrics(PDFont font) {
        try {
            String testString = "AbCdEf123";
            float width1 = font.getStringWidth(testString);
            float width2 = calculateCharacterSumWidth(font, testString);
            if (width1 <= 0 || width2 <= 0) return false;
            return Math.abs(width1 - width2) / Math.max(width1, width2) < 0.05f;
        } catch (Exception e) {
            return false;
        }
    }

    private static String sanitizeText(String text) {
        if (text == null) return "";

        StringBuilder sanitized = new StringBuilder();
        for (char c : text.toCharArray()) {
            if (Character.isISOControl(c) && c != '\n' && c != '\t' && c != '\r') {
                sanitized.append('\uFFFD');
            } else {
                sanitized.append(c);
            }
        }
        return sanitized.toString();
    }

    private static WipeResult wipeAllSemanticTextInTokens(List<Object> tokens, boolean removeTU) {
        if (tokens == null || tokens.isEmpty()) {
            WipeResult res = new WipeResult();
            res.tokens = new ArrayList<>();
            res.modifications = 0;
            return res;
        }

        List<Object> newTokens = deepCopyTokens(tokens);
        int modifications = processSemanticTokens(newTokens, removeTU);

        WipeResult res = new WipeResult();
        res.tokens = newTokens;
        res.modifications = modifications;
        return res;
    }

    private byte[] processWithOcrMyPdfForRestoration(
            java.nio.file.Path inputPath, java.nio.file.Path outputPath, RedactPdfRequest request)
            throws IOException, InterruptedException {
        List<String> command =
                Arrays.asList(
                        "ocrmypdf",
                        "--verbose",
                        "1",
                        "--output-type",
                        "pdf",
                        "--pdf-renderer",
                        "sandwich",
                        "--language",
                        "eng",
                        "--optimize",
                        "0",
                        "--jpeg-quality",
                        "100",
                        "--png-quality",
                        "9",
                        "--force-ocr",
                        "--deskew",
                        "--clean",
                        "--clean-final",
                        inputPath.toString(),
                        outputPath.toString());
        ProcessExecutorResult result =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.OCR_MY_PDF)
                        .runCommandWithOutputHandling(command);
        if (result.getRc() != 0) {
            throw new IOException(
                    "OCRmyPDF restoration failed with return code: "
                            + result.getRc()
                            + ". Error: "
                            + result.getMessages());
        }
        return java.nio.file.Files.readAllBytes(outputPath);
    }

    private static boolean removeSemanticProperties(COSDictionary dict, boolean removeTU) {
        boolean changed = false;
        COSName actualText = COSName.getPDFName("ActualText");
        COSName alt = COSName.getPDFName("Alt");
        COSName tu = COSName.getPDFName("TU");

        if (dict.containsKey(actualText)) {
            dict.removeItem(actualText);
            changed = true;
        }
        if (dict.containsKey(alt)) {
            dict.removeItem(alt);
            changed = true;
        }
        if (removeTU && dict.containsKey(tu)) {
            dict.removeItem(tu);
            changed = true;
        }
        return changed;
    }

    static String createPlaceholderWithWidth(
            String originalWord, float targetWidth, PDFont font, float fontSize) {
        if (originalWord == null || originalWord.isEmpty()) return " ";
        if (font == null || fontSize <= 0) return " ".repeat(originalWord.length());
        if (!WidthCalculator.isWidthCalculationReliable(font))
            return " ".repeat(originalWord.length());

        final String repeat = " ".repeat(Math.max(1, originalWord.length()));
        if (TextEncodingHelper.isFontSubset(font.getName())) {
            return createSubsetFontPlaceholder(originalWord, targetWidth, font, fontSize);
        }

        try {
            float spaceWidth = WidthCalculator.calculateAccurateWidth(font, " ", fontSize);
            if (spaceWidth <= 0) {
                return createAlternativePlaceholder(originalWord, targetWidth, font, fontSize);
            }

            int spaceCount = Math.max(1, Math.round(targetWidth / spaceWidth));
            int maxSpaces =
                    Math.max(
                            originalWord.length() * 2, Math.round(targetWidth / spaceWidth * 1.5f));
            return " ".repeat(Math.min(spaceCount, maxSpaces));
        } catch (Exception e) {
            String result = createAlternativePlaceholder(originalWord, targetWidth, font, fontSize);
            return result != null ? result : repeat;
        }
    }

    private String applyRedactionsToSegmentText(TextSegment segment, List<MatchRange> matches) {
        if (segment == null || matches == null || matches.isEmpty()) {
            return segment != null && segment.getText() != null ? segment.getText() : "";
        }

        String text = segment.getText();
        if (text == null) return "";

        if (!aggressiveMode
                && segment.getFont() != null
                && !TextEncodingHelper.isTextSegmentRemovable(segment.getFont(), text)) {
            return text;
        }

        try {
            StringBuilder result = new StringBuilder(text);
            for (MatchRange match : matches) {
                int segmentStart = Math.max(0, match.getStartPos() - segment.getStartPos());
                int segmentEnd = Math.min(text.length(), match.getEndPos() - segment.getStartPos());

                if (segmentStart < text.length() && segmentEnd > segmentStart) {
                    String originalPart = text.substring(segmentStart, segmentEnd);

                    if (!aggressiveMode
                            && segment.getFont() != null
                            && !TextEncodingHelper.isTextSegmentRemovable(
                                    segment.getFont(), originalPart)) {
                        continue;
                    }

                    if (aggressiveMode) {
                        result.replace(segmentStart, segmentEnd, "");
                    } else {
                        float originalWidth = 0;
                        if (segment.getFont() != null && segment.getFontSize() > 0) {
                            originalWidth =
                                    safeGetStringWidth(segment.getFont(), originalPart)
                                            / FONT_SCALE_FACTOR
                                            * segment.getFontSize();
                        }

                        String placeholder =
                                originalWidth > 0
                                        ? createPlaceholderWithWidth(
                                                originalPart,
                                                originalWidth,
                                                segment.getFont(),
                                                segment.getFontSize())
                                        : createPlaceholderWithFont(
                                                originalPart, segment.getFont());

                        if (placeholder == null) placeholder = " ";
                        result.replace(segmentStart, segmentEnd, placeholder);
                    }
                }
            }
            return result.toString();
        } catch (Exception e) {
            return text;
        }
    }

    private static int getActualStringLength(COSString cosString, PDFont font) {
        try {
            if (font == null) return cosString.getString().length();
            String decodedText = TextDecodingHelper.tryDecodeWithFont(font, cosString);
            return decodedText != null ? decodedText.length() : cosString.getString().length();
        } catch (Exception e) {
            return cosString.getString().length();
        }
    }

    private static float calculateSafeWidth(String text, PDFont font, float fontSize) {
        try {
            if (font != null && fontSize > 0) {
                return WidthCalculator.calculateAccurateWidth(font, text, fontSize);
            }
        } catch (Exception e) {
        }
        return 0f;
    }

    private static boolean isValidTJArray(COSArray array) {
        if (array == null || array.size() == 0) return false;
        for (COSBase element : array) {
            if (!(element instanceof COSString) && !(element instanceof COSNumber)) {
                return false;
            }
        }
        return true;
    }

    private static String createAlternativePlaceholder(
            String originalWord, float targetWidth, PDFont font, float fontSize) {
        final String repeat =
                " ".repeat(Math.max(1, originalWord != null ? originalWord.length() : 1));
        try {
            String[] alternatives = {" ", ".", "-", "_", "~", "°", "·"};
            if (TextEncodingHelper.fontSupportsCharacter(font, " ")) {
                float spaceWidth = WidthCalculator.calculateAccurateWidth(font, " ", fontSize);
                if (spaceWidth > 0) {
                    int spaceCount = Math.max(1, Math.round(targetWidth / spaceWidth));
                    int maxSpaces = (originalWord != null ? originalWord.length() : 1) * 2;
                    return " ".repeat(Math.min(spaceCount, maxSpaces));
                }
            }
            for (String alt : alternatives) {
                if (" ".equals(alt)) continue;
                try {
                    if (!TextEncodingHelper.fontSupportsCharacter(font, alt)) continue;
                    float cw = WidthCalculator.calculateAccurateWidth(font, alt, fontSize);
                    if (cw > 0) {
                        int count = Math.max(1, Math.round(targetWidth / cw));
                        int max = (originalWord != null ? originalWord.length() : 1) * 2;
                        return " ".repeat(Math.min(count, max));
                    }
                } catch (Exception ignored) {
                }
            }
            return repeat;
        } catch (Exception e) {
            return repeat;
        }
    }

    private float calculateWidthAdjustment(TextSegment segment, List<MatchRange> matches) {
        if (segment == null
                || matches == null
                || matches.isEmpty()
                || segment.getFont() == null
                || segment.getFontSize() <= 0) {
            return 0f;
        }

        try {
            if (!isFontSuitableForWidthCalculation(segment.getFont())) return 0f;
            String text = segment.getText();
            if (text == null || text.isEmpty()) return 0f;

            WidthCalculationResult result = calculatePreciseWidthAdjustment(segment, matches, text);
            return applySafetyBounds(result, segment, text);
        } catch (Exception ex) {
            return 0f;
        }
    }

    private byte[] processWithTesseractForRestoration(
            java.nio.file.Path inputPath, java.nio.file.Path outputPath, RedactPdfRequest request)
            throws IOException, InterruptedException {
        try (TempDirectory tempDir = new TempDirectory(tempFileManager)) {
            java.io.File tempOutputDir = new java.io.File(tempDir.getPath().toFile(), "output");
            java.io.File tempImagesDir = new java.io.File(tempDir.getPath().toFile(), "images");
            java.io.File finalOutputFile =
                    new java.io.File(tempDir.getPath().toFile(), "final_output.pdf");
            tempOutputDir.mkdirs();
            tempImagesDir.mkdirs();
            try (PDDocument document = pdfDocumentFactory.load(inputPath.toFile())) {
                PDFRenderer pdfRenderer = new PDFRenderer(document);
                int pageCount = document.getNumberOfPages();
                PDFMergerUtility merger = new PDFMergerUtility();
                merger.setDestinationFileName(finalOutputFile.toString());
                for (int pageNum = 0; pageNum < pageCount; pageNum++) {
                    BufferedImage image = pdfRenderer.renderImageWithDPI(pageNum, 600);
                    java.io.File imagePath =
                            new java.io.File(tempImagesDir, "page_" + pageNum + ".png");
                    ImageIO.write(image, "png", imagePath);
                    List<String> command =
                            Arrays.asList(
                                    "tesseract",
                                    imagePath.toString(),
                                    new java.io.File(tempOutputDir, "page_" + pageNum).toString(),
                                    "-l",
                                    "eng",
                                    "--dpi",
                                    "600",
                                    "--psm",
                                    "1",
                                    "pdf");
                    ProcessExecutorResult result =
                            ProcessExecutor.getInstance(ProcessExecutor.Processes.TESSERACT)
                                    .runCommandWithOutputHandling(command);
                    if (result.getRc() != 0) {
                        throw new IOException(
                                "Tesseract restoration failed with return code: " + result.getRc());
                    }
                    java.io.File pageOutputPath =
                            new java.io.File(tempOutputDir, "page_" + pageNum + ".pdf");
                    merger.addSource(pageOutputPath);
                }
                merger.mergeDocuments(null);
                java.nio.file.Files.copy(
                        finalOutputFile.toPath(),
                        outputPath,
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            return java.nio.file.Files.readAllBytes(outputPath);
        }
    }

    static String createPlaceholderWithFont(String originalWord, PDFont font) {
        if (originalWord == null || originalWord.isEmpty()) return " ";

        final String repeat = " ".repeat(Math.max(1, originalWord.length()));
        if (font != null && TextEncodingHelper.isFontSubset(font.getName())) {
            try {
                float originalWidth =
                        WidthCalculator.calculateAccurateWidth(font, originalWord, 1.0f);
                String result =
                        createAlternativePlaceholder(originalWord, originalWidth, font, 1.0f);
                return result != null ? result : repeat;
            } catch (Exception e) {
                return repeat;
            }
        }

        return repeat;
    }

    private static TokenModificationResult convertToTJWithAdjustment(
            List<Object> tokens,
            int tokenIndex,
            String originalOperator,
            String newText,
            float adjustment,
            TextSegment segment) {
        try {
            COSArray newArray = new COSArray();
            newArray.add(new COSString(newText));

            if (segment.getFontSize() > 0) {
                float kerning = (-adjustment / segment.getFontSize()) * FONT_SCALE_FACTOR;
                if (Math.abs(kerning) <= 10000f) {
                    newArray.add(new COSFloat(kerning));
                }
            }

            tokens.set(tokenIndex, newArray);
            return updateOperatorSafely(tokens, tokenIndex, originalOperator);
        } catch (Exception e) {
            return TokenModificationResult.failure("TJ conversion failed: " + e.getMessage());
        }
    }

    private static void addSpacingAdjustment(
            COSArray newArray, TextSegment segment, String originalText, String modifiedText) {
        try {
            if (segment.getFont() == null || segment.getFontSize() <= 0) return;

            float originalWidth =
                    calculateSafeWidth(originalText, segment.getFont(), segment.getFontSize());
            float modifiedWidth =
                    calculateSafeWidth(modifiedText, segment.getFont(), segment.getFontSize());
            float adjustment = originalWidth - modifiedWidth;

            if (Math.abs(adjustment) > PRECISION_THRESHOLD) {
                float kerning = (-adjustment / segment.getFontSize()) * FONT_SCALE_FACTOR * 1.10f;
                if (Math.abs(kerning) < 1000) {
                    newArray.add(new COSFloat(kerning));
                }
            }
        } catch (Exception e) {
        }
    }

    private float safeGetStringWidth(PDFont font, String text) {
        if (font == null || text == null || text.isEmpty()) return 0f;
        try {
            float widthAtSize1 = WidthCalculator.calculateAccurateWidth(font, text, 1.0f);
            return widthAtSize1 * FONT_SCALE_FACTOR;
        } catch (Exception e) {
            return 0f;
        }
    }

    private int getOriginalTokenCount(PDPage page) {
        try {
            PDFStreamParser parser = new PDFStreamParser(page);
            int count = 0;
            while (parser.parseNextToken() != null) {
                count++;
            }
            return count;
        } catch (Exception e) {
            return 0;
        }
    }

    private COSArray buildKerningAdjustedTJArray(
            COSArray originalArray, COSArray redactedArray, TextSegment segment) {
        try {
            if (segment == null || segment.getFont() == null || segment.getFontSize() <= 0)
                return redactedArray;

            COSArray out = new COSArray();
            int size = redactedArray.size();
            for (int i = 0; i < size; i++) {
                COSBase redEl = redactedArray.get(i);
                COSBase origEl =
                        (originalArray != null && i < originalArray.size())
                                ? originalArray.get(i)
                                : null;

                out.add(redEl);

                if (redEl instanceof COSString redStr && origEl instanceof COSString origStr) {
                    String origText = getDecodedString(origStr, segment.getFont());
                    String modText = getDecodedString(redStr, segment.getFont());
                    float wOrig =
                            calculateSafeWidth(origText, segment.getFont(), segment.getFontSize());
                    float wMod =
                            calculateSafeWidth(modText, segment.getFont(), segment.getFontSize());
                    float adjustment = wOrig - wMod;
                    if (Math.abs(adjustment) > PRECISION_THRESHOLD) {
                        float kerning = (-adjustment / segment.getFontSize()) * FONT_SCALE_FACTOR;
                        if (i + 1 < size && redactedArray.get(i + 1) instanceof COSNumber num) {
                            i++;
                            float combined = num.floatValue() + kerning;
                            out.add(new COSFloat(combined));
                        } else {
                            out.add(new COSFloat(kerning));
                        }
                    }
                }
            }
            return out;
        } catch (Exception e) {
            return redactedArray;
        }
    }

    private static String tryEncodingFallbacks(COSString cosString) {
        try {
            byte[] bytes = cosString.getBytes();
            if (bytes.length == 0) return "";

            String[] encodings = {"UTF-8", "UTF-16BE", "UTF-16LE", "ISO-8859-1", "Windows-1252"};

            for (String encoding : encodings) {
                try {
                    if (bytes.length >= 2) {
                        if ((bytes[0] & 0xFF) == 0xFE && (bytes[1] & 0xFF) == 0xFF) {
                            return new String(
                                    bytes, 2, bytes.length - 2, StandardCharsets.UTF_16LE);
                        } else if ((bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xFE) {
                            return new String(
                                    bytes, 2, bytes.length - 2, StandardCharsets.UTF_16LE);
                        }
                    }

                    String decoded = new String(bytes, encoding);
                    if (!isGibberish(decoded)) {
                        return decoded;
                    }
                } catch (Exception ignored) {
                }
            }
        } catch (Exception e) {
        }
        return null;
    }

    private float applySafetyBounds(
            WidthCalculationResult result, TextSegment segment, String text) {
        if (result.processedMatches() == 0) return 0f;

        float adjustment = result.adjustment();
        float maxReasonable = calculateMaxReasonableAdjustment(segment, text);
        return Math.abs(adjustment) > maxReasonable ? 0f : adjustment;
    }

    private float calculateMaxReasonableAdjustment(TextSegment segment, String text) {
        float fontSize = segment.getFontSize();
        float baseLimit = text.length() * fontSize * 2f;

        try {
            float avgCharWidth =
                    safeGetStringWidth(segment.getFont(), "M") / FONT_SCALE_FACTOR * fontSize;
            if (avgCharWidth > 0) {
                baseLimit = Math.max(baseLimit, text.length() * avgCharWidth * 1.5f);
            }
        } catch (Exception e) {
        }
        return baseLimit;
    }

    List<Object> createTokensWithoutTargetText(
            PDDocument document,
            PDPage page,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch)
            throws IOException {
        log.debug("Processing page with {} target words: {}", targetWords.size(), targetWords);

        PDFStreamParser parser = new PDFStreamParser(page);
        List<Object> tokens = new ArrayList<>();
        Object tk;
        int tokenCount = 0;
        while (true) {
            final Object parsedNextToken = parser.parseNextToken();
            if ((tk = parsedNextToken) == null) break;
            tokens.add(tk);
            tokenCount++;
        }

        log.debug("Parsed {} tokens from page content stream", tokenCount);

        if (tokenCount == 0 && !targetWords.isEmpty()) {
            log.warn(
                    "No tokens parsed from page content stream - this might indicate encoding issues");
            log.warn("Attempting alternative verification for target words: {}", targetWords);

            try {
                TextFinder directFinder = new TextFinder("", false, false);
                directFinder.setStartPage(document.getPages().indexOf(page) + 1);
                directFinder.setEndPage(document.getPages().indexOf(page) + 1);
                directFinder.getText(document);

                StringBuilder pageText = new StringBuilder();
                for (PDFText pdfText : directFinder.getFoundTexts()) {
                    if (pdfText.getText() != null) {
                        pageText.append(pdfText.getText()).append(" ");
                    }
                }

                String extractedText = pageText.toString().trim();
                log.debug("Alternative text extraction found: '{}'", extractedText);

                for (String word : targetWords) {
                    if (extractedText.toLowerCase().contains(word.toLowerCase())) {
                        log.warn("Found target word '{}' via alternative extraction method", word);
                    }
                }

            } catch (Exception e) {
                log.error("Alternative text extraction failed: {}", e.getMessage());
            }
        }

        PDResources resources = page.getResources();
        if (resources != null) {
            log.debug("Processing XObjects for page");
            processPageXObjects(
                    document,
                    resources,
                    targetWords,
                    useRegex,
                    wholeWordSearch,
                    this.aggressiveMode);
        }

        List<TextSegment> textSegments = extractTextSegments(page, tokens, this.aggressiveMode);
        log.debug("Extracted {} text segments from tokens", textSegments.size());

        if (!textSegments.isEmpty()) {
            StringBuilder allText = new StringBuilder();
            boolean hasProblematicChars = false;

            for (TextSegment seg : textSegments) {
                if (seg.getText() != null && !seg.getText().trim().isEmpty()) {
                    String segmentText = seg.getText();
                    if (!isTextSafeForRedaction(segmentText)) {
                        hasProblematicChars = true;
                        segmentText = normalizeTextForRedaction(segmentText);
                        log.debug(
                                "Normalized problematic text in segment: original contained encoding issues");
                    }
                    allText.append(segmentText).append(" ");
                }
            }

            String completeText = allText.toString().trim();
            if (!completeText.isEmpty()) {
                log.debug("Complete extracted text: '{}'", completeText);
                if (hasProblematicChars) {
                    log.info("Applied character normalization to handle encoding issues");
                }
            }
        }

        List<MatchRange> matches;
        if (this.aggressiveMode) {
            log.debug("Using aggressive mode for matching");
            matches =
                    findAllMatchesAggressive(
                            textSegments, tokens, targetWords, useRegex, wholeWordSearch);
        } else {
            log.debug("Using moderate mode for matching");
            matches = findMatchesInSegments(textSegments, targetWords, useRegex, wholeWordSearch);
        }

        log.info("Found {} matches to redact", matches.size());
        if (!matches.isEmpty()) {
            log.debug("Match ranges: {}", matches);
        }

        List<Object> resultTokens = applyRedactionsToTokens(tokens, textSegments, matches);
        int modifications = tokens.size() - resultTokens.size();
        log.debug(
                "Applied redactions - original tokens: {}, result tokens: {}, modifications: {}",
                tokens.size(),
                resultTokens.size(),
                modifications);

        return resultTokens;
    }

    private static boolean isGibberish(String text) {
        if (text == null || text.trim().isEmpty()) {
            return true;
        }

        int questionMarks = 0;
        int replacementChars = 0;
        int totalChars = text.length();

        for (char c : text.toCharArray()) {
            if (c == '?') questionMarks++;
            if (c == '\uFFFD') replacementChars++;
        }

        double problematicRatio = (double) (questionMarks + replacementChars) / totalChars;
        return problematicRatio > 0.3;
    }

    public boolean performTextReplacement(
            PDDocument document,
            Map<Integer, List<PDFText>> allFoundTextsByPage,
            String[] listOfText,
            boolean useRegex,
            boolean wholeWordSearchBool) {
        if (allFoundTextsByPage.isEmpty()) {
            log.info("No text found to redact");
            return false;
        }
        try {
            Set<String> allSearchTerms =
                    Arrays.stream(listOfText)
                            .map(String::trim)
                            .filter(s -> !s.isEmpty())
                            .collect(Collectors.toSet());

            log.info(
                    "Starting text replacement with {} search terms: {}",
                    allSearchTerms.size(),
                    allSearchTerms);
            log.info("Total pages in document: {}", document.getNumberOfPages());
            log.info("Initial text found on {} pages", allFoundTextsByPage.size());

            int initialTotalInstances =
                    allFoundTextsByPage.values().stream().mapToInt(List::size).sum();
            log.info("Total initial instances to redact: {}", initialTotalInstances);

            int finalSweepCount = 0;
            for (int sweep = 0; sweep < MAX_SWEEPS; sweep++) {
                finalSweepCount = sweep + 1;
                log.info("=== Starting sweep {} of {} ===", sweep + 1, MAX_SWEEPS);
                int pagesProcessed = 0;
                int totalModifications = 0;

                for (int pageIndex = 0; pageIndex < document.getNumberOfPages(); pageIndex++) {
                    PDPage page = document.getPages().get(pageIndex);
                    List<PDFText> pageFoundTexts =
                            allFoundTextsByPage.getOrDefault(pageIndex, List.of());

                    log.debug(
                            "Processing page {} - found {} instances",
                            pageIndex + 1,
                            pageFoundTexts.size());

                    List<Object> filtered =
                            createTokensWithoutTargetText(
                                    document, page, allSearchTerms, useRegex, wholeWordSearchBool);
                    writeFilteredContentStream(document, page, filtered);

                    int tokenDiff = Math.abs(filtered.size() - getOriginalTokenCount(page));
                    totalModifications += tokenDiff;
                    pagesProcessed++;

                    log.debug("Page {} - token modifications: {}", pageIndex + 1, tokenDiff);
                }

                log.info(
                        "Sweep {} completed - processed {} pages, total modifications: {}",
                        sweep + 1,
                        pagesProcessed,
                        totalModifications);

                boolean stillContainsTargets =
                        documentStillContainsTargets(
                                document, allSearchTerms, useRegex, wholeWordSearchBool);

                if (!stillContainsTargets) {
                    log.info("SUCCESS: All targets removed after {} sweeps", sweep + 1);
                    break;
                } else {
                    log.warn(
                            "WARNING: Still contains targets after sweep {} - continuing...",
                            sweep + 1);
                }
            }

            boolean finalCheck = false;
            for (int verifyAttempt = 0; verifyAttempt < 3; verifyAttempt++) {
                log.info("Final verification attempt {} of 3", verifyAttempt + 1);
                finalCheck =
                        documentStillContainsTargets(
                                document, allSearchTerms, useRegex, wholeWordSearchBool);

                if (!finalCheck) {
                    log.info(
                            "Verification attempt {} passed - no targets found", verifyAttempt + 1);
                    break;
                } else {
                    log.warn("Verification attempt {} found remaining targets", verifyAttempt + 1);
                    if (verifyAttempt < 2) {
                        log.info("Performing additional cleanup sweep due to verification failure");
                        for (PDPage page : document.getPages()) {
                            List<Object> additionalFiltered =
                                    createTokensWithoutTargetText(
                                            document,
                                            page,
                                            allSearchTerms,
                                            useRegex,
                                            wholeWordSearchBool);
                            writeFilteredContentStream(document, page, additionalFiltered);
                        }
                    }
                }
            }

            if (finalCheck) {
                log.error(
                        "FAILURE: Document still contains targets after {} sweeps and {} verification attempts. Falling back to visual redaction with OCR restoration.",
                        MAX_SWEEPS,
                        3);
                log.error("Remaining search terms: {}", allSearchTerms);

                log.error("=== DETAILED FAILURE ANALYSIS ===");
                for (int pageIdx = 0; pageIdx < document.getNumberOfPages(); pageIdx++) {
                    for (String term : allSearchTerms) {
                        try {
                            TextFinder finder = new TextFinder(term, useRegex, wholeWordSearchBool);
                            finder.setStartPage(pageIdx + 1);
                            finder.setEndPage(pageIdx + 1);
                            finder.getText(document);

                            for (PDFText found : finder.getFoundTexts()) {
                                if (found.getPageIndex() == pageIdx) {
                                    log.error(
                                            "REMAINING: '{}' found on page {} at position ({}, {})",
                                            term,
                                            pageIdx + 1,
                                            found.getX1(),
                                            found.getY1());
                                }
                            }
                        } catch (Exception e) {
                            log.error(
                                    "Error during failure analysis for term '{}' on page {}: {}",
                                    term,
                                    pageIdx + 1,
                                    e.getMessage());
                        }
                    }
                }
                log.error("=== END FAILURE ANALYSIS ===");

                return true;
            } else {
                log.info(
                        "SUCCESS: All text redaction completed successfully after {} sweeps",
                        finalSweepCount);
                return false;
            }

        } catch (Exception e) {
            log.error("Exception during text replacement: {}", e.getMessage(), e);
            return true;
        }
    }

    private COSArray createRedactedTJArray(
            COSArray originalArray, TextSegment segment, List<MatchRange> matches) {
        if (originalArray == null || segment == null || matches == null) {
            return originalArray != null ? originalArray : new COSArray();
        }
        if (matches.isEmpty()) return originalArray;
        if (segment.getStartPos() < 0) return originalArray;

        try {
            COSArray newArray = new COSArray();
            int textOffsetInSegment = 0;

            for (COSBase element : originalArray) {
                if (element instanceof COSString cosString) {
                    try {
                        processStringElement(
                                cosString, segment, matches, newArray, textOffsetInSegment);
                        textOffsetInSegment += getActualStringLength(cosString, segment.getFont());
                    } catch (Exception e) {
                        newArray.add(element);
                        textOffsetInSegment += getActualStringLength(cosString, segment.getFont());
                    }
                } else {
                    newArray.add(element);
                }
            }
            return newArray;
        } catch (Exception e) {
            return originalArray;
        }
    }

    private COSString redactCosStringByDecodedRanges(
            PDFont font, COSString cosString, List<AggressiveSegMatch> decRanges) {
        try {
            byte[] bytes = cosString.getBytes();
            DecodedMapping dm = TextDecodingHelper.buildDecodeMapping(font, bytes);
            if (dm.text.isEmpty() || dm.charByteStart.length == 0) {
                return cosString;
            }
            boolean[] delete = new boolean[bytes.length];
            for (AggressiveSegMatch r : decRanges) {
                int ds = Math.max(0, Math.min(r.decodedStart, dm.charByteStart.length));
                int de = Math.max(ds, Math.min(r.decodedEnd, dm.charByteStart.length));
                if (ds >= de) {
                    continue;
                }
                int byteStart = dm.charByteStart[ds];
                int byteEnd = dm.charByteEnd[de - 1];
                for (int bi = Math.max(0, byteStart); bi < Math.min(bytes.length, byteEnd); bi++) {
                    delete[bi] = true;
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream(bytes.length);
            for (int bi = 0; bi < bytes.length; bi++) {
                if (!delete[bi]) {
                    baos.write(bytes[bi]);
                }
            }
            return new COSString(baos.toByteArray());
        } catch (Exception e) {
            return this.aggressiveMode ? EMPTY_COS_STRING : cosString;
        }
    }

    private TokenModificationResult performTokenModification(
            List<Object> tokens,
            Object token,
            String operatorName,
            String newText,
            float adjustment,
            TextSegment segment,
            List<MatchRange> matches) {
        return switch (operatorName) {
            case "Tj", "'", "\"" ->
                    modifySimpleTextOperator(
                            tokens, token, operatorName, newText, adjustment, segment);
            case "TJ" -> modifyTJOperator(tokens, token, segment, matches);
            default -> TokenModificationResult.failure("Unsupported operator: " + operatorName);
        };
    }

    private List<MatchRange> findMatchesInSegments(
            List<TextSegment> segments,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch) {
        List<MatchRange> allMatches = new ArrayList<>();
        List<Pattern> patterns =
                TextFinderUtils.createOptimizedSearchPatterns(
                        targetWords, useRegex, wholeWordSearch);

        log.debug("Searching for {} patterns in {} segments", patterns.size(), segments.size());

        int totalMatchesFound = 0;

        for (int i = 0; i < segments.size(); i++) {
            TextSegment segment = segments.get(i);
            String segmentText = segment.getText();
            if (segmentText == null || segmentText.isEmpty()) {
                log.debug("Skipping empty segment {}", i);
                continue;
            }

            log.debug("Processing segment {}: '{}'", i, segmentText);

            if (segment.getFont() != null
                    && !TextEncodingHelper.isTextSegmentRemovable(segment.getFont(), segmentText)) {
                log.debug(
                        "Skipping segment {} - font not removable: {}",
                        i,
                        segment.getFont().getName());
                continue;
            }

            int segmentMatches = 0;
            for (Pattern pattern : patterns) {
                try {
                    log.debug(
                            "Matching pattern '{}' against segment text '{}'",
                            pattern.pattern(),
                            segmentText);
                    var matcher = pattern.matcher(segmentText);
                    while (matcher.find()) {
                        int matchStart = matcher.start();
                        int matchEnd = matcher.end();

                        log.debug(
                                "Found match in segment {}: positions {}-{}",
                                i,
                                matchStart,
                                matchEnd);

                        if (matchStart >= 0
                                && matchEnd <= segmentText.length()
                                && matchStart < matchEnd) {
                            String matchedText = segmentText.substring(matchStart, matchEnd);
                            log.debug("Matched text: '{}'", matchedText);

                            allMatches.add(
                                    new MatchRange(
                                            segment.getStartPos() + matchStart,
                                            segment.getStartPos() + matchEnd));
                            segmentMatches++;
                            totalMatchesFound++;
                        }
                    }
                } catch (Exception e) {
                    log.error("Error matching pattern in segment {}: {}", i, e.getMessage());
                }
            }

            if (segmentMatches > 0) {
                log.info("Segment {} had {} matches", i, segmentMatches);
            }
        }

        log.info("Total matches found across all segments: {}", totalMatchesFound);
        allMatches.sort(Comparator.comparingInt(MatchRange::getStartPos));

        if (allMatches.isEmpty()) {
            log.warn("No matches found in segments. This might indicate:");
            log.warn("1. Text encoding issues preventing proper extraction");
            log.warn("2. Font compatibility issues");
            log.warn("3. Search terms not matching extracted text");
            log.warn("4. Whole word search filtering out matches");

            if (!segments.isEmpty()) {
                log.warn("Sample segment text: '{}'", segments.get(0).getText());
                log.warn("Target words: {}", targetWords);
                log.warn("Use regex: {}, Whole word search: {}", useRegex, wholeWordSearch);
            }
        }

        return allMatches;
    }

    private String createSafeReplacement(String originalPart, TextSegment segment) {
        try {
            if (segment.getFont() != null && segment.getFontSize() > 0) {
                float originalWidth =
                        calculateSafeWidth(originalPart, segment.getFont(), segment.getFontSize());
                if (originalWidth > 0) {
                    return createPlaceholderWithWidth(
                            originalPart, originalWidth, segment.getFont(), segment.getFontSize());
                }
            }
            return createPlaceholderWithFont(originalPart, segment.getFont());
        } catch (Exception e) {
            return " ".repeat(Math.max(1, originalPart.length()));
        }
    }

    private List<Object> applyRedactionsToTokens(
            List<Object> tokens, List<TextSegment> textSegments, List<MatchRange> matches) {
        log.debug(
                "Applying redactions to {} tokens with {} matches across {} segments",
                tokens.size(),
                matches.size(),
                textSegments.size());

        List<Object> newTokens = new ArrayList<>(tokens);
        int totalModifications = 0;

        if (this.aggressiveMode) {
            log.debug("Using aggressive mode for token redaction");
            Map<Integer, List<AggressiveSegMatch>> perSeg = this.aggressiveSegMatches;
            if (perSeg != null && !perSeg.isEmpty()) {
                log.debug("Processing {} aggressive segments", perSeg.size());
                List<Integer> segIndices = new ArrayList<>(perSeg.keySet());
                segIndices.sort(
                        (a, b) ->
                                Integer.compare(
                                        textSegments.get(b).tokenIndex,
                                        textSegments.get(a).tokenIndex));
                for (Integer segIndex : segIndices) {
                    TextSegment segment = textSegments.get(segIndex);
                    List<AggressiveSegMatch> segMatches = perSeg.getOrDefault(segIndex, List.of());
                    if (segMatches.isEmpty()) {
                        continue;
                    }

                    log.debug(
                            "Processing aggressive segment {} with {} matches",
                            segIndex,
                            segMatches.size());
                    Object token = newTokens.get(segment.tokenIndex);
                    String opName = segment.operatorName;
                    if (("Tj".equals(opName) || "'".equals(opName) || "\"".equals(opName))
                            && token instanceof COSString cs) {
                        log.debug(
                                "Redacting Tj/TjQuote operator at token index {}",
                                segment.tokenIndex);
                        COSString redacted =
                                redactCosStringByDecodedRanges(segment.font, cs, segMatches);
                        if (segment.font != null && segment.fontSize > 0) {
                            String originalText = getDecodedString(cs, segment.font);
                            String modifiedText = getDecodedString(redacted, segment.font);
                            log.debug(
                                    "Original text: '{}', Modified text: '{}'",
                                    originalText,
                                    modifiedText);
                            float wOrig =
                                    calculateSafeWidth(
                                            originalText, segment.font, segment.fontSize);
                            float wMod =
                                    calculateSafeWidth(
                                            modifiedText, segment.font, segment.fontSize);
                            float adjustment = wOrig - wMod;
                            if (Math.abs(adjustment) > PRECISION_THRESHOLD) {
                                log.debug("Applying kerning adjustment: {}", adjustment);
                                COSArray arr = new COSArray();
                                arr.add(redacted);
                                float kerning =
                                        (-adjustment / segment.fontSize) * FONT_SCALE_FACTOR;
                                arr.add(new COSFloat(kerning));
                                newTokens.set(segment.tokenIndex, arr);
                                updateOperatorSafely(newTokens, segment.tokenIndex, opName);
                                totalModifications++;
                            } else {
                                newTokens.set(segment.tokenIndex, redacted);
                                totalModifications++;
                            }
                        } else {
                            newTokens.set(segment.tokenIndex, redacted);
                            totalModifications++;
                        }
                    } else if ("TJ".equals(opName) && token instanceof COSArray arr) {
                        log.debug("Redacting TJ operator at token index {}", segment.tokenIndex);
                        COSArray redacted =
                                redactTJArrayByDecodedRanges(segment.font, arr, segMatches);
                        COSArray withKerning = buildKerningAdjustedTJArray(arr, redacted, segment);
                        newTokens.set(segment.tokenIndex, withKerning);
                        totalModifications++;
                    }
                }
                log.info("Aggressive mode completed - {} modifications made", totalModifications);
                return newTokens;
            }
        }

        log.debug("Using moderate mode for token redaction");
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

        log.debug("Matches distributed across {} segments", matchesBySegment.size());
        matchesBySegment.forEach(
                (segIdx, matchList) ->
                        log.debug("Segment {}: {} matches", segIdx, matchList.size()));

        List<ModificationTask> tasks = new ArrayList<>();
        for (Map.Entry<Integer, List<MatchRange>> entry : matchesBySegment.entrySet()) {
            int segmentIndex = entry.getKey();
            List<MatchRange> segmentMatches = entry.getValue();

            if (segmentIndex < 0 || segmentIndex >= textSegments.size()) {
                log.warn("Invalid segment index: {}", segmentIndex);
                continue;
            }
            TextSegment segment = textSegments.get(segmentIndex);
            if (segment == null) {
                log.warn("Null segment at index: {}", segmentIndex);
                continue;
            }

            try {
                if ("Tj".equals(segment.operatorName) || "'".equals(segment.operatorName)) {
                    log.debug(
                            "Creating modification task for Tj operator at segment {}",
                            segmentIndex);
                    String newText = applyRedactionsToSegmentText(segment, segmentMatches);
                    if (newText == null) newText = "";
                    float adjustment = calculateWidthAdjustment(segment, segmentMatches);
                    tasks.add(new ModificationTask(segment, newText, adjustment));
                    log.debug(
                            "Task created: original='{}', new='{}', adjustment={}",
                            segment.getText(),
                            newText,
                            adjustment);
                } else if ("TJ".equals(segment.operatorName)) {
                    log.debug(
                            "Creating modification task for TJ operator at segment {}",
                            segmentIndex);
                    tasks.add(new ModificationTask(segment, "", 0));
                }
            } catch (Exception e) {
                log.error(
                        "Error creating modification task for segment {}: {}",
                        segmentIndex,
                        e.getMessage());
            }
        }

        log.info("Created {} modification tasks", tasks.size());
        tasks.sort((a, b) -> Integer.compare(b.segment.tokenIndex, a.segment.tokenIndex));

        int maxTasksToProcess = Math.min(tasks.size(), 1000);
        log.debug("Processing {} out of {} tasks (limit: 1000)", maxTasksToProcess, tasks.size());

        int successfulModifications = 0;
        for (int i = 0; i < maxTasksToProcess && i < tasks.size(); i++) {
            ModificationTask task = tasks.get(i);
            try {
                List<MatchRange> segmentMatches =
                        matchesBySegment.getOrDefault(
                                textSegments.indexOf(task.segment), Collections.emptyList());

                if (task.segment.tokenIndex >= newTokens.size()) {
                    log.warn(
                            "Token index {} out of bounds (size: {})",
                            task.segment.tokenIndex,
                            newTokens.size());
                    continue;
                }
                if (task.segment.getText() == null || task.segment.getText().isEmpty()) {
                    log.debug("Skipping empty text segment at index {}", task.segment.tokenIndex);
                    continue;
                }

                log.debug(
                        "Applying redaction to token {}: '{}' -> '{}'",
                        task.segment.tokenIndex,
                        task.segment.getText(),
                        task.newText);

                modifyTokenForRedaction(
                        newTokens, task.segment, task.newText, task.adjustment, segmentMatches);
                successfulModifications++;
                totalModifications++;

            } catch (Exception e) {
                log.error("Error applying redaction to task {}: {}", i, e.getMessage());
            }
        }

        log.info(
                "Redaction completed - {} successful modifications out of {} tasks",
                successfulModifications,
                tasks.size());
        log.info("Total modifications made: {}", totalModifications);

        return newTokens;
    }

    private List<TextSegment> extractTextSegmentsFromTokens(
            PDResources resources, List<Object> tokens, boolean aggressive) {
        List<TextSegment> segments = new ArrayList<>();
        int currentTextPos = 0;
        GraphicsState gs = new GraphicsState();
        for (int i = 0; i < tokens.size(); i++) {
            Object currentToken = tokens.get(i);
            if (currentToken instanceof Operator op) {
                String opName = op.getName();
                if ("Tf".equals(opName) && i >= 2) {
                    try {
                        COSName fontName = (COSName) tokens.get(i - 2);
                        COSBase fontSizeBase = (COSBase) tokens.get(i - 1);
                        if (fontSizeBase instanceof COSNumber cosNumber) {
                            PDFont safeFont = TextDecodingHelper.getFontSafely(resources, fontName);
                            gs.setFont(safeFont);
                            gs.setFontSize(cosNumber.floatValue());
                        }
                    } catch (Exception ignored) {
                    }
                }
                if (isTextShowingOperator(opName) && i > 0) {
                    String textContent = extractTextFromToken(tokens.get(i - 1), opName, gs.font);
                    if (textContent != null && !textContent.trim().isEmpty()) {
                        if (aggressive
                                && gs.font != null
                                && tokens.get(i - 1) instanceof COSString cs) {
                            TextDecodingHelper.tryDecodeWithFontEnhanced(gs.font, cs);
                        }
                        segments.add(
                                new TextSegment(
                                        i - 1,
                                        opName,
                                        textContent,
                                        currentTextPos,
                                        currentTextPos + textContent.length(),
                                        gs.font,
                                        gs.fontSize));
                        currentTextPos += textContent.length();
                    }
                }
            }
        }
        return segments;
    }

    private WidthMeasurement measureTextWidth(PDFont font, String text, float fontSize) {
        try {
            float fontUnits = safeGetStringWidth(font, text);
            if (fontUnits < 0) return WidthMeasurement.invalid();

            float actualWidth = (fontUnits / FONT_SCALE_FACTOR) * fontSize;
            float characterSumWidth = calculateCharacterSumWidth(font, text);

            if (characterSumWidth > 0) {
                float characterActualWidth = (characterSumWidth / FONT_SCALE_FACTOR) * fontSize;
                if (actualWidth != 0
                        && Math.abs(actualWidth - characterActualWidth) / actualWidth > 0.1f) {
                    actualWidth = Math.max(actualWidth, characterActualWidth);
                }
            }

            return new WidthMeasurement(actualWidth, true);
        } catch (Exception e) {
            return WidthMeasurement.invalid();
        }
    }

    private List<MatchRange> findAllMatchesAggressive(
            List<TextSegment> segments,
            List<Object> tokens,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch) {
        List<Pattern> patterns =
                TextFinderUtils.createOptimizedSearchPatterns(
                        targetWords, useRegex, wholeWordSearch);
        List<MatchRange> result = new ArrayList<>();
        Map<Integer, List<AggressiveSegMatch>> perSegMatches = new HashMap<>();
        try {
            String completeText = buildCompleteText(segments);
            if (!completeText.isEmpty()) {
                List<MatchRange> global =
                        findAllMatches(completeText, targetWords, useRegex, wholeWordSearch);
                if (!global.isEmpty()) {
                    result.addAll(global);
                } else if (!useRegex && !targetWords.isEmpty()) {
                    String lower = completeText.toLowerCase();
                    for (String word : targetWords) {
                        String w = word.toLowerCase();
                        int idx = lower.indexOf(w);
                        while (idx >= 0) {
                            result.add(new MatchRange(idx, idx + w.length()));
                            idx = lower.indexOf(w, idx + 1);
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }

        List<String> decodedPerSegment = new ArrayList<>(segments.size());
        List<Integer> decStarts = new ArrayList<>(segments.size());
        List<Integer> decEnds = new ArrayList<>(segments.size());
        int decCursor = 0;
        for (TextSegment seg : segments) {
            String decoded = null;
            try {
                Object tok = tokens.get(seg.tokenIndex);
                if (("Tj".equals(seg.operatorName)
                                || "'".equals(seg.operatorName)
                                || "\"".equals(seg.operatorName))
                        && tok instanceof COSString cs) {
                    decoded = TextDecodingHelper.tryDecodeWithFont(seg.font, cs);
                } else if ("TJ".equals(seg.operatorName) && tok instanceof COSArray arr) {
                    StringBuilder sb = new StringBuilder();
                    for (COSBase el : arr) {
                        if (el instanceof COSString s) {
                            String d = TextDecodingHelper.tryDecodeWithFont(seg.font, s);
                            sb.append(d != null ? d : s.getString());
                        }
                    }
                    decoded = sb.toString();
                }
            } catch (Exception ignored) {
            }
            String basis = (decoded != null) ? decoded : seg.getText();
            decodedPerSegment.add(basis);
            decStarts.add(decCursor);
            decCursor += basis.length();
            decEnds.add(decCursor);
        }
        StringBuilder decodedCompleteSb = new StringBuilder();
        for (String d : decodedPerSegment) {
            decodedCompleteSb.append(d);
        }
        String decodedComplete = decodedCompleteSb.toString();
        if (!decodedComplete.isEmpty()) {
            List<Pattern> patternsDec =
                    TextFinderUtils.createOptimizedSearchPatterns(
                            targetWords, useRegex, wholeWordSearch);
            for (Pattern p : patternsDec) {
                try {
                    var m = p.matcher(decodedComplete);
                    while (m.find()) {
                        int gStart = m.start();
                        int gEnd = m.end();
                        mapStartToEnd(
                                segments, result, perSegMatches, decStarts, decEnds, gStart, gEnd);
                    }
                } catch (Exception ignored) {
                }
            }
            if (perSegMatches.isEmpty() && !useRegex && !targetWords.isEmpty()) {
                String lower = decodedComplete.toLowerCase();
                for (String word : targetWords) {
                    String w = word.toLowerCase();
                    int idx = lower.indexOf(w);
                    while (idx >= 0) {
                        int gStart = idx;
                        int gEnd = idx + w.length();
                        mapStartToEnd(
                                segments, result, perSegMatches, decStarts, decEnds, gStart, gEnd);
                        idx = lower.indexOf(w, idx + 1);
                    }
                }
            }
        }
        if (!perSegMatches.isEmpty()) {
            this.aggressiveSegMatches = perSegMatches;
        } else {
            this.aggressiveSegMatches = null;
        }

        for (TextSegment seg : segments) {
            String decoded = null;
            try {
                Object tok = tokens.get(seg.tokenIndex);
                if (("Tj".equals(seg.operatorName) || "'".equals(seg.operatorName))
                        && tok instanceof COSString cs) {
                    decoded = TextDecodingHelper.tryDecodeWithFont(seg.font, cs);
                } else if ("TJ".equals(seg.operatorName) && tok instanceof COSArray arr) {
                    StringBuilder sb = new StringBuilder();
                    for (COSBase el : arr) {
                        if (el instanceof COSString s) {
                            String d = TextDecodingHelper.tryDecodeWithFont(seg.font, s);
                            sb.append(d != null ? d : s.getString());
                        }
                    }
                    decoded = sb.toString();
                }
            } catch (Exception ignored) {
            }
            String basis = (decoded != null && !decoded.isEmpty()) ? decoded : seg.getText();
            boolean any = false;
            for (Pattern p : patterns) {
                try {
                    var m = p.matcher(basis);
                    while (m.find()) {
                        any = true;
                        result.add(new MatchRange(seg.getStartPos(), seg.getStartPos()));
                    }
                } catch (Exception ignored) {
                }
            }
            if (!any) {
                NormalizedMap nm = buildNormalizedMap(seg.getText());
                if (!nm.norm.isEmpty()) {
                    for (String word : targetWords) {
                        String normWord = normalizeForFuzzy(word);
                        if (normWord.isEmpty()) {
                            continue;
                        }
                        int idx = nm.norm.indexOf(normWord);
                        while (idx >= 0) {
                            int origStart = nm.map[idx];
                            int origEnd =
                                    nm.map[Math.min(idx + normWord.length() - 1, nm.map.length - 1)]
                                            + 1;
                            result.add(
                                    new MatchRange(
                                            seg.getStartPos() + origStart,
                                            seg.getStartPos() + origEnd));
                            idx = nm.norm.indexOf(normWord, idx + 1);
                        }
                    }
                }
            }
        }
        result.sort(Comparator.comparingInt(MatchRange::getStartPos));
        return result;
    }

    private String handleTjOperator(Object token, PDFont font) {
        return (token instanceof COSString cosString)
                ? extractStringWithFallbacks(cosString, font)
                : "";
    }

    private String handleQuotedOperator(Object token, PDFont font) {
        return (token instanceof COSString cosString)
                ? "\n" + extractStringWithFallbacks(cosString, font)
                : "\n";
    }

    private String handleTJOperator(Object token, PDFont font) {
        if (!(token instanceof COSArray cosArray)) return "";

        StringBuilder textBuilder = new StringBuilder();
        for (COSBase element : cosArray) {
            if (element instanceof COSString cosString) {
                textBuilder.append(extractStringWithFallbacks(cosString, font));
            } else if (element instanceof COSNumber cosNumber) {
                if (cosNumber.floatValue() < -100.0) {
                    textBuilder.append(" ");
                }
            }
        }
        return textBuilder.toString();
    }

    private void mapStartToEnd(
            List<TextSegment> segments,
            List<MatchRange> result,
            Map<Integer, List<AggressiveSegMatch>> perSegMatches,
            List<Integer> decStarts,
            List<Integer> decEnds,
            int gStart,
            int gEnd) {
        for (int sIdx = 0; sIdx < segments.size(); sIdx++) {
            int sStart = decStarts.get(sIdx);
            int sEnd = decEnds.get(sIdx);
            int ovStart = Math.max(gStart, sStart);
            int ovEnd = Math.min(gEnd, sEnd);
            if (ovStart < ovEnd) {
                int localStart = ovStart - sStart;
                int localEnd = ovEnd - sStart;
                perSegMatches
                        .computeIfAbsent(sIdx, k -> new ArrayList<>())
                        .add(new AggressiveSegMatch(sIdx, localStart, localEnd));
                TextSegment seg = segments.get(sIdx);
                int mappedStart = seg.getStartPos();
                int mappedEnd = Math.min(seg.getEndPos(), seg.getStartPos() + 1);
                result.add(new MatchRange(mappedStart, mappedEnd));
            }
        }
    }

    private TokenModificationResult modifyTJOperator(
            List<Object> tokens, Object token, TextSegment segment, List<MatchRange> matches) {
        if (!(token instanceof COSArray originalArray)) {
            return TokenModificationResult.failure("Expected COSArray for TJ operator");
        }

        try {
            COSArray newArray = createRedactedTJArray(originalArray, segment, matches);
            if (!isValidTJArray(newArray)) {
                return TokenModificationResult.failure("Generated invalid TJ array");
            }
            tokens.set(segment.tokenIndex, newArray);
            return TokenModificationResult.success();
        } catch (Exception e) {
            return TokenModificationResult.failure("TJ modification failed: " + e.getMessage());
        }
    }

    private WidthCalculationResult calculatePreciseWidthAdjustment(
            TextSegment segment, List<MatchRange> matches, String text) {
        float totalOriginalWidth = 0f, totalPlaceholderWidth = 0f;
        int processedMatches = 0;
        List<String> warnings = new ArrayList<>();

        for (MatchRange match : matches) {
            try {
                int segStart = Math.max(0, match.getStartPos() - segment.getStartPos());
                int segEnd = Math.min(text.length(), match.getEndPos() - segment.getStartPos());

                if (segStart >= text.length() || segEnd <= segStart || segStart < 0) {
                    warnings.add("Invalid bounds: " + segStart + "-" + segEnd);
                    continue;
                }

                String originalPart = text.substring(segStart, segEnd);

                WidthMeasurement originalMeasurement =
                        measureTextWidth(segment.getFont(), originalPart, segment.getFontSize());
                if (!originalMeasurement.valid()) {
                    warnings.add(
                            "Cannot measure: "
                                    + originalPart.substring(
                                            0, Math.min(10, originalPart.length())));
                    continue;
                }

                String placeholderPart = createSafePlaceholder(originalPart, segment);
                WidthMeasurement placeholderMeasurement =
                        measureTextWidth(segment.getFont(), placeholderPart, segment.getFontSize());

                totalOriginalWidth += originalMeasurement.width();
                totalPlaceholderWidth +=
                        placeholderMeasurement.valid()
                                ? placeholderMeasurement.width()
                                : originalMeasurement.width();
                processedMatches++;

            } catch (Exception e) {
                warnings.add("Error: " + e.getMessage());
            }
        }

        return new WidthCalculationResult(
                totalOriginalWidth - totalPlaceholderWidth, processedMatches, warnings);
    }

    private String createSafePlaceholder(String originalText, TextSegment segment) {
        try {
            return createPlaceholderWithWidth(
                    originalText,
                    measureTextWidth(segment.getFont(), originalText, segment.getFontSize())
                            .width(),
                    segment.getFont(),
                    segment.getFontSize());
        } catch (Exception e) {
            return " ".repeat(Math.max(1, originalText.length()));
        }
    }

    private void modifyTokenForRedaction(
            List<Object> tokens,
            TextSegment segment,
            String newText,
            float adjustment,
            List<MatchRange> matches) {
        if (tokens == null || segment == null || newText == null) return;
        if (!isValidTokenIndex(tokens, segment.tokenIndex) || segment.operatorName == null) return;

        try {
            Object token = tokens.get(segment.tokenIndex);
            if (!isValidTokenForOperator(token, segment.operatorName)) return;

            TokenModificationResult result =
                    performTokenModification(
                            tokens,
                            token,
                            segment.operatorName,
                            newText,
                            adjustment,
                            segment,
                            matches);
            if (!result.isSuccess()) {
                performFallbackModification(tokens, segment.tokenIndex, newText);
            }
        } catch (Exception e) {
            try {
                performEmergencyFallback(tokens, segment.tokenIndex);
            } catch (Exception emergencyError) {
            }
        }
    }

    private String extractTextFromToken(Object token, String operatorName, PDFont currentFont) {
        if (token == null || operatorName == null) return "";

        try {
            return switch (operatorName) {
                case "Tj" -> handleTjOperator(token, currentFont);
                case "'", "\"" -> handleQuotedOperator(token, currentFont);
                case "TJ" -> handleTJOperator(token, currentFont);
                default -> "";
            };
        } catch (Exception e) {
            return "";
        }
    }

    private void processStringElement(
            COSString cosString,
            TextSegment segment,
            List<MatchRange> matches,
            COSArray newArray,
            int textOffsetInSegment)
            throws Exception {

        String originalText = getDecodedString(cosString, segment.getFont());

        if (!this.aggressiveMode
                && segment.getFont() != null
                && !TextEncodingHelper.isTextSegmentRemovable(segment.getFont(), originalText)) {
            newArray.add(cosString);
            return;
        }

        StringBuilder newText = new StringBuilder(originalText);
        boolean modified = false;

        List<MatchRange> sortedMatches =
                matches.stream().sorted(Comparator.comparingInt(MatchRange::getStartPos)).toList();

        int cumulativeOffset = 0;

        for (MatchRange match : sortedMatches) {
            int stringStartInPage = segment.getStartPos() + textOffsetInSegment;
            int stringEndInPage = stringStartInPage + originalText.length();
            int overlapStart = Math.max(match.getStartPos(), stringStartInPage);
            int overlapEnd = Math.min(match.getEndPos(), stringEndInPage);

            if (overlapStart < overlapEnd) {
                int redactionStartInString =
                        Math.max(0, overlapStart - stringStartInPage - cumulativeOffset);
                int redactionEndInString =
                        Math.min(
                                newText.length(),
                                overlapEnd - stringStartInPage - cumulativeOffset);

                if (redactionEndInString <= newText.length()
                        && redactionStartInString < redactionEndInString) {

                    String originalPart =
                            originalText.substring(
                                    overlapStart - stringStartInPage,
                                    overlapEnd - stringStartInPage);

                    if (!this.aggressiveMode
                            && segment.getFont() != null
                            && !TextEncodingHelper.isTextSegmentRemovable(
                                    segment.getFont(), originalPart)) {
                        continue;
                    }

                    modified = true;
                    String replacement = "";

                    if (!this.aggressiveMode) {
                        replacement = createSafeReplacement(originalPart, segment);
                    }

                    newText.replace(redactionStartInString, redactionEndInString, replacement);
                    cumulativeOffset +=
                            (redactionEndInString - redactionStartInString) - replacement.length();
                }
            }
        }

        String modifiedString = newText.toString();
        COSString newCosString = createCompatibleCOSString(modifiedString, cosString);
        newArray.add(newCosString);

        if (modified && !this.aggressiveMode) {
            addSpacingAdjustment(newArray, segment, originalText, modifiedString);
        }
    }

    private String extractStringWithFallbacks(COSString cosString, PDFont font) {
        if (cosString == null) return "";

        try {
            String text = cosString.getString();
            if (!text.trim().isEmpty() && !isGibberish(text)) return text;

            if (font != null) {
                String fontBasedText = tryFontBasedExtraction(cosString, font);
                if (fontBasedText != null && !isGibberish(fontBasedText)) return fontBasedText;
            }

            String encodingFallback = tryEncodingFallbacks(cosString);
            if (encodingFallback != null && !isGibberish(encodingFallback)) return encodingFallback;

            return sanitizeText(text);
        } catch (Exception e) {
            return "\uFFFD";
        }
    }

    private void wipeAllTextInXObjects(PDDocument document, PDResources resources) {
        try {
            for (COSName xobjName : resources.getXObjectNames()) {
                try {
                    PDXObject xobj = resources.getXObject(xobjName);
                    if (xobj instanceof PDFormXObject form) {
                        wipeAllTextInFormXObject(document, form);
                    }
                } catch (Exception ignored) {
                }
            }
        } catch (Exception ignored) {
        }
    }

    private List<TextSegment> extractTextSegmentsFromXObject(
            PDResources resources, List<Object> tokens) {
        return extractTextSegmentsFromTokens(resources, tokens, false);
    }

    private int wipeAllTextInResources(PDDocument document, PDResources resources) {
        int totalMods = 0;
        try {
            totalMods += wipeAllSemanticTextInProperties(resources);
            for (COSName xobjName : resources.getXObjectNames()) {
                try {
                    PDXObject xobj = resources.getXObject(xobjName);
                    if (xobj instanceof PDFormXObject form) {
                        totalMods += wipeAllTextInFormXObject(document, form);
                    }
                } catch (Exception ignored) {
                }
            }
        } catch (Exception ignored) {
        }
        return totalMods;
    }

    private record WidthMeasurement(float width, boolean valid) {

        public static WidthMeasurement invalid() {
            return new WidthMeasurement(0f, false);
        }
    }

    private int wipeAllTextInFormXObject(PDDocument document, PDFormXObject formXObject)
            throws IOException {
        int modifications = 0;
        try {
            PDResources res = formXObject.getResources();
            if (res != null) {
                modifications += wipeAllTextInResources(document, res);
            }
            PDFStreamParser parser = new PDFStreamParser(formXObject);
            List<Object> tokens = new ArrayList<>();
            Object token;
            while ((token = parser.parseNextToken()) != null) {
                tokens.add(token);
            }
            WipeResult wrText = wipeAllTextShowingOperators(tokens);
            modifications += wrText.modifications;
            WipeResult wrSem = wipeAllSemanticTextInTokens(wrText.tokens);
            modifications += wrSem.modifications;
            if (wrText.modifications > 0 || wrSem.modifications > 0) {
                writeRedactedContentToXObject(document, formXObject, wrSem.tokens);
            }
        } catch (Exception ignored) {
        }
        return modifications;
    }

    private void wipeAllTextInPatterns(PDDocument document, PDResources resources) {
        try {
            for (COSName patName : resources.getPatternNames()) {
                try {
                    var pattern = resources.getPattern(patName);
                    if (pattern
                            instanceof
                            org.apache.pdfbox.pdmodel.graphics.pattern.PDTilingPattern tiling) {
                        PDResources patRes = tiling.getResources();
                        if (patRes != null) {
                            wipeAllTextInResources(document, patRes);
                        }
                        PDFStreamParser parser = new PDFStreamParser(tiling);
                        List<Object> tokens = new ArrayList<>();
                        Object token;
                        while ((token = parser.parseNextToken()) != null) {
                            tokens.add(token);
                        }
                        WipeResult wrText = wipeAllTextShowingOperators(tokens);
                        WipeResult wrSem = wipeAllSemanticTextInTokens(wrText.tokens);
                        if (wrText.modifications > 0 || wrSem.modifications > 0) {
                            writeRedactedContentToPattern(tiling, wrSem.tokens);
                        }
                    }
                } catch (Exception ignored) {
                }
            }
        } catch (Exception ignored) {
        }
    }

    private record WidthCalculationResult(
            float adjustment, int processedMatches, List<String> warnings) {
        private WidthCalculationResult(
                float adjustment, int processedMatches, List<String> warnings) {
            this.adjustment = adjustment;
            this.processedMatches = processedMatches;
            this.warnings = new ArrayList<>(warnings);
        }
    }

    private void processFormXObject(
            PDDocument document,
            PDFormXObject formXObject,
            Set<String> targetWords,
            boolean useRegex,
            boolean wholeWordSearch,
            boolean aggressive) {
        try {
            PDResources xobjResources = formXObject.getResources();
            if (xobjResources == null) {
                return;
            }
            for (COSName xobjName : xobjResources.getXObjectNames()) {
                PDXObject nestedXObj = xobjResources.getXObject(xobjName);
                if (nestedXObj instanceof PDFormXObject nestedFormXObj) {
                    processFormXObject(
                            document,
                            nestedFormXObj,
                            targetWords,
                            useRegex,
                            wholeWordSearch,
                            aggressive);
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
                    aggressive
                            ? findAllMatchesAggressive(
                                    textSegments, tokens, targetWords, useRegex, wholeWordSearch)
                            : findAllMatches(completeText, targetWords, useRegex, wholeWordSearch);
            if (!matches.isEmpty()) {
                List<Object> redactedTokens =
                        applyRedactionsToTokens(tokens, textSegments, matches);
                writeRedactedContentToXObject(document, formXObject, redactedTokens);
            } else if (aggressive && !completeText.isEmpty()) {
                WipeResult wr = wipeAllTextShowingOperators(tokens);
                writeRedactedContentToXObject(document, formXObject, wr.tokens);
            }
        } catch (Exception ignored) {
        }
    }

    private static class TokenModificationResult {
        @Getter private final boolean success;

        private TokenModificationResult(boolean success, String errorMessage) {
            this.success = success;
        }

        public static TokenModificationResult success() {
            return new TokenModificationResult(true, null);
        }

        public static TokenModificationResult failure(String errorMessage) {
            return new TokenModificationResult(false, errorMessage);
        }
    }

    @Data
    @AllArgsConstructor
    private static class AggressiveSegMatch {
        private int segmentIndex;
        private int decodedStart;
        private int decodedEnd;
    }

    @Data
    @AllArgsConstructor
    private static class GraphicsState {
        private PDFont font = null;
        private float fontSize = 0;

        public GraphicsState() {}
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

    @Data
    private static class NormalizedMap {
        String norm;
        int[] map;
    }

    @Data
    public static class DecodedMapping {
        public String text;
        public int[] charByteStart;
        public int[] charByteEnd;
    }

    @Data
    @AllArgsConstructor
    private static class ModificationTask {
        private TextSegment segment;
        private String newText;
        private float adjustment;
    }

    @Data
    private static class WipeResult {
        List<Object> tokens;
        int modifications;
    }
}
