package stirling.software.SPDF.service;

import java.awt.geom.AffineTransform;
import java.awt.geom.Point2D;
import java.awt.image.BufferedImage;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import javax.imageio.ImageIO;

import org.apache.pdfbox.contentstream.PDFGraphicsStreamEngine;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.contentstream.operator.OperatorName;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSBoolean;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNull;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdfwriter.ContentStreamWriter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.font.PDFontFactory;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.pdmodel.graphics.color.PDColorSpace;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.PDGraphicsState;
import org.apache.pdfbox.pdmodel.graphics.state.PDTextState;
import org.apache.pdfbox.pdmodel.graphics.state.RenderingMode;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.apache.pdfbox.util.DateConverter;
import org.apache.pdfbox.util.Matrix;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.json.PdfJsonAnnotation;
import stirling.software.SPDF.model.json.PdfJsonCosValue;
import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonFontCidSystemInfo;
import stirling.software.SPDF.model.json.PdfJsonFormField;
import stirling.software.SPDF.model.json.PdfJsonImageElement;
import stirling.software.SPDF.model.json.PdfJsonMetadata;
import stirling.software.SPDF.model.json.PdfJsonPage;
import stirling.software.SPDF.model.json.PdfJsonStream;
import stirling.software.SPDF.model.json.PdfJsonTextColor;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@Slf4j
@Service
@RequiredArgsConstructor
public class PdfJsonConversionService {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;
    private final ResourceLoader resourceLoader;
    private final EndpointConfiguration endpointConfiguration;
    private final TempFileManager tempFileManager;

    private static final String FALLBACK_FONT_ID = "fallback-noto-sans";
    private static final String DEFAULT_FALLBACK_FONT_LOCATION =
            "classpath:/static/fonts/NotoSans-Regular.ttf";
    private static final String FALLBACK_FONT_CJK_ID = "fallback-noto-cjk";
    private static final String FALLBACK_FONT_JP_ID = "fallback-noto-jp";
    private static final String FALLBACK_FONT_KR_ID = "fallback-noto-korean";
    private static final String FALLBACK_FONT_AR_ID = "fallback-noto-arabic";
    private static final String FALLBACK_FONT_TH_ID = "fallback-noto-thai";

    private static final Map<String, FallbackFontSpec> BUILT_IN_FALLBACK_FONTS =
            Map.ofEntries(
                    Map.entry(
                            FALLBACK_FONT_CJK_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSansSC-Regular.ttf",
                                    "NotoSansSC-Regular",
                                    "ttf")),
                    Map.entry(
                            FALLBACK_FONT_JP_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSansJP-Regular.ttf",
                                    "NotoSansJP-Regular",
                                    "ttf")),
                    Map.entry(
                            FALLBACK_FONT_KR_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/malgun.ttf", "MalgunGothic", "ttf")),
                    Map.entry(
                            FALLBACK_FONT_AR_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSansArabic-Regular.ttf",
                                    "NotoSansArabic-Regular",
                                    "ttf")),
                    Map.entry(
                            FALLBACK_FONT_TH_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSansThai-Regular.ttf",
                                    "NotoSansThai-Regular",
                                    "ttf")));

    @Value("${stirling.pdf.fallback-font:" + DEFAULT_FALLBACK_FONT_LOCATION + "}")
    private String fallbackFontLocation;

    @Value("${stirling.pdf.json.font-normalization.enabled:true}")
    private boolean fontNormalizationEnabled;

    @Value("${stirling.pdf.json.cff-converter.enabled:true}")
    private boolean cffConversionEnabled;

    @Value("${stirling.pdf.json.cff-converter.method:python}")
    private String cffConverterMethod;

    @Value("${stirling.pdf.json.cff-converter.python-command:/opt/venv/bin/python3}")
    private String pythonCommand;

    @Value("${stirling.pdf.json.cff-converter.python-script:/scripts/convert_cff_to_ttf.py}")
    private String pythonScript;

    @Value("${stirling.pdf.json.cff-converter.fontforge-command:fontforge}")
    private String fontforgeCommand;

    private final Map<String, byte[]> fallbackFontCache = new ConcurrentHashMap<>();

    private volatile boolean ghostscriptAvailable;

    @PostConstruct
    private void initializeGhostscriptAvailability() {
        if (!fontNormalizationEnabled) {
            ghostscriptAvailable = false;
            return;
        }

        if (!isGhostscriptGroupEnabled()) {
            ghostscriptAvailable = false;
            log.warn(
                    "Ghostscript font normalization disabled: Ghostscript group is not enabled in configuration");
            return;
        }

        List<String> command = List.of("gs", "-version");
        try {
            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                            .runCommandWithOutputHandling(command);
            ghostscriptAvailable = result.getRc() == 0;
            if (!ghostscriptAvailable) {
                log.warn(
                        "Ghostscript executable not available (exit code {}); font normalization will be skipped",
                        result.getRc());
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            ghostscriptAvailable = false;
            log.warn(
                    "Ghostscript availability check interrupted; font normalization will be skipped: {}",
                    ex.getMessage());
        } catch (IOException ex) {
            ghostscriptAvailable = false;
            log.warn(
                    "Ghostscript executable not found or failed to start; font normalization will be skipped: {}",
                    ex.getMessage());
        }
    }

    public byte[] convertPdfToJson(MultipartFile file) throws IOException {
        if (file == null) {
            throw ExceptionUtils.createNullArgumentException("fileInput");
        }

        TempFile normalizedFile = null;
        try (TempFile originalFile = new TempFile(tempFileManager, ".pdf")) {
            file.transferTo(originalFile.getFile());
            Path workingPath = originalFile.getPath();

            if (fontNormalizationEnabled && canRunGhostscript()) {
                try {
                    normalizedFile = normalizePdfFonts(workingPath);
                    if (normalizedFile != null && normalizedFile.exists()) {
                        workingPath = normalizedFile.getPath();
                        log.info("Using Ghostscript-normalized PDF for JSON export");
                    }
                } catch (IOException ex) {
                    log.warn(
                            "Ghostscript font normalization failed ({}); using original PDF",
                            ex.getMessage());
                    closeQuietly(normalizedFile);
                    normalizedFile = null;
                }
            }

            try (PDDocument document = pdfDocumentFactory.load(workingPath, true)) {
                int totalPages = document.getNumberOfPages();
                log.info("Converting PDF to JSON ({} pages)", totalPages);
                Map<String, PdfJsonFont> fonts = new LinkedHashMap<>();
                Map<Integer, List<PdfJsonTextElement>> textByPage = new LinkedHashMap<>();

                Map<Integer, Map<PDFont, String>> pageFontResources = new HashMap<>();
                int pageNumber = 1;
                for (PDPage page : document.getPages()) {
                    Map<PDFont, String> resourceMap =
                            collectFontsForPage(document, page, pageNumber, fonts);
                    pageFontResources.put(pageNumber, resourceMap);
                    log.debug(
                            "PDF→JSON: collected {} font resources on page {}",
                            resourceMap.size(),
                            pageNumber);
                    pageNumber++;
                }

                TextCollectingStripper stripper =
                        new TextCollectingStripper(document, fonts, textByPage, pageFontResources);
                stripper.setSortByPosition(true);
                stripper.getText(document);

                Map<Integer, List<PdfJsonImageElement>> imagesByPage = collectImages(document);
                Map<Integer, List<PdfJsonAnnotation>> annotationsByPage =
                        collectAnnotations(document);

                PdfJsonDocument pdfJson = new PdfJsonDocument();
                pdfJson.setMetadata(extractMetadata(document));
                pdfJson.setXmpMetadata(extractXmpMetadata(document));
                List<PdfJsonFont> serializedFonts = new ArrayList<>(fonts.values());
                serializedFonts.sort(
                        Comparator.comparing(
                                PdfJsonFont::getUid,
                                Comparator.nullsLast(Comparator.naturalOrder())));
                pdfJson.setFonts(serializedFonts);
                pdfJson.setPages(
                        extractPages(document, textByPage, imagesByPage, annotationsByPage));
                pdfJson.setFormFields(collectFormFields(document));

                log.info(
                        "PDF→JSON conversion complete (fonts: {}, pages: {})",
                        serializedFonts.size(),
                        pdfJson.getPages().size());

                return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(pdfJson);
            }
        } finally {
            closeQuietly(normalizedFile);
        }
    }

    public byte[] convertJsonToPdf(MultipartFile file) throws IOException {
        if (file == null) {
            throw ExceptionUtils.createNullArgumentException("fileInput");
        }
        byte[] jsonBytes = file.getBytes();
        PdfJsonDocument pdfJson = objectMapper.readValue(jsonBytes, PdfJsonDocument.class);

        List<PdfJsonFont> fontModels = pdfJson.getFonts();
        if (fontModels == null) {
            fontModels = new ArrayList<>();
            pdfJson.setFonts(fontModels);
        }

        try (PDDocument document = new PDDocument()) {
            applyMetadata(document, pdfJson.getMetadata());
            applyXmpMetadata(document, pdfJson.getXmpMetadata());

            Map<String, PDFont> fontMap = buildFontMap(document, fontModels);
            log.info("Converting JSON to PDF ({} font resources)", fontMap.size());

            List<PdfJsonPage> pages = pdfJson.getPages();
            if (pages == null) {
                pages = new ArrayList<>();
            }

            int pageIndex = 0;
            for (PdfJsonPage pageModel : pages) {
                int pageNumberValue =
                        pageModel.getPageNumber() != null
                                ? pageModel.getPageNumber()
                                : pageIndex + 1;
                log.info("Reconstructing page {}", pageNumberValue);
                PDRectangle pageSize =
                        new PDRectangle(
                                safeFloat(pageModel.getWidth(), 612f),
                                safeFloat(pageModel.getHeight(), 792f));
                PDPage page = new PDPage(pageSize);
                if (pageModel.getRotation() != null) {
                    page.setRotation(pageModel.getRotation());
                }
                document.addPage(page);

                applyPageResources(document, page, pageModel.getResources());

                List<PDStream> preservedStreams =
                        buildContentStreams(document, pageModel.getContentStreams());
                if (!preservedStreams.isEmpty()) {
                    page.setContents(preservedStreams);
                }

                List<PdfJsonImageElement> imageElements =
                        pageModel.getImageElements() != null
                                ? pageModel.getImageElements()
                                : new ArrayList<>();

                // Reconstruct image XObjects if content streams are preserved
                // (images were filtered out during serialization to avoid duplication)
                if (!preservedStreams.isEmpty() && !imageElements.isEmpty()) {
                    reconstructImageXObjects(document, page, preservedStreams, imageElements);
                }

                List<PdfJsonTextElement> elements =
                        pageModel.getTextElements() != null
                                ? pageModel.getTextElements()
                                : new ArrayList<>();

                PreflightResult preflightResult =
                        preflightTextElements(
                                document, fontMap, fontModels, elements, pageNumberValue);

                log.info(
                        "Page {} preflight complete (elements={}, fallbackApplied={})",
                        pageNumberValue,
                        elements.size(),
                        preflightResult.usesFallback());

                if (!preflightResult.fallbackFontIds().isEmpty()) {
                    ensureFallbackResources(page, preflightResult.fallbackFontIds(), fontMap);
                    log.info(
                            "Page {} registered fallback fonts: {}",
                            pageNumberValue,
                            preflightResult.fallbackFontIds());
                }

                boolean hasText = !elements.isEmpty();
                boolean hasImages = !imageElements.isEmpty();
                boolean rewriteSucceeded = true;

                if (hasText) {
                    if (preflightResult.usesFallback()) {
                        rewriteSucceeded = false;
                    } else if (!preservedStreams.isEmpty()) {
                        log.info("Attempting token rewrite for page {}", pageNumberValue);
                        rewriteSucceeded = rewriteTextOperators(document, page, elements);
                        if (!rewriteSucceeded) {
                            log.info(
                                    "Token rewrite failed for page {}, regenerating text stream",
                                    pageNumberValue);
                        } else {
                            log.info("Token rewrite succeeded for page {}", pageNumberValue);
                        }
                    } else {
                        rewriteSucceeded = false;
                    }
                }

                boolean shouldRegenerate = preservedStreams.isEmpty();
                if (hasText && !rewriteSucceeded) {
                    shouldRegenerate = true;
                }
                if (hasImages && preservedStreams.isEmpty()) {
                    shouldRegenerate = true;
                }

                if (!(hasText || hasImages)) {
                    pageIndex++;
                    continue;
                }

                if (shouldRegenerate) {
                    log.info("Regenerating page content for page {}", pageNumberValue);
                    regeneratePageContent(
                            document,
                            page,
                            elements,
                            imageElements,
                            fontMap,
                            fontModels,
                            pageNumberValue);
                    log.info("Page content regeneration complete for page {}", pageNumberValue);
                }

                // Restore annotations for this page
                List<PdfJsonAnnotation> annotations =
                        pageModel.getAnnotations() != null
                                ? pageModel.getAnnotations()
                                : new ArrayList<>();
                restoreAnnotations(document, page, annotations);

                pageIndex++;
            }

            // Restore form fields
            List<PdfJsonFormField> formFields =
                    pdfJson.getFormFields() != null ? pdfJson.getFormFields() : new ArrayList<>();
            restoreFormFields(document, formFields);

            try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                document.save(baos);
                return baos.toByteArray();
            }
        }
    }

    private Map<PDFont, String> collectFontsForPage(
            PDDocument document, PDPage page, int pageNumber, Map<String, PdfJsonFont> fonts)
            throws IOException {
        PDResources resources = page.getResources();
        if (resources == null) {
            return Collections.emptyMap();
        }

        Map<PDFont, String> mapping = new HashMap<>();
        for (COSName resourceName : resources.getFontNames()) {
            PDFont font = resources.getFont(resourceName);
            if (font == null) {
                continue;
            }
            String fontId = resourceName.getName();
            mapping.put(font, fontId);

            String key = buildFontKey(pageNumber, fontId);
            if (!fonts.containsKey(key)) {
                fonts.put(key, buildFontModel(document, font, fontId, pageNumber));
            }
        }
        return mapping;
    }

    private String buildFontKey(int pageNumber, String fontId) {
        return pageNumber + ":" + fontId;
    }

    private String buildFontKey(Integer pageNumber, String fontId) {
        int page = pageNumber != null ? pageNumber : -1;
        return buildFontKey(page, fontId);
    }

    private PdfJsonFont buildFontModel(
            PDDocument document, PDFont font, String fontId, int pageNumber) throws IOException {
        PDFontDescriptor descriptor = font.getFontDescriptor();
        String subtype = font.getCOSObject().getNameAsString(COSName.SUBTYPE);
        String encoding = resolveEncoding(font);
        PdfJsonFontCidSystemInfo cidInfo = extractCidSystemInfo(font.getCOSObject());
        boolean embedded = font.isEmbedded();
        String toUnicode = extractToUnicode(font.getCOSObject());
        // Build complete CharCode→CID→GID→Unicode mapping for CID fonts
        String unicodeMapping = buildUnicodeMapping(font, toUnicode);
        FontProgramData programData = embedded ? extractFontProgram(font, unicodeMapping) : null;
        String standard14Name = resolveStandard14Name(font);
        Integer flags = descriptor != null ? descriptor.getFlags() : null;
        PdfJsonCosValue cosDictionary = serializeCosValue(font.getCOSObject());

        log.debug(
                "Building font model: id={}, baseName={}, subtype={}, embedded={}, hasProgram={}, hasWebProgram={}",
                fontId,
                font.getName(),
                subtype,
                embedded,
                programData != null && programData.getBase64() != null,
                programData != null && programData.getWebBase64() != null);

        return PdfJsonFont.builder()
                .id(fontId)
                .pageNumber(pageNumber)
                .uid(buildFontKey(pageNumber, fontId))
                .baseName(font.getName())
                .subtype(subtype)
                .encoding(encoding)
                .cidSystemInfo(cidInfo)
                .embedded(embedded)
                .program(programData != null ? programData.getBase64() : null)
                .programFormat(programData != null ? programData.getFormat() : null)
                .webProgram(programData != null ? programData.getWebBase64() : null)
                .webProgramFormat(programData != null ? programData.getWebFormat() : null)
                .toUnicode(toUnicode)
                .standard14Name(standard14Name)
                .fontDescriptorFlags(flags)
                .ascent(descriptor != null ? descriptor.getAscent() : null)
                .descent(descriptor != null ? descriptor.getDescent() : null)
                .capHeight(descriptor != null ? descriptor.getCapHeight() : null)
                .xHeight(descriptor != null ? descriptor.getXHeight() : null)
                .italicAngle(descriptor != null ? descriptor.getItalicAngle() : null)
                .unitsPerEm(extractUnitsPerEm(font))
                .cosDictionary(cosDictionary)
                .build();
    }

    private PreflightResult preflightTextElements(
            PDDocument document,
            Map<String, PDFont> fontMap,
            List<PdfJsonFont> fontModels,
            List<PdfJsonTextElement> elements,
            int pageNumber)
            throws IOException {
        if (elements == null || elements.isEmpty()) {
            return PreflightResult.empty();
        }

        Set<String> fallbackIds = new LinkedHashSet<>();
        boolean fallbackNeeded = false;

        for (PdfJsonTextElement element : elements) {
            String text = Objects.toString(element.getText(), "");
            if (text.isEmpty()) {
                continue;
            }

            PDFont font = fontMap.get(buildFontKey(pageNumber, element.getFontId()));
            if (font == null && element.getFontId() != null) {
                font = fontMap.get(buildFontKey(-1, element.getFontId()));
            }

            if (font == null) {
                fallbackNeeded = true;
                fallbackIds.add(FALLBACK_FONT_ID);
                element.setFallbackUsed(Boolean.TRUE);
                continue;
            }

            if (!canEncodeFully(font, text)) {
                fallbackNeeded = true;
                element.setFallbackUsed(Boolean.TRUE);
                for (int offset = 0; offset < text.length(); ) {
                    int codePoint = text.codePointAt(offset);
                    offset += Character.charCount(codePoint);
                    if (!canEncode(font, codePoint)) {
                        String fallbackId = resolveFallbackFontId(codePoint);
                        fallbackIds.add(fallbackId != null ? fallbackId : FALLBACK_FONT_ID);
                    }
                }
            }
        }

        for (String fallbackId : fallbackIds) {
            ensureFallbackFont(document, fontMap, fontModels, fallbackId);
        }

        if (fallbackNeeded && fallbackIds.isEmpty()) {
            fallbackIds.add(FALLBACK_FONT_ID);
            ensureFallbackFont(document, fontMap, fontModels, FALLBACK_FONT_ID);
        }

        return new PreflightResult(fallbackNeeded, fallbackIds);
    }

    private PdfJsonFont buildFallbackFontModel() throws IOException {
        return buildFallbackFontModel(FALLBACK_FONT_ID);
    }

    private PdfJsonFont buildFallbackFontModel(String fallbackId) throws IOException {
        FallbackFontSpec spec = getFallbackFontSpec(fallbackId);
        if (spec == null) {
            throw new IOException("Unknown fallback font id " + fallbackId);
        }
        byte[] bytes = loadFallbackFontBytes(fallbackId, spec);
        String base64 = Base64.getEncoder().encodeToString(bytes);
        return PdfJsonFont.builder()
                .id(fallbackId)
                .uid(fallbackId)
                .baseName(spec.baseName())
                .subtype("TrueType")
                .embedded(true)
                .program(base64)
                .programFormat(spec.format())
                .build();
    }

    private FallbackFontSpec getFallbackFontSpec(String fallbackId) {
        if (FALLBACK_FONT_ID.equals(fallbackId)) {
            String baseName = inferBaseName(fallbackFontLocation, "NotoSans-Regular");
            String format = inferFormat(fallbackFontLocation, "ttf");
            return new FallbackFontSpec(fallbackFontLocation, baseName, format);
        }
        return BUILT_IN_FALLBACK_FONTS.get(fallbackId);
    }

    private String inferBaseName(String location, String defaultName) {
        if (location == null || location.isBlank()) {
            return defaultName;
        }
        int slash = location.lastIndexOf('/');
        String fileName = slash >= 0 ? location.substring(slash + 1) : location;
        int dot = fileName.lastIndexOf('.');
        if (dot > 0) {
            fileName = fileName.substring(0, dot);
        }
        return fileName.isEmpty() ? defaultName : fileName;
    }

    private String inferFormat(String location, String defaultFormat) {
        if (location == null || location.isBlank()) {
            return defaultFormat;
        }
        int dot = location.lastIndexOf('.');
        if (dot >= 0 && dot < location.length() - 1) {
            return location.substring(dot + 1).toLowerCase(Locale.ROOT);
        }
        return defaultFormat;
    }

    private void ensureFallbackResources(
            PDPage page, Set<String> fallbackFontIds, Map<String, PDFont> fontMap) {
        if (fallbackFontIds == null || fallbackFontIds.isEmpty()) {
            return;
        }
        PDResources resources = page.getResources();
        if (resources == null) {
            resources = new PDResources();
            page.setResources(resources);
        }
        for (String fallbackId : fallbackFontIds) {
            if (fallbackId == null) {
                continue;
            }
            PDFont fallbackFont = fontMap.get(buildFontKey(-1, fallbackId));
            if (fallbackFont == null) {
                continue;
            }
            COSName fallbackName = COSName.getPDFName(fallbackId);
            boolean exists = false;
            for (COSName name : resources.getFontNames()) {
                if (fallbackName.equals(name)) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                resources.put(fallbackName, fallbackFont);
            }
        }
    }

    private PDFont loadFallbackPdfFont(PDDocument document) throws IOException {
        return loadFallbackPdfFont(document, FALLBACK_FONT_ID);
    }

    private PDFont loadFallbackPdfFont(PDDocument document, String fallbackId) throws IOException {
        FallbackFontSpec spec = getFallbackFontSpec(fallbackId);
        if (spec == null) {
            throw new IOException("Unknown fallback font id " + fallbackId);
        }
        byte[] bytes = loadFallbackFontBytes(fallbackId, spec);
        try (InputStream stream = new ByteArrayInputStream(bytes)) {
            return PDType0Font.load(document, stream, true);
        }
    }

    private PDFont ensureFallbackFont(
            PDDocument document,
            Map<String, PDFont> fontMap,
            List<PdfJsonFont> fontModels,
            String fallbackId)
            throws IOException {
        String effectiveId = fallbackId != null ? fallbackId : FALLBACK_FONT_ID;
        String key = buildFontKey(-1, effectiveId);
        PDFont font = fontMap.get(key);
        if (font != null) {
            return font;
        }
        PDFont loaded = loadFallbackPdfFont(document, effectiveId);
        fontMap.put(key, loaded);
        if (fontModels != null
                && fontModels.stream().noneMatch(f -> effectiveId.equals(f.getId()))) {
            fontModels.add(buildFallbackFontModel(effectiveId));
        }
        return loaded;
    }

    private byte[] loadFallbackFontBytes(String fallbackId, FallbackFontSpec spec)
            throws IOException {
        if (spec == null) {
            throw new IOException("No fallback font specification for " + fallbackId);
        }
        byte[] cached = fallbackFontCache.get(fallbackId);
        if (cached != null) {
            return cached;
        }
        Resource resource = resourceLoader.getResource(spec.resourceLocation());
        if (!resource.exists()) {
            throw new IOException("Fallback font resource not found at " + spec.resourceLocation());
        }
        try (InputStream inputStream = resource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            inputStream.transferTo(baos);
            byte[] bytes = baos.toByteArray();
            fallbackFontCache.put(fallbackId, bytes);
            return bytes;
        }
    }

    private boolean canRunGhostscript() {
        if (!fontNormalizationEnabled) {
            return false;
        }
        if (!isGhostscriptGroupEnabled()) {
            return false;
        }
        if (!ghostscriptAvailable) {
            log.debug("Skipping Ghostscript normalization; executable not available");
            return false;
        }
        return true;
    }

    private boolean isGhostscriptGroupEnabled() {
        try {
            return endpointConfiguration != null
                    && endpointConfiguration.isGroupEnabled("Ghostscript");
        } catch (Exception ex) {
            log.debug("Ghostscript group check failed: {}", ex.getMessage());
            return false;
        }
    }

    private TempFile normalizePdfFonts(Path sourcePath) throws IOException {
        if (sourcePath == null || !Files.exists(sourcePath)) {
            return null;
        }
        TempFile outputFile = new TempFile(tempFileManager, ".pdf");
        List<String> command = new ArrayList<>();
        command.add("gs");
        command.add("-sDEVICE=pdfwrite");
        command.add("-dCompatibilityLevel=1.7");
        command.add("-dPDFSETTINGS=/prepress");
        command.add("-dEmbedAllFonts=true");
        command.add("-dSubsetFonts=true");
        command.add("-dCompressFonts=true");
        command.add("-dNOPAUSE");
        command.add("-dBATCH");
        command.add("-dQUIET");
        command.add("-o");
        command.add(outputFile.getAbsolutePath());
        command.add("-c");
        command.add("<</NeverEmbed[]>> setdistillerparams");
        command.add("-f");
        command.add(sourcePath.toString());
        try {
            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                            .runCommandWithOutputHandling(command);
            if (result.getRc() == 0
                    && Files.exists(outputFile.getPath())
                    && Files.size(outputFile.getPath()) > 0) {
                return outputFile;
            }
            log.warn("Ghostscript normalization exited with code {}", result.getRc());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            closeQuietly(outputFile);
            throw new IOException("Ghostscript normalization interrupted", ex);
        } catch (IOException ex) {
            closeQuietly(outputFile);
            throw ex;
        }

        closeQuietly(outputFile);
        return null;
    }

    private byte[] convertCffProgramToTrueType(byte[] fontBytes, String toUnicode) {
        if (!cffConversionEnabled || fontBytes == null || fontBytes.length == 0) {
            return null;
        }

        // Determine which converter to use
        if ("python".equalsIgnoreCase(cffConverterMethod)) {
            return convertCffUsingPython(fontBytes, toUnicode);
        } else if ("fontforge".equalsIgnoreCase(cffConverterMethod)) {
            return convertCffUsingFontForge(fontBytes);
        } else {
            log.warn("Unknown CFF converter method: {}, falling back to Python", cffConverterMethod);
            return convertCffUsingPython(fontBytes, toUnicode);
        }
    }

    private byte[] convertCffUsingPython(byte[] fontBytes, String toUnicode) {
        if (pythonCommand == null
                || pythonCommand.isBlank()
                || pythonScript == null
                || pythonScript.isBlank()) {
            log.debug("Python converter not configured");
            return null;
        }

        try (TempFile inputFile = new TempFile(tempFileManager, ".cff");
                TempFile outputFile = new TempFile(tempFileManager, ".otf");
                TempFile toUnicodeFile = toUnicode != null ? new TempFile(tempFileManager, ".tounicode") : null) {
            Files.write(inputFile.getPath(), fontBytes);

            // Write ToUnicode CMap data if available
            if (toUnicode != null && toUnicodeFile != null) {
                byte[] toUnicodeBytes = Base64.getDecoder().decode(toUnicode);
                Files.write(toUnicodeFile.getPath(), toUnicodeBytes);
            }

            List<String> command = new ArrayList<>();
            command.add(pythonCommand);
            command.add(pythonScript);
            command.add(inputFile.getAbsolutePath());
            command.add(outputFile.getAbsolutePath());
            // Add optional ToUnicode file path
            if (toUnicodeFile != null) {
                command.add(toUnicodeFile.getAbsolutePath());
            }

            ProcessBuilder builder = new ProcessBuilder(command);
            builder.redirectErrorStream(true);
            Process process = builder.start();

            StringBuilder output = new StringBuilder();
            Thread reader =
                    new Thread(
                            () -> {
                                try (BufferedReader br =
                                        new BufferedReader(
                                                new InputStreamReader(
                                                        process.getInputStream(),
                                                        StandardCharsets.UTF_8))) {
                                    String line;
                                    while ((line = br.readLine()) != null) {
                                        output.append(line).append('\n');
                                    }
                                } catch (IOException ignored) {
                                }
                            });
            reader.start();

            // Wait with timeout (Python fontTools is usually fast, but provide safety margin)
            boolean finished = process.waitFor(30, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                reader.interrupt();
                log.warn(
                        "Python CFF→OTF wrapping timed out after 30 seconds - font may be corrupted");
                return null;
            }

            int exitCode = process.exitValue();
            reader.join(5000);

            if (exitCode == 0 && Files.exists(outputFile.getPath())) {
                byte[] convertedBytes = Files.readAllBytes(outputFile.getPath());
                if (convertedBytes.length > 0) {
                    String validationError = validateFontTables(convertedBytes);
                    if (validationError != null) {
                        log.warn("Python converter produced invalid font: {}", validationError);
                        return null;
                    }

                    // Log Python script output for debugging
                    String outputStr = output.toString().trim();
                    if (!outputStr.isEmpty()) {
                        log.debug("Python script output: {}", outputStr);
                    }

                    log.debug(
                            "Python CFF→OTF wrapping successful: {} bytes → {} bytes",
                            fontBytes.length,
                            convertedBytes.length);
                    return convertedBytes;
                }
            } else {
                String outputStr = output.toString().trim();
                if (!outputStr.isEmpty()) {
                    log.warn("Python CFF→OTF wrapping failed with exit code {}: {}", exitCode, outputStr);
                } else {
                    log.warn("Python CFF→OTF wrapping failed with exit code {}", exitCode);
                }
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.debug("Python CFF conversion interrupted", ex);
        } catch (IOException ex) {
            log.debug("Python CFF conversion I/O error", ex);
        }

        return null;
    }

    private byte[] convertCffUsingFontForge(byte[] fontBytes) {
        if (fontforgeCommand == null || fontforgeCommand.isBlank()) {
            log.debug("FontForge converter not configured");
            return null;
        }

        try (TempFile inputFile = new TempFile(tempFileManager, ".cff");
                TempFile outputFile = new TempFile(tempFileManager, ".ttf")) {
            Files.write(inputFile.getPath(), fontBytes);

            List<String> command = new ArrayList<>();
            command.add(fontforgeCommand);
            command.add("-lang=ff");
            command.add("-c");
            command.add(
                    "Open($1); "
                            + "ScaleToEm(1000); "  // Force 1000 units per em (standard for Type1)
                            + "SelectWorthOutputting(); "
                            + "SetFontOrder(2); "
                            + "Reencode(\"unicode\"); "
                            + "RoundToInt(); "
                            + "RemoveOverlap(); "
                            + "Simplify(); "
                            + "CorrectDirection(); "
                            + "Generate($2, \"\", 4+16+32); "
                            + "Close(); "
                            + "Quit()");
            command.add(inputFile.getAbsolutePath());
            command.add(outputFile.getAbsolutePath());

            ProcessBuilder builder = new ProcessBuilder(command);
            builder.redirectErrorStream(true);
            Process process = builder.start();

            StringBuilder output = new StringBuilder();
            Thread reader =
                    new Thread(
                            () -> {
                                try (BufferedReader br =
                                        new BufferedReader(
                                                new InputStreamReader(
                                                        process.getInputStream(),
                                                        StandardCharsets.UTF_8))) {
                                    String line;
                                    while ((line = br.readLine()) != null) {
                                        output.append(line).append('\n');
                                    }
                                } catch (IOException ignored) {
                                }
                            });
            reader.start();

            // Wait with timeout to prevent hanging on problematic fonts
            boolean finished = process.waitFor(30, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                reader.interrupt();
                log.warn("FontForge conversion timed out after 30 seconds - font may be too complex or causing FontForge to hang");
                return null;
            }

            int exitCode = process.exitValue();
            reader.join(5000); // Wait max 5 seconds for reader thread

            if (exitCode == 0 && Files.exists(outputFile.getPath())) {
                byte[] convertedBytes = Files.readAllBytes(outputFile.getPath());
                if (convertedBytes.length > 0) {
                    // Basic validation: check for TrueType magic number and critical tables
                    if (convertedBytes.length >= 4) {
                        int magic =
                                ((convertedBytes[0] & 0xFF) << 24)
                                        | ((convertedBytes[1] & 0xFF) << 16)
                                        | ((convertedBytes[2] & 0xFF) << 8)
                                        | (convertedBytes[3] & 0xFF);
                        boolean validTrueType =
                                magic == 0x00010000 || magic == 0x74727565; // 1.0 or 'true'
                        boolean validOpenType = magic == 0x4F54544F; // 'OTTO'

                        if (validTrueType || validOpenType) {
                            // Additional validation: check unitsPerEm in head table
                            String validationError = validateFontTables(convertedBytes);
                            if (validationError != null) {
                                log.warn(
                                        "FontForge produced invalid font: {}",
                                        validationError);
                                return null;
                            }

                            log.debug(
                                    "FontForge CFF→TrueType conversion successful: {} bytes, magic: 0x{}, type: {}",
                                    convertedBytes.length,
                                    Integer.toHexString(magic),
                                    validOpenType ? "OpenType" : "TrueType");
                            return convertedBytes;
                        } else {
                            log.warn(
                                    "FontForge produced invalid font: magic number 0x{} (expected TrueType or OpenType)",
                                    Integer.toHexString(magic));
                            return null;
                        }
                    }
                }
                log.warn("FontForge produced empty output file");
                return null;
            }

            log.warn(
                    "FontForge conversion exited with code {}: {}",
                    exitCode,
                    output.toString().trim());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.warn("FontForge conversion interrupted");
        } catch (IOException ex) {
            log.warn("FontForge conversion failed: {}", ex.getMessage());
        }

        return null;
    }

    /**
     * Validates critical OpenType/TrueType font tables to ensure browser compatibility.
     * @return Error message if invalid, null if valid
     */
    private String validateFontTables(byte[] fontBytes) {
        try {
            if (fontBytes.length < 12) {
                return "Font file too small";
            }

            // Read table directory
            int numTables = ((fontBytes[4] & 0xFF) << 8) | (fontBytes[5] & 0xFF);
            if (numTables == 0 || numTables > 100) {
                return "Invalid table count: " + numTables;
            }

            // Find head table
            int offset = 12; // Skip sfnt header
            for (int i = 0; i < numTables && offset + 16 <= fontBytes.length; i++) {
                String tag = new String(fontBytes, offset, 4, StandardCharsets.US_ASCII);
                int tableOffset = ((fontBytes[offset + 8] & 0xFF) << 24)
                        | ((fontBytes[offset + 9] & 0xFF) << 16)
                        | ((fontBytes[offset + 10] & 0xFF) << 8)
                        | (fontBytes[offset + 11] & 0xFF);
                int tableLength = ((fontBytes[offset + 12] & 0xFF) << 24)
                        | ((fontBytes[offset + 13] & 0xFF) << 16)
                        | ((fontBytes[offset + 14] & 0xFF) << 8)
                        | (fontBytes[offset + 15] & 0xFF);

                if ("head".equals(tag)) {
                    if (tableOffset + 18 > fontBytes.length) {
                        return "head table truncated";
                    }
                    // Check unitsPerEm at offset 18 in head table
                    int unitsPerEm = ((fontBytes[tableOffset + 18] & 0xFF) << 8)
                            | (fontBytes[tableOffset + 19] & 0xFF);
                    if (unitsPerEm < 16 || unitsPerEm > 16384) {
                        return "Invalid unitsPerEm: " + unitsPerEm + " (must be 16-16384)";
                    }
                    return null; // Valid
                }
                offset += 16;
            }
            return "head table not found";
        } catch (Exception ex) {
            return "Validation error: " + ex.getMessage();
        }
    }

    private String buildUnicodeMapping(PDFont font, String toUnicodeBase64) throws IOException {
        log.debug("buildUnicodeMapping called for font: {}, hasToUnicode: {}, isCID: {}",
            font.getName(), toUnicodeBase64 != null, font instanceof PDType0Font);

        if (toUnicodeBase64 == null || toUnicodeBase64.isBlank()) {
            log.debug("No ToUnicode data for font: {}", font.getName());
            return null;
        }

        // For CID fonts (Type0), build complete CharCode→CID→GID→Unicode mapping
        if (!(font instanceof PDType0Font type0Font)) {
            // For non-CID fonts, just return ToUnicode as-is
            log.debug("Non-CID font {}, returning raw ToUnicode", font.getName());
            return toUnicodeBase64;
        }

        log.debug("Building JSON mapping for CID font: {}", font.getName());

        try {
            // Build a map of CharCode → Unicode from ToUnicode
            Map<Integer, Integer> charCodeToUnicode = new HashMap<>();
            byte[] toUnicodeBytes = Base64.getDecoder().decode(toUnicodeBase64);
            String toUnicodeStr = new String(toUnicodeBytes, StandardCharsets.UTF_8);

            // Parse ToUnicode CMap for bfchar and bfrange
            java.util.regex.Pattern bfcharPattern = java.util.regex.Pattern.compile("<([0-9A-Fa-f]+)>\\s*<([0-9A-Fa-f]+)>");
            java.util.regex.Matcher matcher = bfcharPattern.matcher(toUnicodeStr);
            while (matcher.find()) {
                int charCode = Integer.parseInt(matcher.group(1), 16);
                int unicode = Integer.parseInt(matcher.group(2), 16);
                charCodeToUnicode.put(charCode, unicode);
            }

            // Build JSON mapping: CharCode → CID → GID → Unicode
            StringBuilder json = new StringBuilder();
            json.append("{\"isCID\":true,\"cidToGidIdentity\":true,\"entries\":[");

            boolean first = true;
            for (Map.Entry<Integer, Integer> entry : charCodeToUnicode.entrySet()) {
                int charCode = entry.getKey();
                int unicode = entry.getValue();

                try {
                    // Get CID from char code
                    int cid = type0Font.codeToCID(charCode);
                    // For Identity-H/V encoding, GID == CID
                    int gid = cid;

                    if (!first) {
                        json.append(",");
                    }
                    first = false;
                    json.append(String.format("{\"code\":%d,\"cid\":%d,\"gid\":%d,\"unicode\":%d}",
                        charCode, cid, gid, unicode));
                } catch (Exception e) {
                    // Skip entries that fail to map
                    log.debug("Failed to map charCode {} in font {}: {}", charCode, font.getName(), e.getMessage());
                }
            }

            json.append("]}");
            String jsonStr = json.toString();
            log.debug("Built Unicode mapping for CID font {} with {} entries",
                font.getName(), charCodeToUnicode.size());
            return Base64.getEncoder().encodeToString(jsonStr.getBytes(StandardCharsets.UTF_8));

        } catch (Exception e) {
            log.warn("Failed to build Unicode mapping for font {}: {}", font.getName(), e.getMessage());
            return toUnicodeBase64; // Fall back to raw ToUnicode
        }
    }

    private PdfJsonFontCidSystemInfo extractCidSystemInfo(COSDictionary fontDictionary) {
        if (fontDictionary == null) {
            return null;
        }
        COSBase base = fontDictionary.getDictionaryObject(COSName.CIDSYSTEMINFO);
        if (!(base instanceof COSDictionary cidDictionary)) {
            return null;
        }
        String registry = cidDictionary.getString(COSName.REGISTRY);
        String ordering = cidDictionary.getString(COSName.ORDERING);
        int supplementValue = cidDictionary.getInt(COSName.SUPPLEMENT, -1);
        if (registry == null && ordering == null && supplementValue < 0) {
            return null;
        }
        PdfJsonFontCidSystemInfo info = new PdfJsonFontCidSystemInfo();
        info.setRegistry(registry);
        info.setOrdering(ordering);
        if (supplementValue >= 0) {
            info.setSupplement(supplementValue);
        }
        return info;
    }

    private FontProgramData extractFontProgram(PDFont font, String toUnicode) throws IOException {
        PDFontDescriptor descriptor = font.getFontDescriptor();
        if (descriptor == null) {
            return null;
        }

        PDStream fontFile3 = descriptor.getFontFile3();
        if (fontFile3 != null) {
            String subtype = fontFile3.getCOSObject().getNameAsString(COSName.SUBTYPE);
            return readFontProgram(fontFile3, subtype != null ? subtype : "fontfile3", false, toUnicode);
        }

        PDStream fontFile2 = descriptor.getFontFile2();
        if (fontFile2 != null) {
            return readFontProgram(fontFile2, null, true, toUnicode);
        }

        PDStream fontFile = descriptor.getFontFile();
        if (fontFile != null) {
            return readFontProgram(fontFile, "type1", false, toUnicode);
        }

        return null;
    }

    private FontProgramData readFontProgram(
            PDStream stream, String formatHint, boolean detectTrueType, String toUnicode) throws IOException {
        try (InputStream inputStream = stream.createInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            inputStream.transferTo(baos);
            byte[] data = baos.toByteArray();
            String format = formatHint;
            if (detectTrueType) {
                format = detectTrueTypeFormat(data);
            }
            String webBase64 = null;
            String webFormat = null;
            if (format != null && isCffFormat(format)) {
                log.debug("Detected CFF font format: {}, wrapping as OpenType-CFF for web preview", format);
                byte[] converted = convertCffProgramToTrueType(data, toUnicode);
                if (converted != null && converted.length > 0) {
                    webBase64 = Base64.getEncoder().encodeToString(converted);
                    webFormat = "otf";
                    log.debug("CFF→OTF wrapping successful: {} bytes → {} bytes", data.length, converted.length);
                } else {
                    log.debug("CFF→OTF wrapping returned null or empty result");
                }
            }
            String base64 = Base64.getEncoder().encodeToString(data);
            return new FontProgramData(base64, format, webBase64, webFormat);
        }
    }

    private String detectTrueTypeFormat(byte[] data) {
        if (data == null || data.length < 4) {
            return "ttf";
        }
        String tag = new String(data, 0, 4, StandardCharsets.US_ASCII);
        if ("OTTO".equals(tag)) {
            return "otf";
        }
        if ("true".equals(tag) || "typ1".equals(tag)) {
            return "ttf";
        }
        int value =
                ((data[0] & 0xFF) << 24)
                        | ((data[1] & 0xFF) << 16)
                        | ((data[2] & 0xFF) << 8)
                        | (data[3] & 0xFF);
        if (value == 0x00010000) {
            return "ttf";
        }
        return "ttf";
    }

    private String extractToUnicode(COSDictionary fontDictionary) throws IOException {
        if (fontDictionary == null) {
            return null;
        }
        COSBase base = fontDictionary.getDictionaryObject(COSName.TO_UNICODE);
        if (!(base instanceof COSStream stream)) {
            return null;
        }
        try (InputStream inputStream = stream.createInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            inputStream.transferTo(baos);
            byte[] data = baos.toByteArray();
            if (data.length == 0) {
                return null;
            }
            return Base64.getEncoder().encodeToString(data);
        }
    }

    private String resolveEncoding(PDFont font) {
        if (font == null) {
            return null;
        }
        COSDictionary dictionary = font.getCOSObject();
        if (dictionary == null) {
            return null;
        }
        COSBase encoding = dictionary.getDictionaryObject(COSName.ENCODING);
        if (encoding instanceof COSName name) {
            return name.getName();
        }
        if (encoding instanceof COSDictionary encodingDictionary) {
            return encodingDictionary.getNameAsString(COSName.BASE_ENCODING);
        }
        return null;
    }

    private String resolveStandard14Name(PDFont font) {
        if (font == null) {
            return null;
        }
        try {
            Standard14Fonts.FontName mapped = Standard14Fonts.getMappedFontName(font.getName());
            return mapped != null ? mapped.getName() : null;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private List<PdfJsonPage> extractPages(
            PDDocument document,
            Map<Integer, List<PdfJsonTextElement>> textByPage,
            Map<Integer, List<PdfJsonImageElement>> imagesByPage,
            Map<Integer, List<PdfJsonAnnotation>> annotationsByPage)
            throws IOException {
        List<PdfJsonPage> pages = new ArrayList<>();
        int pageIndex = 0;
        for (PDPage page : document.getPages()) {
            PdfJsonPage pageModel = new PdfJsonPage();
            pageModel.setPageNumber(pageIndex + 1);
            PDRectangle mediaBox = page.getMediaBox();
            pageModel.setWidth(mediaBox.getWidth());
            pageModel.setHeight(mediaBox.getHeight());
            pageModel.setRotation(page.getRotation());
            pageModel.setTextElements(textByPage.getOrDefault(pageIndex + 1, new ArrayList<>()));
            pageModel.setImageElements(imagesByPage.getOrDefault(pageIndex + 1, new ArrayList<>()));
            pageModel.setAnnotations(
                    annotationsByPage.getOrDefault(pageIndex + 1, new ArrayList<>()));
            // Serialize resources but exclude image XObject streams to avoid duplication with
            // imageElements
            COSBase resourcesBase = page.getCOSObject().getDictionaryObject(COSName.RESOURCES);
            COSBase filteredResources = filterImageXObjectsFromResources(resourcesBase);
            pageModel.setResources(serializeCosValue(filteredResources));
            pageModel.setContentStreams(extractContentStreams(page));
            pages.add(pageModel);
            pageIndex++;
        }
        return pages;
    }

    private Map<Integer, List<PdfJsonImageElement>> collectImages(PDDocument document)
            throws IOException {
        Map<Integer, List<PdfJsonImageElement>> imagesByPage = new LinkedHashMap<>();
        int pageNumber = 1;
        for (PDPage page : document.getPages()) {
            ImageCollectingEngine engine =
                    new ImageCollectingEngine(page, pageNumber, imagesByPage);
            engine.processPage(page);
            pageNumber++;
        }
        return imagesByPage;
    }

    private Map<Integer, List<PdfJsonAnnotation>> collectAnnotations(PDDocument document)
            throws IOException {
        Map<Integer, List<PdfJsonAnnotation>> annotationsByPage = new LinkedHashMap<>();
        int pageNumber = 1;
        for (PDPage page : document.getPages()) {
            List<PdfJsonAnnotation> annotations = new ArrayList<>();
            for (PDAnnotation annotation : page.getAnnotations()) {
                try {
                    PdfJsonAnnotation ann = new PdfJsonAnnotation();
                    ann.setSubtype(annotation.getSubtype());
                    ann.setContents(annotation.getContents());

                    PDRectangle rect = annotation.getRectangle();
                    if (rect != null) {
                        ann.setRect(
                                List.of(
                                        rect.getLowerLeftX(),
                                        rect.getLowerLeftY(),
                                        rect.getUpperRightX(),
                                        rect.getUpperRightY()));
                    }

                    COSName appearanceState = annotation.getAppearanceState();
                    if (appearanceState != null) {
                        ann.setAppearanceState(appearanceState.getName());
                    }

                    if (annotation.getColor() != null) {
                        float[] colorComponents = annotation.getColor().getComponents();
                        List<Float> colorList = new ArrayList<>(colorComponents.length);
                        for (float c : colorComponents) {
                            colorList.add(c);
                        }
                        ann.setColor(colorList);
                    }

                    COSDictionary annotDict = annotation.getCOSObject();
                    COSString title = (COSString) annotDict.getDictionaryObject(COSName.T);
                    if (title != null) {
                        ann.setAuthor(title.getString());
                    }

                    COSString subj = (COSString) annotDict.getDictionaryObject(COSName.SUBJ);
                    if (subj != null) {
                        ann.setSubject(subj.getString());
                    }

                    COSString creationDateStr =
                            (COSString) annotDict.getDictionaryObject(COSName.CREATION_DATE);
                    if (creationDateStr != null) {
                        try {
                            Calendar creationDate =
                                    DateConverter.toCalendar(creationDateStr.getString());
                            ann.setCreationDate(formatCalendar(creationDate));
                        } catch (Exception e) {
                            log.debug(
                                    "Failed to parse annotation creation date: {}", e.getMessage());
                        }
                    }

                    COSString modDateStr = (COSString) annotDict.getDictionaryObject(COSName.M);
                    if (modDateStr != null) {
                        try {
                            Calendar modDate = DateConverter.toCalendar(modDateStr.getString());
                            ann.setModificationDate(formatCalendar(modDate));
                        } catch (Exception e) {
                            log.debug(
                                    "Failed to parse annotation modification date: {}",
                                    e.getMessage());
                        }
                    }

                    // Store raw dictionary for lossless round-trip
                    ann.setRawData(serializeCosValue(annotDict));

                    annotations.add(ann);
                } catch (Exception e) {
                    log.warn(
                            "Failed to extract annotation on page {}: {}",
                            pageNumber,
                            e.getMessage());
                }
            }
            if (!annotations.isEmpty()) {
                annotationsByPage.put(pageNumber, annotations);
            }
            pageNumber++;
        }
        return annotationsByPage;
    }

    private List<PdfJsonFormField> collectFormFields(PDDocument document) {
        List<PdfJsonFormField> formFields = new ArrayList<>();
        PDAcroForm acroForm = document.getDocumentCatalog().getAcroForm();
        if (acroForm == null) {
            return formFields;
        }

        try {
            for (PDField field : acroForm.getFields()) {
                try {
                    PdfJsonFormField formField = new PdfJsonFormField();
                    formField.setName(field.getFullyQualifiedName());
                    formField.setPartialName(field.getPartialName());
                    formField.setFieldType(field.getFieldType());
                    formField.setValue(field.getValueAsString());

                    // Get default value from COS dictionary
                    COSBase dv = field.getCOSObject().getDictionaryObject(COSName.DV);
                    if (dv != null) {
                        if (dv instanceof COSString) {
                            formField.setDefaultValue(((COSString) dv).getString());
                        } else if (dv instanceof COSName) {
                            formField.setDefaultValue(((COSName) dv).getName());
                        }
                    }

                    formField.setFlags(field.getFieldFlags());
                    formField.setAlternateFieldName(field.getAlternateFieldName());
                    formField.setMappingName(field.getMappingName());

                    // Find which page the field is on
                    PDAnnotationWidget widget =
                            field.getWidgets().isEmpty() ? null : field.getWidgets().get(0);
                    if (widget != null) {
                        PDPage fieldPage = widget.getPage();
                        if (fieldPage != null) {
                            int pageNum = document.getPages().indexOf(fieldPage) + 1;
                            formField.setPageNumber(pageNum);

                            PDRectangle rect = widget.getRectangle();
                            if (rect != null) {
                                formField.setRect(
                                        List.of(
                                                rect.getLowerLeftX(),
                                                rect.getLowerLeftY(),
                                                rect.getUpperRightX(),
                                                rect.getUpperRightY()));
                            }
                        }
                    }

                    // Store raw dictionary for lossless round-trip
                    formField.setRawData(serializeCosValue(field.getCOSObject()));

                    formFields.add(formField);
                } catch (Exception e) {
                    log.warn(
                            "Failed to extract form field {}: {}",
                            field.getFullyQualifiedName(),
                            e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("Failed to extract form fields: {}", e.getMessage());
        }

        return formFields;
    }

    /**
     * Filters out image XObject streams from resources to avoid duplication with imageElements.
     * Images are already captured in imageElements[] with their base64 data, so we don't need them
     * in the resources dictionary.
     */
    private COSBase filterImageXObjectsFromResources(COSBase resourcesBase) {
        if (!(resourcesBase instanceof COSDictionary)) {
            return resourcesBase;
        }

        // Clone the resources dictionary
        COSDictionary resources = new COSDictionary((COSDictionary) resourcesBase);

        // Get the XObject dictionary
        COSBase xobjectBase = resources.getDictionaryObject(COSName.XOBJECT);
        if (!(xobjectBase instanceof COSDictionary)) {
            return resources;
        }

        COSDictionary xobjects = (COSDictionary) xobjectBase;
        COSDictionary filteredXObjects = new COSDictionary();

        // Copy all XObjects except images
        for (COSName key : xobjects.keySet()) {
            COSBase value = xobjects.getDictionaryObject(key);
            if (value instanceof COSStream) {
                COSStream stream = (COSStream) value;
                COSName type = (COSName) stream.getDictionaryObject(COSName.TYPE);
                COSName subtype = (COSName) stream.getDictionaryObject(COSName.SUBTYPE);

                // Skip if this is an Image XObject
                if (COSName.XOBJECT.equals(type) && COSName.IMAGE.equals(subtype)) {
                    continue;
                }
            }
            // Keep non-image XObjects (Form XObjects, etc.)
            filteredXObjects.setItem(key, value);
        }

        // If all XObjects were images, remove the XObject entry entirely
        if (filteredXObjects.keySet().isEmpty()) {
            resources.removeItem(COSName.XOBJECT);
        } else {
            resources.setItem(COSName.XOBJECT, filteredXObjects);
        }

        return resources;
    }

    private PdfJsonMetadata extractMetadata(PDDocument document) {
        PdfJsonMetadata metadata = new PdfJsonMetadata();
        PDDocumentInformation info = document.getDocumentInformation();
        if (info != null) {
            metadata.setTitle(info.getTitle());
            metadata.setAuthor(info.getAuthor());
            metadata.setSubject(info.getSubject());
            metadata.setKeywords(info.getKeywords());
            metadata.setCreator(info.getCreator());
            metadata.setProducer(info.getProducer());
            metadata.setCreationDate(formatCalendar(info.getCreationDate()));
            metadata.setModificationDate(formatCalendar(info.getModificationDate()));
            metadata.setTrapped(info.getTrapped());
        }
        metadata.setNumberOfPages(document.getNumberOfPages());
        return metadata;
    }

    private String extractXmpMetadata(PDDocument document) {
        if (document.getDocumentCatalog() == null) {
            return null;
        }
        PDMetadata metadata = document.getDocumentCatalog().getMetadata();
        if (metadata == null) {
            return null;
        }
        try (InputStream inputStream = metadata.createInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            inputStream.transferTo(baos);
            byte[] data = baos.toByteArray();
            if (data.length == 0) {
                return null;
            }
            return Base64.getEncoder().encodeToString(data);
        } catch (IOException ex) {
            log.debug("Failed to extract XMP metadata: {}", ex.getMessage());
            return null;
        }
    }

    private void applyMetadata(PDDocument document, PdfJsonMetadata metadata) {
        if (metadata == null) {
            return;
        }
        PDDocumentInformation info = document.getDocumentInformation();
        info.setTitle(metadata.getTitle());
        info.setAuthor(metadata.getAuthor());
        info.setSubject(metadata.getSubject());
        info.setKeywords(metadata.getKeywords());
        info.setCreator(metadata.getCreator());
        info.setProducer(metadata.getProducer());
        if (metadata.getCreationDate() != null) {
            parseInstant(metadata.getCreationDate())
                    .ifPresent(instant -> info.setCreationDate(toCalendar(instant)));
        }
        if (metadata.getModificationDate() != null) {
            parseInstant(metadata.getModificationDate())
                    .ifPresent(instant -> info.setModificationDate(toCalendar(instant)));
        }
        info.setTrapped(metadata.getTrapped());
    }

    private void applyXmpMetadata(PDDocument document, String base64) {
        if (base64 == null || base64.isBlank()) {
            return;
        }
        try (InputStream inputStream =
                new ByteArrayInputStream(Base64.getDecoder().decode(base64))) {
            PDMetadata metadata = new PDMetadata(document, inputStream);
            document.getDocumentCatalog().setMetadata(metadata);
        } catch (IllegalArgumentException | IOException ex) {
            log.debug("Failed to apply XMP metadata: {}", ex.getMessage());
        }
    }

    private void restoreAnnotations(
            PDDocument document, PDPage page, List<PdfJsonAnnotation> annotations) {
        if (annotations == null || annotations.isEmpty()) {
            return;
        }

        for (PdfJsonAnnotation annModel : annotations) {
            try {
                // Restore from raw COS data if available for lossless round-trip
                if (annModel.getRawData() != null) {
                    COSBase rawAnnot = deserializeCosValue(annModel.getRawData(), document);
                    if (rawAnnot instanceof COSDictionary) {
                        PDAnnotation annotation =
                                PDAnnotation.createAnnotation((COSDictionary) rawAnnot);
                        page.getAnnotations().add(annotation);
                        log.debug("Restored annotation from raw data: {}", annModel.getSubtype());
                        continue;
                    }
                }

                // Fallback: reconstruct from structured fields
                // Note: This is simplified - full annotation reconstruction is complex
                // Most use cases should rely on rawData for lossless round-trip
                log.debug(
                        "Warning: Annotation {} has no rawData, basic reconstruction may lose information",
                        annModel.getSubtype());

            } catch (Exception e) {
                log.warn(
                        "Failed to restore annotation {}: {}",
                        annModel.getSubtype(),
                        e.getMessage());
            }
        }
    }

    private void restoreFormFields(PDDocument document, List<PdfJsonFormField> formFields) {
        if (formFields == null || formFields.isEmpty()) {
            return;
        }

        try {
            PDAcroForm acroForm = document.getDocumentCatalog().getAcroForm();
            if (acroForm == null) {
                acroForm = new PDAcroForm(document);
                document.getDocumentCatalog().setAcroForm(acroForm);
            }

            COSArray fieldsArray =
                    (COSArray) acroForm.getCOSObject().getDictionaryObject(COSName.FIELDS);
            if (fieldsArray == null) {
                fieldsArray = new COSArray();
                acroForm.getCOSObject().setItem(COSName.FIELDS, fieldsArray);
            }

            for (PdfJsonFormField fieldModel : formFields) {
                try {
                    // Restore from raw COS data if available for lossless round-trip
                    if (fieldModel.getRawData() != null) {
                        COSBase rawField = deserializeCosValue(fieldModel.getRawData(), document);
                        if (rawField instanceof COSDictionary) {
                            // Add the field dictionary directly to the fields array
                            fieldsArray.add(rawField);
                            log.debug(
                                    "Restored form field from raw data: {}", fieldModel.getName());
                            continue;
                        }
                    }

                    // Fallback: reconstruct from structured fields
                    // Note: This is simplified - full field reconstruction is complex
                    log.debug(
                            "Warning: Form field {} has no rawData, basic reconstruction may lose information",
                            fieldModel.getName());

                } catch (Exception e) {
                    log.warn(
                            "Failed to restore form field {}: {}",
                            fieldModel.getName(),
                            e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("Failed to restore form fields: {}", e.getMessage());
        }
    }

    private void applyPageResources(
            PDDocument document, PDPage page, PdfJsonCosValue resourcesModel) throws IOException {
        if (resourcesModel == null) {
            return;
        }
        COSBase base = deserializeCosValue(resourcesModel, document);
        if (base instanceof COSDictionary dictionary) {
            page.setResources(new PDResources(dictionary));
        }
    }

    /**
     * Reconstructs image XObjects from imageElements when content streams are preserved. During
     * serialization, image streams are filtered out from resources to avoid duplication. This
     * method adds them back by scanning content streams for XObject references and matching them
     * with imageElements by objectName.
     */
    private void reconstructImageXObjects(
            PDDocument document,
            PDPage page,
            List<PDStream> contentStreams,
            List<PdfJsonImageElement> imageElements)
            throws IOException {

        // Build map of objectName -> imageElement
        Map<String, PdfJsonImageElement> imageMap = new HashMap<>();
        for (PdfJsonImageElement img : imageElements) {
            if (img.getObjectName() != null && !img.getObjectName().isBlank()) {
                imageMap.put(img.getObjectName(), img);
            }
        }

        if (imageMap.isEmpty()) {
            return;
        }

        // Scan content streams for image XObject references
        Set<String> referencedXObjects = new HashSet<>();
        for (PDStream stream : contentStreams) {
            try {
                byte[] contentBytes = stream.toByteArray();
                PDFStreamParser parser = new PDFStreamParser(contentBytes);
                List<Object> tokens = parser.parse();

                for (int i = 0; i < tokens.size(); i++) {
                    Object token = tokens.get(i);
                    if (token instanceof Operator op
                            && OperatorName.DRAW_OBJECT.equals(op.getName())) {
                        if (i > 0 && tokens.get(i - 1) instanceof COSName name) {
                            referencedXObjects.add(name.getName());
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to parse content stream for image references: {}", e.getMessage());
            }
        }

        // Reconstruct referenced image XObjects
        PDResources resources = page.getResources();
        if (resources == null) {
            resources = new PDResources();
            page.setResources(resources);
        }

        for (String xobjName : referencedXObjects) {
            PdfJsonImageElement imageElement = imageMap.get(xobjName);
            if (imageElement == null) {
                log.warn(
                        "Content stream references image XObject '{}' but no matching imageElement found",
                        xobjName);
                continue;
            }

            try {
                PDImageXObject image = createImageXObject(document, imageElement);
                if (image != null) {
                    resources.put(COSName.getPDFName(xobjName), image);
                    log.debug("Reconstructed image XObject: {}", xobjName);
                }
            } catch (Exception e) {
                log.warn("Failed to reconstruct image XObject '{}': {}", xobjName, e.getMessage());
            }
        }
    }

    private List<PDStream> buildContentStreams(
            PDDocument document, List<PdfJsonStream> streamModels) throws IOException {
        List<PDStream> streams = new ArrayList<>();
        if (streamModels == null) {
            return streams;
        }
        for (PdfJsonStream streamModel : streamModels) {
            if (streamModel == null) {
                continue;
            }
            COSStream cosStream = buildStreamFromModel(streamModel, document);
            if (cosStream != null) {
                streams.add(new PDStream(cosStream));
            }
        }
        return streams;
    }

    private List<PdfJsonStream> extractContentStreams(PDPage page) throws IOException {
        List<PdfJsonStream> streams = new ArrayList<>();
        Iterator<PDStream> iterator = page.getContentStreams();
        if (iterator == null) {
            return streams;
        }
        while (iterator.hasNext()) {
            PDStream stream = iterator.next();
            PdfJsonStream model = serializeStream(stream);
            if (model != null) {
                streams.add(model);
            }
        }
        return streams;
    }

    private COSStream buildStreamFromModel(PdfJsonStream streamModel, PDDocument document)
            throws IOException {
        COSStream cosStream = document.getDocument().createCOSStream();
        if (streamModel.getDictionary() != null) {
            for (Map.Entry<String, PdfJsonCosValue> entry :
                    streamModel.getDictionary().entrySet()) {
                COSName key = COSName.getPDFName(entry.getKey());
                COSBase value = deserializeCosValue(entry.getValue(), document);
                if (value != null) {
                    cosStream.setItem(key, value);
                }
            }
        }
        String rawData = streamModel.getRawData();
        if (rawData != null && !rawData.isBlank()) {
            byte[] data;
            try {
                data = Base64.getDecoder().decode(rawData);
            } catch (IllegalArgumentException ex) {
                log.debug("Invalid base64 content stream data: {}", ex.getMessage());
                data = new byte[0];
            }
            try (OutputStream outputStream = cosStream.createRawOutputStream()) {
                outputStream.write(data);
            }
            cosStream.setItem(COSName.LENGTH, COSInteger.get(data.length));
        } else {
            cosStream.setItem(COSName.LENGTH, COSInteger.get(0));
        }
        return cosStream;
    }

    private PdfJsonStream serializeStream(PDStream stream) throws IOException {
        if (stream == null) {
            return null;
        }
        return serializeStream(stream.getCOSObject());
    }

    private PdfJsonStream serializeStream(COSStream cosStream) throws IOException {
        if (cosStream == null) {
            return null;
        }
        Map<String, PdfJsonCosValue> dictionary = new LinkedHashMap<>();
        for (COSName key : cosStream.keySet()) {
            COSBase value = cosStream.getDictionaryObject(key);
            PdfJsonCosValue serialized = serializeCosValue(value);
            if (serialized != null) {
                dictionary.put(key.getName(), serialized);
            }
        }
        String rawData = null;
        try (InputStream inputStream = cosStream.createRawInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            if (inputStream != null) {
                inputStream.transferTo(baos);
            }
            byte[] data = baos.toByteArray();
            if (data.length > 0) {
                rawData = Base64.getEncoder().encodeToString(data);
            }
        }
        return PdfJsonStream.builder().dictionary(dictionary).rawData(rawData).build();
    }

    private PdfJsonCosValue serializeCosValue(COSBase base) throws IOException {
        if (base == null) {
            return null;
        }
        if (base instanceof COSObject cosObject) {
            base = cosObject.getObject();
            if (base == null) {
                return null;
            }
        }
        PdfJsonCosValue.PdfJsonCosValueBuilder builder = PdfJsonCosValue.builder();
        if (base instanceof COSNull) {
            builder.type(PdfJsonCosValue.Type.NULL);
            return builder.build();
        }
        if (base instanceof COSBoolean booleanValue) {
            builder.type(PdfJsonCosValue.Type.BOOLEAN).value(booleanValue.getValue());
            return builder.build();
        }
        if (base instanceof COSInteger integer) {
            builder.type(PdfJsonCosValue.Type.INTEGER).value(integer.longValue());
            return builder.build();
        }
        if (base instanceof COSFloat floatValue) {
            builder.type(PdfJsonCosValue.Type.FLOAT).value(floatValue.floatValue());
            return builder.build();
        }
        if (base instanceof COSName name) {
            builder.type(PdfJsonCosValue.Type.NAME).value(name.getName());
            return builder.build();
        }
        if (base instanceof COSString cosString) {
            builder.type(PdfJsonCosValue.Type.STRING)
                    .value(Base64.getEncoder().encodeToString(cosString.getBytes()));
            return builder.build();
        }
        if (base instanceof COSArray array) {
            List<PdfJsonCosValue> items = new ArrayList<>(array.size());
            for (COSBase item : array) {
                PdfJsonCosValue serialized = serializeCosValue(item);
                items.add(serialized);
            }
            builder.type(PdfJsonCosValue.Type.ARRAY).items(items);
            return builder.build();
        }
        if (base instanceof COSStream stream) {
            builder.type(PdfJsonCosValue.Type.STREAM).stream(serializeStream(stream));
            return builder.build();
        }
        if (base instanceof COSDictionary dictionary) {
            Map<String, PdfJsonCosValue> entries = new LinkedHashMap<>();
            for (COSName key : dictionary.keySet()) {
                PdfJsonCosValue serialized = serializeCosValue(dictionary.getDictionaryObject(key));
                entries.put(key.getName(), serialized);
            }
            builder.type(PdfJsonCosValue.Type.DICTIONARY).entries(entries);
            return builder.build();
        }
        return null;
    }

    private COSBase deserializeCosValue(PdfJsonCosValue value, PDDocument document)
            throws IOException {
        if (value == null || value.getType() == null) {
            return null;
        }
        switch (value.getType()) {
            case NULL:
                return COSNull.NULL;
            case BOOLEAN:
                if (value.getValue() instanceof Boolean bool) {
                    return COSBoolean.getBoolean(bool);
                }
                return null;
            case INTEGER:
                if (value.getValue() instanceof Number number) {
                    return COSInteger.get(number.longValue());
                }
                return null;
            case FLOAT:
                if (value.getValue() instanceof Number number) {
                    return new COSFloat(number.floatValue());
                }
                return null;
            case NAME:
                if (value.getValue() instanceof String name) {
                    return COSName.getPDFName(name);
                }
                return null;
            case STRING:
                if (value.getValue() instanceof String encoded) {
                    try {
                        byte[] bytes = Base64.getDecoder().decode(encoded);
                        return new COSString(bytes);
                    } catch (IllegalArgumentException ex) {
                        log.debug("Failed to decode COSString value: {}", ex.getMessage());
                    }
                }
                return null;
            case ARRAY:
                COSArray array = new COSArray();
                if (value.getItems() != null) {
                    for (PdfJsonCosValue item : value.getItems()) {
                        COSBase entry = deserializeCosValue(item, document);
                        if (entry != null) {
                            array.add(entry);
                        } else {
                            array.add(COSNull.NULL);
                        }
                    }
                }
                return array;
            case DICTIONARY:
                COSDictionary dictionary = new COSDictionary();
                if (value.getEntries() != null) {
                    for (Map.Entry<String, PdfJsonCosValue> entry : value.getEntries().entrySet()) {
                        COSName key = COSName.getPDFName(entry.getKey());
                        COSBase entryValue = deserializeCosValue(entry.getValue(), document);
                        if (entryValue != null) {
                            dictionary.setItem(key, entryValue);
                        }
                    }
                }
                return dictionary;
            case STREAM:
                if (value.getStream() != null) {
                    return buildStreamFromModel(value.getStream(), document);
                }
                return null;
            default:
                return null;
        }
    }

    private void regeneratePageContent(
            PDDocument document,
            PDPage page,
            List<PdfJsonTextElement> textElements,
            List<PdfJsonImageElement> imageElements,
            Map<String, PDFont> fontMap,
            List<PdfJsonFont> fontModels,
            int pageNumber)
            throws IOException {
        List<DrawableElement> drawables = mergeDrawables(textElements, imageElements);
        Map<String, PDImageXObject> imageCache = new HashMap<>();

        try (PDPageContentStream contentStream =
                new PDPageContentStream(document, page, AppendMode.OVERWRITE, true, true)) {
            boolean textOpen = false;
            for (DrawableElement drawable : drawables) {
                switch (drawable.type()) {
                    case TEXT -> {
                        PdfJsonTextElement element = drawable.textElement();
                        if (element == null) {
                            continue;
                        }
                        String text = Objects.toString(element.getText(), "");

                        if (!textOpen) {
                            contentStream.beginText();
                            textOpen = true;
                        }

                        PDFont baseFont =
                                fontMap.get(buildFontKey(pageNumber, element.getFontId()));
                        if (baseFont == null && element.getFontId() != null) {
                            baseFont = fontMap.get(buildFontKey(-1, element.getFontId()));
                        }

                        float fontScale = resolveFontMatrixSize(element);

                        applyTextState(contentStream, element);
                        applyRenderingMode(contentStream, element.getRenderingMode());
                        applyTextMatrix(contentStream, element);

                        List<FontRun> runs =
                                buildFontRuns(
                                        document, fontMap, fontModels, baseFont, text, element);

                        PDFont activeFont = null;
                        for (FontRun run : runs) {
                            if (run == null || run.text().isEmpty()) {
                                continue;
                            }
                            if (run.font() != activeFont) {
                                contentStream.setFont(run.font(), fontScale);
                                activeFont = run.font();
                            }
                            contentStream.showText(run.text());
                        }
                    }
                    case IMAGE -> {
                        if (textOpen) {
                            contentStream.endText();
                            textOpen = false;
                        }
                        PdfJsonImageElement element = drawable.imageElement();
                        if (element == null) {
                            continue;
                        }
                        drawImageElement(contentStream, document, element, imageCache);
                    }
                }
            }
            if (textOpen) {
                contentStream.endText();
            }
        }
    }

    private List<FontRun> buildFontRuns(
            PDDocument document,
            Map<String, PDFont> fontMap,
            List<PdfJsonFont> fontModels,
            PDFont primaryFont,
            String text,
            PdfJsonTextElement element)
            throws IOException {
        List<FontRun> runs = new ArrayList<>();
        if (text == null || text.isEmpty()) {
            return runs;
        }

        PDFont baseFont = primaryFont;
        boolean fallbackApplied = primaryFont == null;
        if (baseFont == null) {
            baseFont = ensureFallbackFont(document, fontMap, fontModels, FALLBACK_FONT_ID);
            if (baseFont != null) {
                fallbackApplied = true;
            }
        }
        if (baseFont == null) {
            log.warn("Unable to resolve a base font for text element; skipping text content");
            return runs;
        }

        StringBuilder buffer = new StringBuilder();
        PDFont currentFont = baseFont;

        for (int offset = 0; offset < text.length(); ) {
            int codePoint = text.codePointAt(offset);
            offset += Character.charCount(codePoint);
            String glyph = new String(Character.toChars(codePoint));
            PDFont targetFont = currentFont;

            if (!canEncode(baseFont, codePoint)) {
                fallbackApplied = true;
                String fallbackId = resolveFallbackFontId(codePoint);
                targetFont = ensureFallbackFont(document, fontMap, fontModels, fallbackId);
                if (targetFont == null || !canEncode(targetFont, glyph)) {
                    String mapped = mapUnsupportedGlyph(codePoint);
                    if (mapped != null) {
                        if (canEncode(baseFont, mapped)) {
                            glyph = mapped;
                            targetFont = baseFont;
                        } else if (targetFont != null && canEncode(targetFont, mapped)) {
                            glyph = mapped;
                        }
                    }
                }
                if (targetFont == null || !canEncode(targetFont, glyph)) {
                    glyph = "?";
                    targetFont =
                            ensureFallbackFont(document, fontMap, fontModels, FALLBACK_FONT_ID);
                    if (targetFont == null || !canEncode(targetFont, glyph)) {
                        log.debug(
                                "Dropping unsupported glyph U+{} for text element",
                                Integer.toHexString(codePoint));
                        continue;
                    }
                }
                if (targetFont != baseFont) {
                    log.trace(
                            "Using fallback font '{}' for code point U+{}",
                            targetFont.getName(),
                            Integer.toHexString(codePoint));
                }
            }

            if (targetFont != currentFont) {
                if (buffer.length() > 0) {
                    runs.add(new FontRun(currentFont, buffer.toString()));
                    buffer.setLength(0);
                }
                currentFont = targetFont;
            }
            buffer.append(glyph);
        }

        if (buffer.length() > 0) {
            runs.add(new FontRun(currentFont, buffer.toString()));
        }

        if (fallbackApplied) {
            element.setFallbackUsed(Boolean.TRUE);
        }

        return runs;
    }

    private Integer extractUnitsPerEm(PDFont font) {
        if (font == null) {
            return null;
        }
        Matrix matrix = font.getFontMatrix();
        if (matrix != null) {
            float scaleX = matrix.getScaleX();
            if (scaleX != 0f) {
                int units = Math.round(Math.abs(1f / scaleX));
                if (units > 0 && units < 10_000) {
                    return units;
                }
            }
        }
        return 1000;
    }

    private boolean canEncodeFully(PDFont font, String text) {
        return canEncode(font, text);
    }

    private boolean canEncode(PDFont font, int codePoint) {
        return canEncode(font, new String(Character.toChars(codePoint)));
    }

    private boolean canEncode(PDFont font, String text) {
        if (font == null || text == null || text.isEmpty()) {
            return false;
        }
        try {
            font.encode(text);
            return true;
        } catch (IOException | IllegalArgumentException ex) {
            return false;
        }
    }

    private String resolveFallbackFontId(int codePoint) {
        Character.UnicodeBlock block = Character.UnicodeBlock.of(codePoint);
        if (block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_B
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_C
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_D
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_E
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_F
                || block == Character.UnicodeBlock.CJK_SYMBOLS_AND_PUNCTUATION
                || block == Character.UnicodeBlock.BOPOMOFO
                || block == Character.UnicodeBlock.BOPOMOFO_EXTENDED
                || block == Character.UnicodeBlock.HALFWIDTH_AND_FULLWIDTH_FORMS) {
            return FALLBACK_FONT_CJK_ID;
        }

        Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
        switch (script) {
            case HAN:
                return FALLBACK_FONT_CJK_ID;
            case HIRAGANA:
            case KATAKANA:
                return FALLBACK_FONT_JP_ID;
            case HANGUL:
                return FALLBACK_FONT_KR_ID;
            case ARABIC:
                return FALLBACK_FONT_AR_ID;
            case THAI:
                return FALLBACK_FONT_TH_ID;
            default:
                return FALLBACK_FONT_ID;
        }
    }

    private String mapUnsupportedGlyph(int codePoint) {
        return switch (codePoint) {
            case 0x276E -> "<";
            case 0x276F -> ">";
            default -> null;
        };
    }

    private void closeQuietly(TempFile tempFile) {
        if (tempFile == null) {
            return;
        }
        try {
            tempFile.close();
        } catch (Exception ex) {
            log.debug("Failed to close temporary file: {}", ex.getMessage());
        }
    }

    private void applyTextState(PDPageContentStream contentStream, PdfJsonTextElement element)
            throws IOException {
        if (element.getCharacterSpacing() != null) {
            contentStream.setCharacterSpacing(element.getCharacterSpacing());
        }
        if (element.getWordSpacing() != null) {
            contentStream.setWordSpacing(element.getWordSpacing());
        }
        if (element.getHorizontalScaling() != null) {
            contentStream.setHorizontalScaling(element.getHorizontalScaling());
        }
        if (element.getLeading() != null) {
            contentStream.setLeading(element.getLeading());
        }
        if (element.getRise() != null) {
            contentStream.setTextRise(element.getRise());
        }
        applyColor(contentStream, element.getFillColor(), true);
        applyColor(contentStream, element.getStrokeColor(), false);
    }

    private void applyColor(
            PDPageContentStream contentStream, PdfJsonTextColor color, boolean nonStroking)
            throws IOException {
        if (color == null || color.getComponents() == null) {
            return;
        }
        float[] components = new float[color.getComponents().size()];
        for (int i = 0; i < components.length; i++) {
            components[i] = color.getComponents().get(i);
        }
        String space = color.getColorSpace();
        if (space == null) {
            // Infer color space from component count
            PDColorSpace colorSpace;
            if (components.length == 1) {
                colorSpace = PDColorSpace.create(COSName.DEVICEGRAY);
            } else if (components.length == 3) {
                colorSpace = PDColorSpace.create(COSName.DEVICERGB);
            } else if (components.length == 4) {
                colorSpace = PDColorSpace.create(COSName.DEVICECMYK);
            } else {
                // Default to RGB if unsure
                colorSpace = PDColorSpace.create(COSName.DEVICERGB);
            }
            PDColor pdColor = new PDColor(components, colorSpace);
            if (nonStroking) {
                contentStream.setNonStrokingColor(pdColor);
            } else {
                contentStream.setStrokingColor(pdColor);
            }
            return;
        }
        switch (space) {
            case "DeviceRGB":
                if (components.length >= 3) {
                    if (nonStroking) {
                        contentStream.setNonStrokingColor(
                                components[0], components[1], components[2]);
                    } else {
                        contentStream.setStrokingColor(components[0], components[1], components[2]);
                    }
                }
                break;
            case "DeviceCMYK":
                if (components.length >= 4) {
                    if (nonStroking) {
                        contentStream.setNonStrokingColor(
                                components[0], components[1], components[2], components[3]);
                    } else {
                        contentStream.setStrokingColor(
                                components[0], components[1], components[2], components[3]);
                    }
                }
                break;
            case "DeviceGray":
                if (components.length >= 1) {
                    if (nonStroking) {
                        contentStream.setNonStrokingColor(components[0]);
                    } else {
                        contentStream.setStrokingColor(components[0]);
                    }
                }
                break;
            default:
                log.debug("Skipping unsupported color space {}", space);
        }
    }

    private String abbreviate(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.replaceAll("\s+", " ").trim();
        if (trimmed.length() <= 32) {
            return trimmed;
        }
        return trimmed.substring(0, 29) + "...";
    }

    private static class FontProgramData {
        private final String base64;
        private final String format;
        private final String webBase64;
        private final String webFormat;

        private FontProgramData(String base64, String format, String webBase64, String webFormat) {
            this.base64 = base64;
            this.format = format;
            this.webBase64 = webBase64;
            this.webFormat = webFormat;
        }

        private String getBase64() {
            return base64;
        }

        private String getFormat() {
            return format;
        }

        private String getWebBase64() {
            return webBase64;
        }

        private String getWebFormat() {
            return webFormat;
        }
    }

    private static final class PreflightResult {
        private static final PreflightResult EMPTY = new PreflightResult(false, Set.of());

        private final boolean usesFallback;
        private final Set<String> fallbackFontIds;

        private PreflightResult(boolean usesFallback, Set<String> fallbackFontIds) {
            this.usesFallback = usesFallback;
            this.fallbackFontIds = fallbackFontIds != null ? Set.copyOf(fallbackFontIds) : Set.of();
        }

        private static PreflightResult empty() {
            return EMPTY;
        }

        private boolean usesFallback() {
            return usesFallback;
        }

        private Set<String> fallbackFontIds() {
            return fallbackFontIds;
        }
    }

    private static final class FallbackFontSpec {
        private final String resourceLocation;
        private final String baseName;
        private final String format;

        private FallbackFontSpec(String resourceLocation, String baseName, String format) {
            this.resourceLocation = resourceLocation;
            this.baseName = baseName;
            this.format = format;
        }

        private String resourceLocation() {
            return resourceLocation;
        }

        private String baseName() {
            return baseName;
        }

        private String format() {
            return format;
        }
    }

    private static final class FontRun {
        private final PDFont font;
        private final String text;

        private FontRun(PDFont font, String text) {
            this.font = font;
            this.text = text;
        }

        private PDFont font() {
            return font;
        }

        private String text() {
            return text;
        }
    }

    private boolean rewriteTextOperators(
            PDDocument document, PDPage page, List<PdfJsonTextElement> elements) {
        if (elements == null || elements.isEmpty()) {
            return true;
        }
        PDResources resources = page.getResources();
        if (resources == null) {
            return false;
        }
        try {
            log.debug("Attempting token-level rewrite for page");
            PDFStreamParser parser = new PDFStreamParser(page);
            List<Object> tokens = parser.parse();
            log.debug("Parsed {} tokens for rewrite", tokens.size());
            TextElementCursor cursor = new TextElementCursor(elements);
            PDFont currentFont = null;
            String currentFontName = null;

            for (int i = 0; i < tokens.size(); i++) {
                Object token = tokens.get(i);
                if (!(token instanceof Operator operator)) {
                    continue;
                }
                String operatorName = operator.getName();
                switch (operatorName) {
                    case "Tf":
                        if (i >= 2 && tokens.get(i - 2) instanceof COSName fontResourceName) {
                            currentFont = resources.getFont(fontResourceName);
                            currentFontName = fontResourceName.getName();
                            log.trace(
                                    "Encountered Tf operator; switching to font resource {}",
                                    currentFontName);
                        } else {
                            currentFont = null;
                            currentFontName = null;
                            log.debug(
                                    "Tf operator missing resource operand; clearing current font");
                        }
                        break;
                    case "Tj":
                        if (i == 0 || !(tokens.get(i - 1) instanceof COSString cosString)) {
                            log.debug(
                                    "Encountered Tj without preceding string operand; aborting rewrite");
                            return false;
                        }
                        log.trace("Rewriting Tj operator using font {}", currentFontName);
                        if (!rewriteShowText(cosString, currentFont, currentFontName, cursor)) {
                            log.debug("Failed to rewrite Tj operator; aborting rewrite");
                            return false;
                        }
                        break;
                    case "TJ":
                        if (i == 0 || !(tokens.get(i - 1) instanceof COSArray array)) {
                            log.debug("Encountered TJ without array operand; aborting rewrite");
                            return false;
                        }
                        log.trace("Rewriting TJ operator using font {}", currentFontName);
                        if (!rewriteShowTextArray(array, currentFont, currentFontName, cursor)) {
                            log.debug("Failed to rewrite TJ operator; aborting rewrite");
                            return false;
                        }
                        break;
                    default:
                        break;
                }
            }

            if (cursor.hasRemaining()) {
                log.debug("Rewrite cursor still has {} elements; falling back", cursor.remaining());
                return false;
            }

            PDStream newStream = new PDStream(document);
            try (OutputStream outputStream = newStream.createOutputStream(COSName.FLATE_DECODE)) {
                new ContentStreamWriter(outputStream).writeTokens(tokens);
            }
            page.setContents(newStream);
            log.debug("Token rewrite completed successfully");
            return true;
        } catch (IOException ex) {
            log.debug("Failed to rewrite content stream: {}", ex.getMessage());
            return false;
        }
    }

    private boolean rewriteShowText(
            COSString cosString, PDFont font, String expectedFontName, TextElementCursor cursor)
            throws IOException {
        if (font == null) {
            return false;
        }
        int glyphCount = countGlyphs(cosString, font);
        List<PdfJsonTextElement> consumed = cursor.consume(expectedFontName, glyphCount);
        if (consumed == null) {
            return false;
        }
        String replacement = mergeText(consumed);
        try {
            byte[] encoded = font.encode(replacement);
            cosString.setValue(encoded);
            return true;
        } catch (IOException | IllegalArgumentException | UnsupportedOperationException ex) {
            log.debug("Failed to encode replacement text: {}", ex.getMessage());
            return false;
        }
    }

    private boolean rewriteShowTextArray(
            COSArray array, PDFont font, String expectedFontName, TextElementCursor cursor)
            throws IOException {
        if (font == null) {
            return false;
        }
        for (int i = 0; i < array.size(); i++) {
            COSBase element = array.get(i);
            if (element instanceof COSString cosString) {
                int glyphCount = countGlyphs(cosString, font);
                List<PdfJsonTextElement> consumed = cursor.consume(expectedFontName, glyphCount);
                if (consumed == null) {
                    return false;
                }
                String replacement = mergeText(consumed);
                try {
                    byte[] encoded = font.encode(replacement);
                    array.set(i, new COSString(encoded));
                } catch (IOException
                        | IllegalArgumentException
                        | UnsupportedOperationException ex) {
                    log.debug("Failed to encode replacement text in TJ array: {}", ex.getMessage());
                    return false;
                }
            }
        }
        return true;
    }

    private int countGlyphs(COSString value, PDFont font) {
        if (value == null) {
            return 0;
        }
        if (font != null) {
            try (InputStream inputStream = new ByteArrayInputStream(value.getBytes())) {
                int count = 0;
                int code;
                while ((code = font.readCode(inputStream)) != -1) {
                    count++;
                }
                if (count > 0) {
                    return count;
                }
            } catch (IOException ex) {
                log.debug("Failed to decode glyphs: {}", ex.getMessage());
            }
        }
        byte[] bytes = value.getBytes();
        return Math.max(1, bytes.length);
    }

    private String mergeText(List<PdfJsonTextElement> elements) {
        StringBuilder builder = new StringBuilder();
        for (PdfJsonTextElement element : elements) {
            builder.append(Objects.toString(element.getText(), ""));
        }
        return builder.toString();
    }

    private static class TextElementCursor {
        private final List<PdfJsonTextElement> elements;
        private int index = 0;

        TextElementCursor(List<PdfJsonTextElement> elements) {
            this.elements = elements;
        }

        boolean hasRemaining() {
            return index < elements.size();
        }

        int remaining() {
            return Math.max(0, elements.size() - index);
        }

        List<PdfJsonTextElement> consume(String expectedFontName, int glyphCount) {
            if (glyphCount <= 0) {
                return Collections.emptyList();
            }
            List<PdfJsonTextElement> consumed = new ArrayList<>();
            int remaining = glyphCount;
            while (remaining > 0 && index < elements.size()) {
                PdfJsonTextElement element = elements.get(index);
                if (!fontMatches(expectedFontName, element.getFontId())) {
                    return null;
                }
                consumed.add(element);
                remaining -= countGlyphs(element);
                index++;
            }
            if (remaining > 0) {
                return null;
            }
            return consumed;
        }

        private boolean fontMatches(String expected, String actual) {
            if (expected == null || expected.isEmpty()) {
                return true;
            }
            if (actual == null) {
                return false;
            }
            return Objects.equals(expected, actual);
        }

        private int countGlyphs(PdfJsonTextElement element) {
            String text = element.getText();
            if (text != null && !text.isEmpty()) {
                return Math.max(1, text.codePointCount(0, text.length()));
            }
            return 1;
        }
    }

    private Map<String, PDFont> buildFontMap(PDDocument document, List<PdfJsonFont> fonts)
            throws IOException {
        Map<String, PDFont> fontMap = new HashMap<>();
        if (fonts != null) {
            for (PdfJsonFont fontModel : fonts) {
                if (FALLBACK_FONT_ID.equals(fontModel.getId())) {
                    continue;
                }
                PDFont loadedFont = createFontFromModel(document, fontModel);
                if (loadedFont != null && fontModel.getId() != null) {
                    fontMap.put(
                            buildFontKey(fontModel.getPageNumber(), fontModel.getId()), loadedFont);
                }
            }
        }

        boolean fallbackPresent =
                fonts != null && fonts.stream().anyMatch(f -> FALLBACK_FONT_ID.equals(f.getId()));
        if (!fallbackPresent) {
            PdfJsonFont fallbackModel = buildFallbackFontModel();
            if (fonts != null) {
                fonts.add(fallbackModel);
                log.info("Added fallback font definition to JSON font list");
            }
            PDFont fallbackFont = createFontFromModel(document, fallbackModel);
            fontMap.put(buildFontKey(-1, FALLBACK_FONT_ID), fallbackFont);
        } else if (!fontMap.containsKey(buildFontKey(-1, FALLBACK_FONT_ID))) {
            PdfJsonFont fallbackModel =
                    fonts.stream()
                            .filter(f -> FALLBACK_FONT_ID.equals(f.getId()))
                            .findFirst()
                            .orElse(buildFallbackFontModel());
            PDFont fallbackFont = createFontFromModel(document, fallbackModel);
            fontMap.put(buildFontKey(-1, FALLBACK_FONT_ID), fallbackFont);
        }

        return fontMap;
    }

    private PDFont createFontFromModel(PDDocument document, PdfJsonFont fontModel)
            throws IOException {
        if (fontModel == null || fontModel.getId() == null) {
            return null;
        }

        if (FALLBACK_FONT_ID.equals(fontModel.getId())) {
            return loadFallbackPdfFont(document);
        }

        // IMPORTANT: Dictionary restoration is disabled because deserialized dictionaries
        // don't properly include the font stream references (FontFile/FontFile2/FontFile3).
        // This results in fonts that structurally exist but can't encode glyphs, causing
        // fallback to NotoSans. Instead, we ALWAYS use program bytes for reliable encoding.
        // The cosDictionary field is preserved in the JSON for potential future use, but
        // for now we rely on direct font program loading.
        if (false && fontModel.getCosDictionary() != null) {
            // Dictionary restoration code kept for reference but disabled
            COSBase restored = deserializeCosValue(fontModel.getCosDictionary(), document);
            if (restored instanceof COSDictionary cosDictionary) {
                try {
                    PDFont font = PDFontFactory.createFont(cosDictionary);
                    if (font != null && font.isEmbedded()) {
                        // Verify font can actually encode a basic character
                        try {
                            font.encode("A");
                            applyAdditionalFontMetadata(document, font, fontModel);
                            log.debug("Successfully restored embedded font {} from dictionary", fontModel.getId());
                            return font;
                        } catch (IOException | IllegalArgumentException encodingEx) {
                            log.warn(
                                    "Font {} restored from dictionary but failed encoding test: {}; falling back to program bytes",
                                    fontModel.getId(),
                                    encodingEx.getMessage());
                        }
                    }
                } catch (IOException ex) {
                    log.warn(
                            "Failed to restore font {} from stored dictionary: {}; falling back to program bytes",
                            fontModel.getId(),
                            ex.getMessage());
                }
            }
        }

        byte[] fontBytes = null;
        String format = null;

        // For CFF/Type1C fonts, prefer the webProgram (converted TrueType) because:
        // 1. PDFBox's PDType0Font.load() expects TrueType/OpenType format
        // 2. Raw CFF program bytes lack the descriptor context needed for reconstruction
        // 3. FontForge-converted TrueType is reliable for both web preview and PDF export
        String originalFormat =
                fontModel.getProgramFormat() != null
                        ? fontModel.getProgramFormat().toLowerCase(Locale.ROOT)
                        : null;
        // For JSON→PDF conversion, always use original font bytes
        // (PDFBox doesn't support OpenType-CFF; webProgram is only for frontend web preview)
        String program = fontModel.getProgram();
        if (program != null && !program.isBlank()) {
            fontBytes = Base64.getDecoder().decode(program);
            format = originalFormat;
            log.debug("Using original font program for {} (format: {})", fontModel.getId(), originalFormat);
        } else if (fontModel.getWebProgram() != null && !fontModel.getWebProgram().isBlank()) {
            // Fallback to webProgram if original program is unavailable
            fontBytes = Base64.getDecoder().decode(fontModel.getWebProgram());
            format =
                    fontModel.getWebProgramFormat() != null
                            ? fontModel.getWebProgramFormat().toLowerCase(Locale.ROOT)
                            : null;
            log.debug("Using web-optimized font program for {} (original program unavailable)", fontModel.getId());
        }

        if (fontBytes != null && fontBytes.length > 0) {
            try {
                if (isType1Format(format)) {
                    try (InputStream stream = new ByteArrayInputStream(fontBytes)) {
                        PDFont font = new PDType1Font(document, stream);
                        applyAdditionalFontMetadata(document, font, fontModel);
                        log.debug(
                                "Successfully loaded Type1 font {} from program bytes (format: {}, originalFormat: {})",
                                fontModel.getId(),
                                format,
                                originalFormat);
                        return font;
                    }
                }
                try (InputStream stream = new ByteArrayInputStream(fontBytes)) {
                    PDFont font = PDType0Font.load(document, stream, true);
                    applyAdditionalFontMetadata(document, font, fontModel);
                    log.debug(
                            "Successfully loaded Type0 font {} from program bytes (format: {}, originalFormat: {})",
                            fontModel.getId(),
                            format,
                            originalFormat);
                    return font;
                }
            } catch (IOException ex) {
                log.warn(
                        "Unable to load embedded font program for {} (format: {}, originalFormat: {}): {}; falling back to Standard 14 or default",
                        fontModel.getId(),
                        format,
                        originalFormat,
                        ex.getMessage());
            }
        } else {
            log.warn(
                    "Font {} has no program bytes available (originalFormat: {})",
                    fontModel.getId(),
                    originalFormat);
        }

        String standardName = fontModel.getStandard14Name();
        if (standardName != null) {
            try {
                Standard14Fonts.FontName fontName = Standard14Fonts.getMappedFontName(standardName);
                if (fontName != null) {
                    PDFont font = new PDType1Font(fontName);
                    applyAdditionalFontMetadata(document, font, fontModel);
                    return font;
                }
                log.warn(
                        "Standard 14 font mapping for {} returned null, using fallback",
                        standardName);
            } catch (IllegalArgumentException ex) {
                log.warn("Unknown Standard 14 font {}, using fallback", standardName);
            }
        }

        PDFont fallback = loadFallbackPdfFont(document);
        applyAdditionalFontMetadata(document, fallback, fontModel);
        return fallback;
    }

    private boolean isType1Format(String format) {
        if (format == null) {
            return false;
        }
        return "type1".equals(format) || format.endsWith("pfb");
    }

    private boolean isCffFormat(String format) {
        if (format == null) {
            return false;
        }
        String normalized = format.toLowerCase(Locale.ROOT);
        return normalized.contains("type1c")
                || normalized.contains("cidfonttype0c")
                || "cff".equals(normalized);
    }

    private void applyAdditionalFontMetadata(
            PDDocument document, PDFont font, PdfJsonFont fontModel) throws IOException {
        if (fontModel.getToUnicode() != null && !fontModel.getToUnicode().isBlank()) {
            byte[] bytes = Base64.getDecoder().decode(fontModel.getToUnicode());
            PDStream toUnicodeStream = new PDStream(document);
            try (OutputStream outputStream = toUnicodeStream.createOutputStream()) {
                outputStream.write(bytes);
            }
            font.getCOSObject().setItem(COSName.TO_UNICODE, toUnicodeStream.getCOSObject());
        }

        PdfJsonFontCidSystemInfo cidInfo = fontModel.getCidSystemInfo();
        if (cidInfo != null) {
            COSDictionary cidDictionary = new COSDictionary();
            if (cidInfo.getRegistry() != null) {
                cidDictionary.setString(COSName.REGISTRY, cidInfo.getRegistry());
            }
            if (cidInfo.getOrdering() != null) {
                cidDictionary.setString(COSName.ORDERING, cidInfo.getOrdering());
            }
            if (cidInfo.getSupplement() != null) {
                cidDictionary.setInt(COSName.SUPPLEMENT, cidInfo.getSupplement());
            }
            font.getCOSObject().setItem(COSName.CIDSYSTEMINFO, cidDictionary);
        }
    }

    private void applyTextMatrix(PDPageContentStream contentStream, PdfJsonTextElement element)
            throws IOException {
        List<Float> matrix = element.getTextMatrix();
        if (matrix != null && matrix.size() == 6) {
            float fontScale = resolveFontMatrixSize(element);
            float a = matrix.get(0);
            float b = matrix.get(1);
            float c = matrix.get(2);
            float d = matrix.get(3);
            float e = matrix.get(4);
            float f = matrix.get(5);

            if (fontScale != 0f) {
                a /= fontScale;
                b /= fontScale;
                c /= fontScale;
                d /= fontScale;
            }

            contentStream.setTextMatrix(new Matrix(a, b, c, d, e, f));
            return;
        }
        float x = safeFloat(element.getX(), 0f);
        float y = safeFloat(element.getY(), 0f);
        contentStream.setTextMatrix(new Matrix(1, 0, 0, 1, x, y));
    }

    private float resolveFontMatrixSize(PdfJsonTextElement element) {
        Float fromElement = element.getFontMatrixSize();
        if (fromElement != null && fromElement > 0f) {
            return fromElement;
        }
        List<Float> matrix = element.getTextMatrix();
        if (matrix != null && matrix.size() >= 4) {
            float a = matrix.get(0);
            float b = matrix.get(1);
            float c = matrix.get(2);
            float d = matrix.get(3);
            float verticalScale = (float) Math.hypot(b, d);
            if (verticalScale > 0f) {
                return verticalScale;
            }
            float horizontalScale = (float) Math.hypot(a, c);
            if (horizontalScale > 0f) {
                return horizontalScale;
            }
        }
        return safeFloat(element.getFontSize(), 12f);
    }

    private void applyRenderingMode(PDPageContentStream contentStream, Integer renderingMode)
            throws IOException {
        if (renderingMode == null) {
            return;
        }
        RenderingMode mode = toRenderingMode(renderingMode);
        if (mode == null) {
            log.debug("Ignoring unsupported rendering mode {}", renderingMode);
            return;
        }
        try {
            contentStream.setRenderingMode(mode);
        } catch (IllegalArgumentException ex) {
            log.debug("Failed to apply rendering mode {}: {}", renderingMode, ex.getMessage());
        }
    }

    private float safeFloat(Float value, float defaultValue) {
        if (value == null || Float.isNaN(value) || Float.isInfinite(value)) {
            return defaultValue;
        }
        return value;
    }

    private String formatCalendar(Calendar calendar) {
        if (calendar == null) {
            return null;
        }
        return calendar.toInstant().toString();
    }

    private Optional<Instant> parseInstant(String value) {
        try {
            return Optional.of(Instant.parse(value));
        } catch (DateTimeParseException ex) {
            log.warn("Failed to parse instant '{}': {}", value, ex.getMessage());
            return Optional.empty();
        }
    }

    private Calendar toCalendar(Instant instant) {
        Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        calendar.setTimeInMillis(instant.toEpochMilli());
        return calendar;
    }

    private class ImageCollectingEngine extends PDFGraphicsStreamEngine {

        private final int pageNumber;
        private final Map<Integer, List<PdfJsonImageElement>> imagesByPage;

        private COSName currentXObjectName;
        private int imageCounter = 0;

        protected ImageCollectingEngine(
                PDPage page, int pageNumber, Map<Integer, List<PdfJsonImageElement>> imagesByPage)
                throws IOException {
            super(page);
            this.pageNumber = pageNumber;
            this.imagesByPage = imagesByPage;
        }

        @Override
        public void processPage(PDPage page) throws IOException {
            super.processPage(page);
        }

        @Override
        public void drawImage(PDImage pdImage) throws IOException {
            EncodedImage encoded = encodeImage(pdImage);
            if (encoded == null) {
                return;
            }
            Matrix ctm = getGraphicsState().getCurrentTransformationMatrix();
            Bounds bounds = computeBounds(ctm);
            List<Float> matrixValues = toMatrixValues(ctm);

            PdfJsonImageElement element =
                    PdfJsonImageElement.builder()
                            .id(UUID.randomUUID().toString())
                            .objectName(
                                    currentXObjectName != null
                                            ? currentXObjectName.getName()
                                            : null)
                            .inlineImage(!(pdImage instanceof PDImageXObject))
                            .nativeWidth(pdImage.getWidth())
                            .nativeHeight(pdImage.getHeight())
                            .x(bounds.left)
                            .y(bounds.bottom)
                            .width(bounds.width())
                            .height(bounds.height())
                            .left(bounds.left)
                            .right(bounds.right)
                            .top(bounds.top)
                            .bottom(bounds.bottom)
                            .transform(matrixValues)
                            .zOrder(-1_000_000 + imageCounter)
                            .imageData(encoded.base64())
                            .imageFormat(encoded.format())
                            .build();
            imageCounter++;
            imagesByPage.computeIfAbsent(pageNumber, key -> new ArrayList<>()).add(element);
        }

        @Override
        public void appendRectangle(Point2D p0, Point2D p1, Point2D p2, Point2D p3)
                throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void clip(int windingRule) throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void moveTo(float x, float y) throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void lineTo(float x, float y) throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void curveTo(float x1, float y1, float x2, float y2, float x3, float y3)
                throws IOException {
            // Not needed for image extraction
        }

        @Override
        public Point2D getCurrentPoint() throws IOException {
            return new Point2D.Float();
        }

        @Override
        public void closePath() throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void endPath() throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void shadingFill(COSName shadingName) throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void fillAndStrokePath(int windingRule) throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void fillPath(int windingRule) throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void strokePath() throws IOException {
            // Not needed for image extraction
        }

        @Override
        protected void processOperator(Operator operator, List<COSBase> operands)
                throws IOException {
            if (OperatorName.DRAW_OBJECT.equals(operator.getName())
                    && !operands.isEmpty()
                    && operands.get(0) instanceof COSName name) {
                currentXObjectName = name;
            }
            super.processOperator(operator, operands);
            currentXObjectName = null;
        }

        private Bounds computeBounds(Matrix ctm) {
            AffineTransform transform = ctm.createAffineTransform();
            Point2D.Float p0 = new Point2D.Float(0, 0);
            Point2D.Float p1 = new Point2D.Float(1, 0);
            Point2D.Float p2 = new Point2D.Float(0, 1);
            Point2D.Float p3 = new Point2D.Float(1, 1);
            transform.transform(p0, p0);
            transform.transform(p1, p1);
            transform.transform(p2, p2);
            transform.transform(p3, p3);

            float minX = Math.min(Math.min(p0.x, p1.x), Math.min(p2.x, p3.x));
            float maxX = Math.max(Math.max(p0.x, p1.x), Math.max(p2.x, p3.x));
            float minY = Math.min(Math.min(p0.y, p1.y), Math.min(p2.y, p3.y));
            float maxY = Math.max(Math.max(p0.y, p1.y), Math.max(p2.y, p3.y));

            if (!Float.isFinite(minX) || !Float.isFinite(minY)) {
                return new Bounds(0f, 0f, 0f, 0f);
            }
            return new Bounds(minX, maxX, minY, maxY);
        }
    }

    private record Bounds(float left, float right, float bottom, float top) {
        float width() {
            return Math.max(0f, right - left);
        }

        float height() {
            return Math.max(0f, top - bottom);
        }
    }

    private enum DrawableType {
        TEXT,
        IMAGE
    }

    private record DrawableElement(
            DrawableType type,
            PdfJsonTextElement textElement,
            PdfJsonImageElement imageElement,
            int zOrder,
            int sequence) {}

    private record EncodedImage(String base64, String format) {}

    private List<Float> toMatrixValues(Matrix matrix) {
        List<Float> values = new ArrayList<>(6);
        values.add(matrix.getValue(0, 0));
        values.add(matrix.getValue(0, 1));
        values.add(matrix.getValue(1, 0));
        values.add(matrix.getValue(1, 1));
        values.add(matrix.getValue(2, 0));
        values.add(matrix.getValue(2, 1));
        return values;
    }

    private EncodedImage encodeImage(PDImage image) {
        try {
            BufferedImage bufferedImage = image.getImage();
            if (bufferedImage == null) {
                return null;
            }
            String format = resolveImageFormat(image);
            if (format == null || format.isBlank()) {
                format = "png";
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            boolean written = ImageIO.write(bufferedImage, format, baos);
            if (!written) {
                if (!"png".equalsIgnoreCase(format)) {
                    baos.reset();
                    if (!ImageIO.write(bufferedImage, "png", baos)) {
                        return null;
                    }
                    format = "png";
                } else {
                    return null;
                }
            }
            return new EncodedImage(Base64.getEncoder().encodeToString(baos.toByteArray()), format);
        } catch (IOException ex) {
            log.debug("Failed to encode image: {}", ex.getMessage());
            return null;
        }
    }

    private String resolveImageFormat(PDImage image) {
        if (image instanceof PDImageXObject xObject) {
            String suffix = xObject.getSuffix();
            if (suffix != null && !suffix.isBlank()) {
                return suffix.toLowerCase(Locale.ROOT);
            }
        }
        return "png";
    }

    private List<DrawableElement> mergeDrawables(
            List<PdfJsonTextElement> textElements, List<PdfJsonImageElement> imageElements) {
        List<DrawableElement> drawables = new ArrayList<>();
        int sequence = 0;

        if (imageElements != null) {
            int imageIndex = 0;
            for (PdfJsonImageElement imageElement : imageElements) {
                if (imageElement == null) {
                    continue;
                }
                int order =
                        imageElement.getZOrder() != null
                                ? imageElement.getZOrder()
                                : Integer.MIN_VALUE / 2 + imageIndex;
                drawables.add(
                        new DrawableElement(
                                DrawableType.IMAGE, null, imageElement, order, sequence++));
                imageIndex++;
            }
        }

        if (textElements != null) {
            int textIndex = 0;
            for (PdfJsonTextElement textElement : textElements) {
                if (textElement == null) {
                    continue;
                }
                int order =
                        textElement.getZOrder() != null
                                ? textElement.getZOrder()
                                : 1_000_000 + textIndex;
                drawables.add(
                        new DrawableElement(
                                DrawableType.TEXT, textElement, null, order, sequence++));
                textIndex++;
            }
        }

        drawables.sort(
                Comparator.comparingInt(DrawableElement::zOrder)
                        .thenComparingInt(DrawableElement::sequence));
        return drawables;
    }

    private void drawImageElement(
            PDPageContentStream contentStream,
            PDDocument document,
            PdfJsonImageElement element,
            Map<String, PDImageXObject> cache)
            throws IOException {
        if (element == null || element.getImageData() == null || element.getImageData().isBlank()) {
            return;
        }

        String cacheKey =
                element.getId() != null && !element.getId().isBlank()
                        ? element.getId()
                        : Integer.toHexString(System.identityHashCode(element));
        PDImageXObject image = cache.get(cacheKey);
        if (image == null) {
            image = createImageXObject(document, element);
            if (image == null) {
                return;
            }
            cache.put(cacheKey, image);
        }

        List<Float> transform = element.getTransform();
        if (transform != null && transform.size() == 6) {
            Matrix matrix =
                    new Matrix(
                            safeFloat(transform.get(0), 1f),
                            safeFloat(transform.get(1), 0f),
                            safeFloat(transform.get(2), 0f),
                            safeFloat(transform.get(3), 1f),
                            safeFloat(transform.get(4), 0f),
                            safeFloat(transform.get(5), 0f));
            contentStream.drawImage(image, matrix);
            return;
        }

        float width = safeFloat(element.getWidth(), fallbackWidth(element));
        float height = safeFloat(element.getHeight(), fallbackHeight(element));
        if (width <= 0f) {
            width = Math.max(1f, fallbackWidth(element));
        }
        if (height <= 0f) {
            height = Math.max(1f, fallbackHeight(element));
        }
        float left = resolveLeft(element, width);
        float bottom = resolveBottom(element, height);

        contentStream.drawImage(image, left, bottom, width, height);
    }

    private PDImageXObject createImageXObject(PDDocument document, PdfJsonImageElement element)
            throws IOException {
        byte[] data;
        try {
            data = Base64.getDecoder().decode(element.getImageData());
        } catch (IllegalArgumentException ex) {
            log.debug("Failed to decode image element: {}", ex.getMessage());
            return null;
        }
        String name = element.getId() != null ? element.getId() : UUID.randomUUID().toString();
        return PDImageXObject.createFromByteArray(document, data, name);
    }

    private float fallbackWidth(PdfJsonImageElement element) {
        if (element.getRight() != null && element.getLeft() != null) {
            return Math.max(0f, element.getRight() - element.getLeft());
        }
        if (element.getNativeWidth() != null) {
            return element.getNativeWidth();
        }
        return 1f;
    }

    private float resolveLeft(PdfJsonImageElement element, float width) {
        if (element.getLeft() != null) {
            return element.getLeft();
        }
        if (element.getX() != null) {
            return element.getX();
        }
        if (element.getRight() != null) {
            return element.getRight() - width;
        }
        return 0f;
    }

    private float resolveBottom(PdfJsonImageElement element, float height) {
        if (element.getBottom() != null) {
            return element.getBottom();
        }
        if (element.getY() != null) {
            return element.getY();
        }
        if (element.getTop() != null) {
            return element.getTop() - height;
        }
        return 0f;
    }

    private float fallbackHeight(PdfJsonImageElement element) {
        if (element.getTop() != null && element.getBottom() != null) {
            return Math.max(0f, element.getTop() - element.getBottom());
        }
        if (element.getNativeHeight() != null) {
            return element.getNativeHeight();
        }
        return 1f;
    }

    private class TextCollectingStripper extends PDFTextStripper {

        private final PDDocument document;
        private final Map<String, PdfJsonFont> fonts;
        private final Map<Integer, List<PdfJsonTextElement>> textByPage;
        private final Map<Integer, Map<PDFont, String>> pageFontResources;

        private int currentPage = 1;
        private Map<PDFont, String> currentFontResources = Collections.emptyMap();

        TextCollectingStripper(
                PDDocument document,
                Map<String, PdfJsonFont> fonts,
                Map<Integer, List<PdfJsonTextElement>> textByPage,
                Map<Integer, Map<PDFont, String>> pageFontResources)
                throws IOException {
            this.document = document;
            this.fonts = fonts;
            this.textByPage = textByPage;
            this.pageFontResources = pageFontResources;
        }

        @Override
        protected void startPage(PDPage page) throws IOException {
            super.startPage(page);
            currentPage = getCurrentPageNo();
            currentFontResources =
                    pageFontResources.getOrDefault(currentPage, Collections.emptyMap());
        }

        @Override
        protected void writeString(String text, List<TextPosition> textPositions)
                throws IOException {
            if (textPositions == null || textPositions.isEmpty()) {
                return;
            }
            List<PdfJsonTextElement> pageElements =
                    textByPage.computeIfAbsent(currentPage, key -> new ArrayList<>());

            for (TextPosition position : textPositions) {
                PDFont font = position.getFont();
                String fontId = registerFont(font);
                PdfJsonTextElement element = new PdfJsonTextElement();
                element.setText(position.getUnicode());
                element.setFontId(fontId);
                element.setFontSize(position.getFontSizeInPt());
                element.setFontSizeInPt(position.getFontSizeInPt());
                element.setX(position.getXDirAdj());
                element.setY(position.getYDirAdj());
                element.setWidth(position.getWidthDirAdj());
                element.setHeight(position.getHeightDir());
                element.setTextMatrix(extractMatrix(position));
                element.setFontMatrixSize(computeFontMatrixSize(element.getTextMatrix()));
                element.setSpaceWidth(position.getWidthOfSpace());
                PDGraphicsState graphicsState = getGraphicsState();
                if (graphicsState != null) {
                    PDTextState textState = graphicsState.getTextState();
                    if (textState != null) {
                        element.setCharacterSpacing(textState.getCharacterSpacing());
                        element.setWordSpacing(textState.getWordSpacing());
                        element.setHorizontalScaling(textState.getHorizontalScaling());
                        element.setLeading(textState.getLeading());
                        element.setRise(textState.getRise());
                        if (textState.getRenderingMode() != null) {
                            element.setRenderingMode(textState.getRenderingMode().intValue());
                        }
                    }
                    element.setFillColor(toTextColor(graphicsState.getNonStrokingColor()));
                    element.setStrokeColor(toTextColor(graphicsState.getStrokingColor()));
                }
                element.setZOrder(1_000_000 + pageElements.size());
                pageElements.add(element);
            }
        }

        private List<Float> extractMatrix(TextPosition position) {
            float[] values = new float[6];
            values[0] = position.getTextMatrix().getValue(0, 0);
            values[1] = position.getTextMatrix().getValue(0, 1);
            values[2] = position.getTextMatrix().getValue(1, 0);
            values[3] = position.getTextMatrix().getValue(1, 1);
            values[4] = position.getTextMatrix().getValue(2, 0);
            values[5] = position.getTextMatrix().getValue(2, 1);
            List<Float> matrix = new ArrayList<>(6);
            for (float value : values) {
                matrix.add(value);
            }
            return matrix;
        }

        private Float computeFontMatrixSize(List<Float> matrix) {
            if (matrix == null || matrix.size() < 4) {
                return null;
            }
            float a = matrix.get(0);
            float b = matrix.get(1);
            float c = matrix.get(2);
            float d = matrix.get(3);
            float scaleX = (float) Math.hypot(a, c);
            float scaleY = (float) Math.hypot(b, d);
            float scale = Math.max(scaleX, scaleY);
            return scale > 0 ? scale : null;
        }

        private String registerFont(PDFont font) throws IOException {
            String fontId = currentFontResources.get(font);
            if (fontId == null || fontId.isBlank()) {
                fontId = font.getName();
            }
            String key = buildFontKey(currentPage, fontId);
            if (!fonts.containsKey(key)) {
                fonts.put(key, buildFontModel(document, font, fontId, currentPage));
            }
            return fontId;
        }

        private PdfJsonTextColor toTextColor(PDColor color) {
            if (color == null) {
                return null;
            }
            PDColorSpace colorSpace = color.getColorSpace();
            if (colorSpace == null) {
                return null;
            }
            float[] components = color.getComponents();
            List<Float> values = new ArrayList<>(components.length);
            for (float component : components) {
                values.add(component);
            }
            return PdfJsonTextColor.builder()
                    .colorSpace(colorSpace.getName())
                    .components(values)
                    .build();
        }
    }

    private RenderingMode toRenderingMode(Integer renderingMode) {
        if (renderingMode == null) {
            return null;
        }
        switch (renderingMode) {
            case 0:
                return RenderingMode.FILL;
            case 1:
                return RenderingMode.STROKE;
            case 2:
                return RenderingMode.FILL_STROKE;
            case 3:
                return RenderingMode.NEITHER;
            case 4:
                return RenderingMode.FILL_CLIP;
            case 5:
                return RenderingMode.STROKE_CLIP;
            case 6:
                return RenderingMode.FILL_STROKE_CLIP;
            case 7:
                return RenderingMode.NEITHER_CLIP;
            default:
                return null;
        }
    }
}
