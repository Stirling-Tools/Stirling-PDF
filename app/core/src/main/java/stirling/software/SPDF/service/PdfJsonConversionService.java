package stirling.software.SPDF.service;

import static stirling.software.SPDF.service.PdfJsonFallbackFontService.FALLBACK_FONT_ID;

import java.awt.geom.AffineTransform;
import java.awt.geom.Point2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Calendar;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
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
import java.util.function.Consumer;
import java.util.stream.Collectors;

import javax.imageio.ImageIO;

import org.apache.pdfbox.contentstream.PDFGraphicsStreamEngine;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.contentstream.operator.OperatorName;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
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
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.pdmodel.graphics.color.PDColorSpace;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
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
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.PdfJsonConversionProgress;
import stirling.software.SPDF.model.json.PdfJsonAnnotation;
import stirling.software.SPDF.model.json.PdfJsonCosValue;
import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonDocumentMetadata;
import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonFontCidSystemInfo;
import stirling.software.SPDF.model.json.PdfJsonFontConversionCandidate;
import stirling.software.SPDF.model.json.PdfJsonFontConversionStatus;
import stirling.software.SPDF.model.json.PdfJsonFontType3Glyph;
import stirling.software.SPDF.model.json.PdfJsonFormField;
import stirling.software.SPDF.model.json.PdfJsonImageElement;
import stirling.software.SPDF.model.json.PdfJsonMetadata;
import stirling.software.SPDF.model.json.PdfJsonPage;
import stirling.software.SPDF.model.json.PdfJsonPageDimension;
import stirling.software.SPDF.model.json.PdfJsonStream;
import stirling.software.SPDF.model.json.PdfJsonTextColor;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.SPDF.service.pdfjson.PdfJsonFontService;
import stirling.software.SPDF.service.pdfjson.type3.Type3ConversionRequest;
import stirling.software.SPDF.service.pdfjson.type3.Type3FontConversionService;
import stirling.software.SPDF.service.pdfjson.type3.Type3GlyphExtractor;
import stirling.software.SPDF.service.pdfjson.type3.model.Type3GlyphOutline;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.TaskManager;
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
    private final EndpointConfiguration endpointConfiguration;
    private final TempFileManager tempFileManager;
    private final TaskManager taskManager;
    private final PdfJsonCosMapper cosMapper;
    private final PdfJsonFallbackFontService fallbackFontService;
    private final PdfJsonFontService fontService;
    private final Type3FontConversionService type3FontConversionService;
    private final Type3GlyphExtractor type3GlyphExtractor;
    private final stirling.software.common.model.ApplicationProperties applicationProperties;
    private final Map<String, PDFont> type3NormalizedFontCache = new ConcurrentHashMap<>();
    private final Map<String, Set<Integer>> type3GlyphCoverageCache = new ConcurrentHashMap<>();

    private boolean fontNormalizationEnabled;
    private long cacheMaxBytes;
    private int cacheMaxPercent;

    /** Cache for storing PDDocuments for lazy page loading. Key is jobId. */
    private final Map<String, CachedPdfDocument> documentCache = new ConcurrentHashMap<>();

    private final java.util.LinkedHashMap<String, CachedPdfDocument> lruCache =
            new java.util.LinkedHashMap<>(16, 0.75f, true);
    private final Object cacheLock = new Object();
    private volatile long currentCacheBytes = 0L;
    private volatile long cacheBudgetBytes = -1L;

    private volatile boolean ghostscriptAvailable;

    private static final float FLOAT_EPSILON = 0.0001f;
    private static final float ORIENTATION_TOLERANCE = 0.0005f;
    private static final float BASELINE_TOLERANCE = 0.5f;

    @PostConstruct
    private void initializeToolAvailability() {
        loadConfigurationFromProperties();
        initializeGhostscriptAvailability();
        initializeCacheBudget();
    }

    private void loadConfigurationFromProperties() {
        stirling.software.common.model.ApplicationProperties.PdfEditor cfg =
                applicationProperties.getPdfEditor();
        if (cfg != null) {
            fontNormalizationEnabled = cfg.getFontNormalization().isEnabled();
            cacheMaxBytes = cfg.getCache().getMaxBytes();
            cacheMaxPercent = cfg.getCache().getMaxPercent();
        } else {
            fontNormalizationEnabled = false;
            cacheMaxBytes = -1;
            cacheMaxPercent = 20;
        }
    }

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

    private void initializeCacheBudget() {
        long effective = -1L;
        if (cacheMaxBytes > 0) {
            effective = cacheMaxBytes;
        } else if (cacheMaxPercent > 0) {
            long maxMem = Runtime.getRuntime().maxMemory();
            effective = Math.max(0L, (maxMem * cacheMaxPercent) / 100);
        }
        cacheBudgetBytes = effective;
        if (cacheBudgetBytes > 0) {
            log.debug(
                    "PDF JSON cache budget configured: {} bytes (source: {})",
                    cacheBudgetBytes,
                    cacheMaxBytes > 0 ? "max-bytes" : "max-percent");
        } else {
            log.debug("PDF JSON cache budget: unlimited");
        }
    }

    public byte[] convertPdfToJson(MultipartFile file) throws IOException {
        return convertPdfToJson(file, null, false);
    }

    public byte[] convertPdfToJson(MultipartFile file, boolean lightweight) throws IOException {
        return convertPdfToJson(file, null, lightweight);
    }

    public byte[] convertPdfToJson(
            MultipartFile file, Consumer<PdfJsonConversionProgress> progressCallback)
            throws IOException {
        return convertPdfToJson(file, progressCallback, false);
    }

    public byte[] convertPdfToJson(
            MultipartFile file,
            Consumer<PdfJsonConversionProgress> progressCallback,
            boolean lightweight)
            throws IOException {
        if (file == null) {
            throw ExceptionUtils.createNullArgumentException("fileInput");
        }

        // Get job ID from request context if running in async mode
        String contextJobId = getJobIdFromRequest();
        boolean isRealJobId = (contextJobId != null && !contextJobId.isEmpty());

        // Generate synthetic jobId for synchronous conversions to prevent cache collisions
        final String jobId;
        if (!isRealJobId) {
            jobId = "pdf2json:" + java.util.UUID.randomUUID().toString();
            log.debug("Generated synthetic jobId for synchronous conversion: {}", jobId);
        } else {
            jobId = contextJobId;
            log.info(
                    "Starting PDF to JSON conversion, jobId from context: {} (lightweight={})",
                    jobId,
                    lightweight);
        }

        Consumer<PdfJsonConversionProgress> progress =
                progressCallback != null
                        ? (p) -> {
                            log.debug(
                                    "Progress: [{}%] {} - {}{}",
                                    p.getPercent(),
                                    p.getStage(),
                                    p.getMessage(),
                                    (p.getCurrent() != null && p.getTotal() != null)
                                            ? String.format(
                                                    " (%d/%d)", p.getCurrent(), p.getTotal())
                                            : "");
                            progressCallback.accept(p);
                        }
                        : isRealJobId
                                ? (p) -> {
                                    log.debug(
                                            "Progress: [{}%] {} - {}{}",
                                            p.getPercent(),
                                            p.getStage(),
                                            p.getMessage(),
                                            (p.getCurrent() != null && p.getTotal() != null)
                                                    ? String.format(
                                                            " (%d/%d)",
                                                            p.getCurrent(), p.getTotal())
                                                    : "");
                                    reportProgressToTaskManager(jobId, p);
                                }
                                : (p) -> {
                                    log.debug(
                                            "Progress (no job): [{}%] {} - {}{}",
                                            p.getPercent(),
                                            p.getStage(),
                                            p.getMessage(),
                                            (p.getCurrent() != null && p.getTotal() != null)
                                                    ? String.format(
                                                            " (%d/%d)",
                                                            p.getCurrent(), p.getTotal())
                                                    : "");
                                };

        TempFile normalizedFile = null;
        try (TempFile originalFile = new TempFile(tempFileManager, ".pdf")) {
            progress.accept(PdfJsonConversionProgress.of(5, "loading", "Loading PDF document"));
            file.transferTo(originalFile.getFile());
            Path workingPath = originalFile.getPath();

            if (fontNormalizationEnabled && canRunGhostscript()) {
                try {
                    progress.accept(
                            PdfJsonConversionProgress.of(
                                    10, "normalizing", "Normalizing fonts with Ghostscript"));
                    normalizedFile = normalizePdfFonts(workingPath);
                    if (normalizedFile != null && normalizedFile.exists()) {
                        workingPath = normalizedFile.getPath();
                        log.debug("Using Ghostscript-normalized PDF for JSON export");
                    }
                } catch (IOException ex) {
                    log.warn(
                            "Ghostscript font normalization failed ({}); using original PDF",
                            ex.getMessage());
                    closeQuietly(normalizedFile);
                    normalizedFile = null;
                }
            }

            progress.accept(PdfJsonConversionProgress.of(20, "parsing", "Parsing PDF structure"));

            byte[] cachedPdfBytes = null;

            // Pre-read file bytes before loading PDDocument, since loading may delete the file
            // (small files get loaded into memory and original is deleted)
            // This is needed for lazy image caching where we need the bytes later
            if (Files.size(workingPath) <= CustomPDFDocumentFactory.SMALL_FILE_THRESHOLD) {
                cachedPdfBytes = Files.readAllBytes(workingPath);
            }

            try (PDDocument document = pdfDocumentFactory.load(workingPath, true)) {
                int totalPages = document.getNumberOfPages();
                // Always enable lazy mode for real async jobs so cache is available regardless of
                // page count. Synchronous calls with synthetic jobId still do full extraction.
                boolean useLazyImages = isRealJobId;
                Map<COSBase, FontModelCacheEntry> fontCache = new IdentityHashMap<>();
                Map<COSBase, EncodedImage> imageCache = new IdentityHashMap<>();
                log.debug(
                        "Converting PDF to JSON ({} pages) - {} mode (jobId: {}, isRealJobId: {})",
                        totalPages,
                        useLazyImages ? "lazy image" : "standard",
                        jobId,
                        isRealJobId);
                Map<String, PdfJsonFont> fonts = new LinkedHashMap<>();
                Map<Integer, List<PdfJsonTextElement>> textByPage = new LinkedHashMap<>();
                Map<Integer, Map<PDFont, String>> pageFontResources = new HashMap<>();

                progress.accept(
                        PdfJsonConversionProgress.of(30, "fonts", "Collecting font information"));
                int pageNumber = 1;
                for (PDPage page : document.getPages()) {
                    Map<PDFont, String> resourceMap =
                            collectFontsForPage(
                                    document, page, pageNumber, fonts, fontCache, jobId);
                    pageFontResources.put(pageNumber, resourceMap);
                    log.debug(
                            "PDF->JSON: collected {} font resources on page {}",
                            resourceMap.size(),
                            pageNumber);

                    // Update progress for font collection (30-50%)
                    int fontProgress = 30 + (int) ((pageNumber / (double) totalPages) * 20);
                    progress.accept(
                            PdfJsonConversionProgress.of(
                                    fontProgress,
                                    "fonts",
                                    "Collecting fonts",
                                    pageNumber,
                                    totalPages));
                    pageNumber++;
                }

                progress.accept(
                        PdfJsonConversionProgress.of(50, "text", "Extracting text content"));
                TextCollectingStripper stripper =
                        new TextCollectingStripper(
                                document, fonts, textByPage, pageFontResources, fontCache, jobId);
                stripper.setSortByPosition(true);
                stripper.getText(document);

                Map<Integer, List<PdfJsonImageElement>> imagesByPage;
                if (useLazyImages) {
                    progress.accept(
                            PdfJsonConversionProgress.of(
                                    70, "images", "Skipping upfront image extraction"));
                    imagesByPage = new LinkedHashMap<>();
                } else {
                    progress.accept(
                            PdfJsonConversionProgress.of(
                                    70, "images", "Extracting embedded images"));
                    imagesByPage = collectImages(document, totalPages, progress, imageCache);
                }

                progress.accept(
                        PdfJsonConversionProgress.of(
                                80, "annotations", "Collecting annotations and form fields"));
                boolean includeAnnotationRawData = !(lightweight && isRealJobId);
                Map<Integer, List<PdfJsonAnnotation>> annotationsByPage =
                        collectAnnotations(document, totalPages, progress, includeAnnotationRawData);

                progress.accept(
                        PdfJsonConversionProgress.of(90, "metadata", "Extracting metadata"));
                PdfJsonDocument pdfJson = new PdfJsonDocument();
                pdfJson.setMetadata(extractMetadata(document));
                pdfJson.setXmpMetadata(extractXmpMetadata(document));
                pdfJson.setLazyImages(useLazyImages);
                List<PdfJsonFont> serializedFonts = cloneFontList(fonts.values());
                serializedFonts.sort(
                        Comparator.comparing(
                                PdfJsonFont::getUid,
                                Comparator.nullsLast(Comparator.naturalOrder())));
                dedupeFontPayloads(serializedFonts);
                pdfJson.setFonts(serializedFonts);
                pdfJson.setPages(
                        extractPages(
                                document,
                                textByPage,
                                imagesByPage,
                                annotationsByPage,
                                lightweight && isRealJobId));
                pdfJson.setFormFields(collectFormFields(document));

                // Only cache for real async jobIds, not synthetic synchronous ones
                if (useLazyImages && isRealJobId) {
                    log.debug(
                            "Creating cache for jobId: {} (useLazyImages={}, isRealJobId={})",
                            jobId,
                            useLazyImages,
                            isRealJobId);
                    PdfJsonDocumentMetadata docMetadata = new PdfJsonDocumentMetadata();
                    docMetadata.setMetadata(pdfJson.getMetadata());
                    docMetadata.setXmpMetadata(pdfJson.getXmpMetadata());
                    docMetadata.setFonts(serializedFonts);
                    docMetadata.setFormFields(pdfJson.getFormFields());
                    docMetadata.setLazyImages(Boolean.TRUE);

                    List<PdfJsonPageDimension> pageDimensions = new ArrayList<>();
                    int pageIndex = 0;
                    for (PDPage page : document.getPages()) {
                        PdfJsonPageDimension dim = new PdfJsonPageDimension();
                        dim.setPageNumber(pageIndex + 1);
                        // Use CropBox if present (defines visible page area), otherwise fall back
                        // to MediaBox
                        PDRectangle pageBox = page.getCropBox();
                        if (pageBox == null
                                || pageBox.getWidth() == 0
                                || pageBox.getHeight() == 0) {
                            pageBox = page.getMediaBox();
                        }
                        dim.setWidth(pageBox.getWidth());
                        dim.setHeight(pageBox.getHeight());
                        dim.setRotation(page.getRotation());
                        pageDimensions.add(dim);
                        pageIndex++;
                    }
                    docMetadata.setPageDimensions(pageDimensions);

                    if (cachedPdfBytes == null) {
                        cachedPdfBytes = Files.readAllBytes(workingPath);
                    }
                    CachedPdfDocument cached =
                            buildCachedDocument(
                                    jobId, cachedPdfBytes, docMetadata, fonts, pageFontResources);
                    putCachedDocument(jobId, cached);
                    log.info(
                            "Successfully cached PDF ({} bytes, {} pages, {} fonts) for jobId: {} (diskBacked={})",
                            cached.getPdfSize(),
                            totalPages,
                            fonts.size(),
                            jobId,
                            cached.isDiskBacked());
                    scheduleDocumentCleanup(jobId);
                } else {
                    log.warn(
                            "Skipping cache creation: useLazyImages={}, isRealJobId={}, jobId={}",
                            useLazyImages,
                            isRealJobId,
                            jobId);
                }

                if (lightweight) {
                    applyLightweightTransformations(pdfJson);
                }
                if (lightweight && isRealJobId) {
                    stripFontCosStreamData(serializedFonts);
                }

                logFontPayloadStats(serializedFonts, "pdf/text-editor");
                analyzePdfJson(pdfJson, "pdf/text-editor");

                progress.accept(
                        PdfJsonConversionProgress.of(95, "serializing", "Generating JSON output"));

                // Collect font issues for summary
                java.util.List<String> fontsWithMissingProgram =
                        serializedFonts.stream()
                                .filter(
                                        f ->
                                                Boolean.TRUE.equals(f.getEmbedded())
                                                        && !(hasPayload(f.getProgram())
                                                                || hasPayload(f.getPdfProgram())
                                                                || hasPayload(f.getWebProgram())))
                                .map(
                                        f -> {
                                            String name =
                                                    f.getBaseName() != null
                                                            ? f.getBaseName()
                                                            : "Unknown";
                                            String subtype =
                                                    f.getSubtype() != null
                                                            ? f.getSubtype()
                                                            : "Unknown";
                                            // Clean up subset prefix (e.g., "ABCDEF+TimesNewRoman"
                                            // -> "TimesNewRoman")
                                            String cleanName = name.replaceAll("^[A-Z]{6}\\+", "");
                                            return String.format("%s (%s)", cleanName, subtype);
                                        })
                                .collect(java.util.stream.Collectors.toList());
                long type3Fonts =
                        serializedFonts.stream()
                                .filter(f -> "Type3".equals(f.getSubtype()))
                                .count();

                if (!fontsWithMissingProgram.isEmpty()) {
                    log.warn(
                            "PDF->JSON conversion complete: {} fonts ({} Type3), {} pages. Missing font programs for {} embedded font(s): {}",
                            serializedFonts.size(),
                            type3Fonts,
                            pdfJson.getPages().size(),
                            fontsWithMissingProgram.size(),
                            String.join(", ", fontsWithMissingProgram));
                } else {
                    log.info(
                            "PDF->JSON conversion complete: {} fonts ({} Type3), {} pages",
                            serializedFonts.size(),
                            type3Fonts,
                            pdfJson.getPages().size());
                }

                byte[] result = objectMapper.writeValueAsBytes(pdfJson);
                progress.accept(PdfJsonConversionProgress.complete());

                // Clear Type3 cache entries immediately for non-cached conversions
                // Cached conversions (useLazyImages=true) are cleaned when cache expires
                // Synchronous conversions always clear immediately since they don't use lazy mode
                if (!useLazyImages) {
                    clearType3CacheEntriesForJob(jobId);
                }

                return result;
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

        // Generate synthetic jobId for this JSON->PDF conversion to prevent cache collisions
        // Each conversion gets its own namespace for Type3 font caching
        String syntheticJobId = "json2pdf:" + java.util.UUID.randomUUID().toString();

        try (PDDocument document = new PDDocument()) {
            applyMetadata(document, pdfJson.getMetadata());
            applyXmpMetadata(document, pdfJson.getXmpMetadata());

            Map<String, PDFont> fontMap = buildFontMap(document, fontModels, syntheticJobId);
            log.debug("Converting JSON to PDF ({} font resources)", fontMap.size());

            Map<String, PdfJsonFont> fontLookup = buildFontModelLookup(fontModels);

            List<PdfJsonPage> pages = pdfJson.getPages();
            if (pages == null) {
                pages = new ArrayList<>();
            }

            int pageIndex = 0;
            Set<String> allFallbackFontIds = new java.util.HashSet<>();
            int pagesWithFallbacks = 0;
            for (PdfJsonPage pageModel : pages) {
                int pageNumberValue =
                        pageModel.getPageNumber() != null
                                ? pageModel.getPageNumber()
                                : pageIndex + 1;
                log.debug("Reconstructing page {}", pageNumberValue);
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

                fontLookup = buildFontModelLookup(fontModels);

                log.debug(
                        "Page {} preflight complete (elements={}, fallbackApplied={})",
                        pageNumberValue,
                        elements.size(),
                        preflightResult.usesFallback());

                if (!preflightResult.fallbackFontIds().isEmpty()) {
                    ensureFallbackResources(page, preflightResult.fallbackFontIds(), fontMap);
                    allFallbackFontIds.addAll(preflightResult.fallbackFontIds());
                    pagesWithFallbacks++;
                    log.debug(
                            "Page {} registered fallback fonts: {}",
                            pageNumberValue,
                            preflightResult.fallbackFontIds());
                }

                boolean hasText = !elements.isEmpty();
                boolean hasImages = !imageElements.isEmpty();
                boolean rewriteSucceeded = true;

                if (hasText) {
                    if (preflightResult.usesFallback()) {
                        log.debug(
                                "Skipping token rewrite for page {} because fallback fonts are required",
                                pageNumberValue);
                        rewriteSucceeded = false;
                    } else if (!preservedStreams.isEmpty()) {
                        log.debug("Attempting token rewrite for page {}", pageNumberValue);
                        rewriteSucceeded =
                                rewriteTextOperators(
                                        document,
                                        page,
                                        elements,
                                        false,
                                        false,
                                        fontLookup,
                                        pageNumberValue);
                        if (!rewriteSucceeded) {
                            log.debug(
                                    "Token rewrite failed for page {}, regenerating text stream",
                                    pageNumberValue);
                        } else {
                            log.debug("Token rewrite succeeded for page {}", pageNumberValue);
                        }
                    } else {
                        rewriteSucceeded = false;
                    }
                }

                boolean shouldRegenerate = preservedStreams.isEmpty();
                if (hasText && (!rewriteSucceeded || preflightResult.usesFallback())) {
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
                    log.debug("Regenerating page content for page {}", pageNumberValue);
                    AppendMode appendMode = AppendMode.OVERWRITE;
                    if (!preservedStreams.isEmpty()) {
                        PDStream vectorStream =
                                extractVectorGraphics(document, preservedStreams, imageElements);
                        if (vectorStream != null) {
                            page.setContents(Collections.singletonList(vectorStream));
                            appendMode = AppendMode.APPEND;
                        } else {
                            page.setContents(new ArrayList<>());
                        }
                    }
                    regeneratePageContent(
                            document,
                            page,
                            elements,
                            imageElements,
                            fontMap,
                            fontModels,
                            pageNumberValue,
                            appendMode);
                    log.debug("Page content regeneration complete for page {}", pageNumberValue);
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

            // Log conversion summary
            if (!allFallbackFontIds.isEmpty()) {
                log.info(
                        "JSON->PDF conversion complete: {} pages, {} fallback font(s) used across {} page(s): {}",
                        pages.size(),
                        allFallbackFontIds.size(),
                        pagesWithFallbacks,
                        allFallbackFontIds);
            } else {
                log.info("JSON->PDF conversion complete: {} pages", pages.size());
            }

            try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                document.save(baos);
                byte[] result = baos.toByteArray();

                // Clear Type3 cache entries for this conversion
                clearType3CacheEntriesForJob(syntheticJobId);

                return result;
            }
        }
    }

    private Map<PDFont, String> collectFontsForPage(
            PDDocument document,
            PDPage page,
            int pageNumber,
            Map<String, PdfJsonFont> fonts,
            Map<COSBase, FontModelCacheEntry> fontCache,
            String jobId)
            throws IOException {
        Map<PDFont, String> mapping = new HashMap<>();
        Set<COSBase> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        collectFontsFromResources(
                document,
                page.getResources(),
                pageNumber,
                fonts,
                mapping,
                visited,
                "",
                fontCache,
                jobId);
        log.debug(
                "Page {} font scan complete (unique fonts discovered: {})",
                pageNumber,
                mapping.size());
        return mapping;
    }

    /**
     * Recursively collect fonts from a resource dictionary, including Form XObjects.
     *
     * @param document The PDF document
     * @param resources The resources to scan
     * @param pageNumber The page number (for font UID generation)
     * @param fonts The global font map to populate
     * @param mapping The page-level PDFont -> fontId mapping
     * @param visited Set of visited XObject names to prevent infinite recursion
     */
    private void collectFontsFromResources(
            PDDocument document,
            PDResources resources,
            int pageNumber,
            Map<String, PdfJsonFont> fonts,
            Map<PDFont, String> mapping,
            Set<COSBase> visited,
            String prefix,
            Map<COSBase, FontModelCacheEntry> fontCache,
            String jobId)
            throws IOException {
        if (resources == null) {
            log.debug(
                    "Page {} resource scan skipped{} (resources null)",
                    pageNumber,
                    prefix.isEmpty() ? "" : " under " + prefix);
            return;
        }
        if (!visited.add(resources.getCOSObject())) {
            return;
        }

        for (COSName resourceName : resources.getFontNames()) {
            PDFont font = resources.getFont(resourceName);
            if (font == null) {
                continue;
            }
            String fontId =
                    prefix.isEmpty()
                            ? resourceName.getName()
                            : prefix + "/" + resourceName.getName();
            mapping.put(font, fontId);
            String key = buildFontKey(jobId, pageNumber, fontId);
            if (!fonts.containsKey(key)) {
                fonts.put(
                        key, buildFontModel(document, font, fontId, pageNumber, fontCache, jobId));
            }
        }

        for (COSName xobjectName : resources.getXObjectNames()) {
            try {
                PDXObject xobject = resources.getXObject(xobjectName);
                if (xobject instanceof PDFormXObject form) {
                    collectFontsFromResources(
                            document,
                            form.getResources(),
                            pageNumber,
                            fonts,
                            mapping,
                            visited,
                            prefix.isEmpty()
                                    ? xobjectName.getName()
                                    : prefix + "/" + xobjectName.getName(),
                            fontCache,
                            jobId);
                }
            } catch (Exception ex) {
                log.debug(
                        "Failed to inspect XObject {} for fonts on page {}: {}",
                        xobjectName.getName(),
                        pageNumber,
                        ex.getMessage());
            }
        }
    }

    private String buildFontKey(String jobId, int pageNumber, String fontId) {
        // Include jobId to ensure font UIDs are globally unique across concurrent jobs
        String jobPrefix = (jobId != null && !jobId.isEmpty()) ? jobId + ":" : "";
        return jobPrefix + pageNumber + ":" + fontId;
    }

    private String buildFontKey(String jobId, Integer pageNumber, String fontId) {
        int page = pageNumber != null ? pageNumber : -1;
        return buildFontKey(jobId, page, fontId);
    }

    private String resolveFontCacheKey(PdfJsonFont font) {
        if (font == null) {
            return null;
        }
        if (font.getUid() != null && !font.getUid().isBlank()) {
            return font.getUid();
        }
        if (font.getId() == null) {
            return null;
        }
        // JSON->PDF conversion: no jobId context, pass null
        return buildFontKey(null, font.getPageNumber(), font.getId());
    }

    private Map<String, PdfJsonFont> buildFontModelLookup(List<PdfJsonFont> fontModels) {
        Map<String, PdfJsonFont> lookup = new HashMap<>();
        if (fontModels == null) {
            return lookup;
        }
        for (PdfJsonFont font : fontModels) {
            if (font == null || font.getId() == null) {
                continue;
            }
            // JSON->PDF conversion: no jobId context, pass null
            lookup.put(buildFontKey(null, font.getPageNumber(), font.getId()), font);
        }
        return lookup;
    }

    private PdfJsonFont resolveFontModel(
            Map<String, PdfJsonFont> lookup, int pageNumber, String fontId) {
        if (lookup == null || fontId == null) {
            return null;
        }
        // JSON->PDF conversion: no jobId context, pass null
        PdfJsonFont model = lookup.get(buildFontKey(null, pageNumber, fontId));
        if (model != null) {
            return model;
        }
        return lookup.get(buildFontKey(null, -1, fontId));
    }

    private List<PdfJsonFont> cloneFontList(Collection<PdfJsonFont> source) {
        List<PdfJsonFont> clones = new ArrayList<>();
        if (source == null) {
            return clones;
        }
        for (PdfJsonFont font : source) {
            PdfJsonFont copy = cloneFont(font);
            if (copy != null) {
                clones.add(copy);
            }
        }
        return clones;
    }

    private PdfJsonFont cloneFont(PdfJsonFont font) {
        if (font == null) {
            return null;
        }
        return PdfJsonFont.builder()
                .id(font.getId())
                .pageNumber(font.getPageNumber())
                .uid(font.getUid())
                .baseName(font.getBaseName())
                .subtype(font.getSubtype())
                .encoding(font.getEncoding())
                .cidSystemInfo(font.getCidSystemInfo())
                .embedded(font.getEmbedded())
                .program(font.getProgram())
                .programFormat(font.getProgramFormat())
                .webProgram(font.getWebProgram())
                .webProgramFormat(font.getWebProgramFormat())
                .pdfProgram(font.getPdfProgram())
                .pdfProgramFormat(font.getPdfProgramFormat())
                .type3Glyphs(
                        font.getType3Glyphs() == null
                                ? null
                                : new ArrayList<>(font.getType3Glyphs()))
                .conversionCandidates(
                        font.getConversionCandidates() == null
                                ? null
                                : new ArrayList<>(font.getConversionCandidates()))
                .toUnicode(font.getToUnicode())
                .standard14Name(font.getStandard14Name())
                .fontDescriptorFlags(font.getFontDescriptorFlags())
                .ascent(font.getAscent())
                .descent(font.getDescent())
                .capHeight(font.getCapHeight())
                .xHeight(font.getXHeight())
                .italicAngle(font.getItalicAngle())
                .unitsPerEm(font.getUnitsPerEm())
                .cosDictionary(font.getCosDictionary())
                .build();
    }

    private void applyLightweightTransformations(PdfJsonDocument document) {
        if (document == null) {
            return;
        }
        List<PdfJsonFont> fonts = document.getFonts();
        if (fonts == null) {
            return;
        }
        for (PdfJsonFont font : fonts) {
            if (font == null) {
                continue;
            }
            boolean hasUsableProgram =
                    hasPayload(font.getPdfProgram())
                            || hasPayload(font.getWebProgram())
                            || hasPayload(font.getProgram());

            // Only clear cosDictionary for Type3 fonts (which have inline content streams)
            // All other font types may need ToUnicode CMap or encoding from the dictionary
            // Conservative approach: better to keep extra data than lose encoding info
            String subtype = font.getSubtype();
            boolean isType3 = subtype != null && subtype.equalsIgnoreCase("Type3");

            if (hasUsableProgram && isType3) {
                font.setCosDictionary(null);
            }
        }
    }

    private boolean hasPayload(String value) {
        return value != null && !value.isBlank();
    }

    private PdfJsonFont buildFontModel(
            PDDocument document,
            PDFont font,
            String fontId,
            int pageNumber,
            Map<COSBase, FontModelCacheEntry> fontCache,
            String jobId)
            throws IOException {
        COSBase cosObject = font.getCOSObject();
        FontModelCacheEntry cacheEntry = fontCache.get(cosObject);
        if (cacheEntry == null) {
            cacheEntry = createFontCacheEntry(document, font, fontId, pageNumber, jobId);
            fontCache.put(cosObject, cacheEntry);
        }
        return toPdfJsonFont(cacheEntry, fontId, pageNumber, jobId);
    }

    private void logFontPayloadStats(List<PdfJsonFont> fonts, String label) {
        if (fonts == null || fonts.isEmpty()) {
            return;
        }
        long programBytes = 0;
        long webProgramBytes = 0;
        long pdfProgramBytes = 0;
        long toUnicodeBytes = 0;
        long maxFontPayload = 0;
        String maxFontId = null;

        for (PdfJsonFont font : fonts) {
            if (font == null) {
                continue;
            }
            long fontBytes = 0;
            if (font.getProgram() != null) {
                long len = font.getProgram().length();
                programBytes += len;
                fontBytes += len;
            }
            if (font.getWebProgram() != null) {
                long len = font.getWebProgram().length();
                webProgramBytes += len;
                fontBytes += len;
            }
            if (font.getPdfProgram() != null) {
                long len = font.getPdfProgram().length();
                pdfProgramBytes += len;
                fontBytes += len;
            }
            if (font.getToUnicode() != null) {
                long len = font.getToUnicode().length();
                toUnicodeBytes += len;
                fontBytes += len;
            }
            if (fontBytes > maxFontPayload) {
                maxFontPayload = fontBytes;
                maxFontId = font.getUid() != null ? font.getUid() : font.getId();
            }
        }

        log.debug(
                "Font payload stats ({}): fonts={}, programBytes={}, webProgramBytes={}, pdfProgramBytes={}, toUnicodeBytes={}, maxFontPayloadBytes={} (fontId={})",
                label,
                fonts.size(),
                programBytes,
                webProgramBytes,
                pdfProgramBytes,
                toUnicodeBytes,
                maxFontPayload,
                maxFontId);
    }

    private void analyzePdfJson(PdfJsonDocument pdfJson, String label) {
        if (!isPdfJsonDebugAnalyzeEnabled() || pdfJson == null) {
            return;
        }

        try {
            Map<String, DuplicateStats> resourceStats = new HashMap<>();
            Map<String, DuplicateStats> fontDictStats = new HashMap<>();
            Map<String, DuplicateStats> annotationStats = new HashMap<>();
            long imageDataBytes = 0;
            long imageCount = 0;
            long textElementCount = 0;
            long textCharCount = 0;

            List<PdfJsonPage> pages = pdfJson.getPages();
            if (pages != null) {
                for (PdfJsonPage page : pages) {
                    if (page == null) {
                        continue;
                    }
                    recordDuplicate(resourceStats, page.getResources());

                    List<PdfJsonAnnotation> annotations = page.getAnnotations();
                    if (annotations != null) {
                        for (PdfJsonAnnotation annotation : annotations) {
                            recordDuplicate(annotationStats, annotation.getRawData());
                        }
                    }

                    List<PdfJsonImageElement> images = page.getImageElements();
                    if (images != null) {
                        for (PdfJsonImageElement image : images) {
                            if (image == null) {
                                continue;
                            }
                            String data = image.getImageData();
                            if (data != null) {
                                imageDataBytes += data.length();
                            }
                            imageCount++;
                        }
                    }

                    List<PdfJsonTextElement> textElements = page.getTextElements();
                    if (textElements != null) {
                        for (PdfJsonTextElement element : textElements) {
                            if (element == null) {
                                continue;
                            }
                            textElementCount++;
                            String text = element.getText();
                            if (text != null) {
                                textCharCount += text.length();
                            }
                        }
                    }
                }
            }

            List<PdfJsonFont> fonts = pdfJson.getFonts();
            if (fonts != null) {
                for (PdfJsonFont font : fonts) {
                    recordDuplicate(fontDictStats, font.getCosDictionary());
                }
            }

            logDuplicateSummary("resources", label, resourceStats);
            logDuplicateSummary("fontCosDictionary", label, fontDictStats);
            logDuplicateSummary("annotationRawData", label, annotationStats);
            log.debug(
                    "PDF JSON analysis ({}): images={} imageDataBytes={} textElements={} textChars={}",
                    label,
                    imageCount,
                    imageDataBytes,
                    textElementCount,
                    textCharCount);

            long fontsBytes = sizeOfObject(pdfJson.getFonts());
            long pagesBytes = sizeOfObject(pdfJson.getPages());
            long metadataBytes = sizeOfObject(pdfJson.getMetadata());
            long xmpBytes = sizeOfObject(pdfJson.getXmpMetadata());
            long formFieldsBytes = sizeOfObject(pdfJson.getFormFields());
            log.debug(
                    "PDF JSON analysis ({}): sectionSizes fonts={} pages={} metadata={} xmp={} formFields={}",
                    label,
                    fontsBytes,
                    pagesBytes,
                    metadataBytes,
                    xmpBytes,
                    formFieldsBytes);

            if (pages != null && !pages.isEmpty()) {
                List<PageSizeStat> topPages = new ArrayList<>();
                int pageIndex = 0;
                for (PdfJsonPage page : pages) {
                    if (page == null) {
                        pageIndex++;
                        continue;
                    }
                    long size = sizeOfObject(page);
                    int pageNumber =
                            page.getPageNumber() != null ? page.getPageNumber() : pageIndex + 1;
                    topPages.add(new PageSizeStat(pageNumber, size, page));
                    pageIndex++;
                }
                topPages.sort((a, b) -> Long.compare(b.sizeBytes, a.sizeBytes));
                String top =
                        topPages.stream()
                                .limit(5)
                                .map(
                                        s ->
                                                String.format(
                                                        "page=%d size=%d", s.pageNumber, s.sizeBytes))
                                .collect(java.util.stream.Collectors.joining("; "));
                log.debug("PDF JSON analysis ({}): topPageSizes -> {}", label, top);

                topPages.stream()
                        .limit(3)
                        .forEach(
                                s -> {
                                    PdfJsonPage page = s.page;
                                    long resources = sizeOfObject(page.getResources());
                                    long contentStreams = sizeOfObject(page.getContentStreams());
                                    long annotations = sizeOfObject(page.getAnnotations());
                                    long textElements = sizeOfObject(page.getTextElements());
                                    long imageElements = sizeOfObject(page.getImageElements());
                                    log.debug(
                                            "PDF JSON analysis ({}): pageBreakdown page={} total={} resources={} contentStreams={} annotations={} textElements={} imageElements={}",
                                            label,
                                            s.pageNumber,
                                            s.sizeBytes,
                                            resources,
                                            contentStreams,
                                            annotations,
                                            textElements,
                                            imageElements);
                                });
            }
        } catch (Exception ex) {
            log.warn("PDF JSON analysis failed ({}): {}", label, ex.getMessage());
        }
    }

    private void recordDuplicate(Map<String, DuplicateStats> stats, PdfJsonCosValue value)
            throws IOException, java.security.NoSuchAlgorithmException {
        if (value == null) {
            return;
        }
        byte[] bytes = objectMapper.writeValueAsBytes(value);
        if (bytes.length == 0) {
            return;
        }
        String hash = Base64.getEncoder().encodeToString(
                java.security.MessageDigest.getInstance("SHA-256").digest(bytes));
        DuplicateStats entry = stats.computeIfAbsent(hash, k -> new DuplicateStats());
        entry.count++;
        if (entry.sizeBytes == 0) {
            entry.sizeBytes = bytes.length;
        }
    }

    private void logDuplicateSummary(
            String category, String label, Map<String, DuplicateStats> stats) {
        if (stats.isEmpty()) {
            return;
        }
        List<DuplicateStats> duplicates =
                stats.values().stream()
                        .filter(s -> s.count > 1)
                        .sorted(
                                (a, b) ->
                                        Long.compare(
                                                b.totalBytesSaved(), a.totalBytesSaved()))
                        .limit(5)
                        .toList();

        if (duplicates.isEmpty()) {
            return;
        }

        String summary =
                duplicates.stream()
                        .map(
                                s ->
                                        String.format(
                                                "count=%d size=%d potentialSavings=%d",
                                                s.count, s.sizeBytes, s.totalBytesSaved()))
                        .collect(java.util.stream.Collectors.joining("; "));
        log.debug(
                "PDF JSON analysis ({}): top duplicates for {} -> {}",
                label,
                category,
                summary);
    }

    private boolean isPdfJsonDebugAnalyzeEnabled() {
        String env = System.getenv("SPDF_PDFJSON_ANALYZE");
        if (env != null && env.equalsIgnoreCase("true")) {
            return true;
        }
        return Boolean.getBoolean("spdf.pdfjson.analyze");
    }

    private long sizeOfObject(Object value) {
        if (value == null) {
            return 0;
        }
        try {
            return objectMapper.writeValueAsBytes(value).length;
        } catch (Exception ex) {
            log.warn("Failed to serialize object for size analysis: {}", ex.getMessage());
            return -1;
        }
    }

    private static final class DuplicateStats {
        private int count;
        private long sizeBytes;

        private long totalBytesSaved() {
            return sizeBytes * (long) (count - 1);
        }
    }

    private static final class PageSizeStat {
        private final int pageNumber;
        private final long sizeBytes;
        private final PdfJsonPage page;

        private PageSizeStat(int pageNumber, long sizeBytes, PdfJsonPage page) {
            this.pageNumber = pageNumber;
            this.sizeBytes = sizeBytes;
            this.page = page;
        }
    }

    private void dedupeFontPayloads(List<PdfJsonFont> fonts) {
        if (fonts == null || fonts.isEmpty()) {
            return;
        }
        for (PdfJsonFont font : fonts) {
            if (font == null) {
                continue;
            }
            String program = font.getProgram();
            String pdfProgram = font.getPdfProgram();
            String webProgram = font.getWebProgram();

            if (pdfProgram != null && !pdfProgram.isBlank()) {
                if (program != null && program.equals(pdfProgram)) {
                    font.setProgram(null);
                    font.setProgramFormat(null);
                }
                if (webProgram != null && webProgram.equals(pdfProgram)) {
                    font.setWebProgram(null);
                    font.setWebProgramFormat(null);
                }
                continue;
            }

            if (program != null && webProgram != null && program.equals(webProgram)) {
                font.setWebProgram(null);
                font.setWebProgramFormat(null);
            }
        }
    }

    private void stripFontCosStreamData(List<PdfJsonFont> fonts) {
        if (fonts == null || fonts.isEmpty()) {
            return;
        }
        Set<PdfJsonCosValue> visited =
                Collections.newSetFromMap(new IdentityHashMap<>());
        for (PdfJsonFont font : fonts) {
            if (font == null) {
                continue;
            }
            PdfJsonCosValue cosDictionary = font.getCosDictionary();
            if (cosDictionary != null) {
                stripStreamRawData(cosDictionary, visited);
            }
        }
    }

    private void stripStreamRawData(PdfJsonCosValue value, Set<PdfJsonCosValue> visited) {
        if (value == null || value.getType() == null) {
            return;
        }
        if (!visited.add(value)) {
            return;
        }
        switch (value.getType()) {
            case STREAM:
                if (value.getStream() != null) {
                    value.getStream().setRawData(null);
                }
                break;
            case ARRAY:
                if (value.getItems() != null) {
                    for (PdfJsonCosValue item : value.getItems()) {
                        stripStreamRawData(item, visited);
                    }
                }
                break;
            case DICTIONARY:
                if (value.getEntries() != null) {
                    for (PdfJsonCosValue entry : value.getEntries().values()) {
                        stripStreamRawData(entry, visited);
                    }
                }
                break;
            default:
                break;
        }
    }

    private FontModelCacheEntry createFontCacheEntry(
            PDDocument document, PDFont font, String fontId, int pageNumber, String jobId)
            throws IOException {
        PDFontDescriptor descriptor = font.getFontDescriptor();
        String subtype = font.getCOSObject().getNameAsString(COSName.SUBTYPE);
        String encoding = resolveEncoding(font);
        PdfJsonFontCidSystemInfo cidInfo = extractCidSystemInfo(font.getCOSObject());
        boolean embedded = font.isEmbedded();
        String toUnicode = extractToUnicode(font.getCOSObject());
        String unicodeMapping = buildUnicodeMapping(font, toUnicode);
        FontProgramData programData = embedded ? extractFontProgram(font, unicodeMapping) : null;
        String standard14Name = resolveStandard14Name(font);
        Integer flags = descriptor != null ? descriptor.getFlags() : null;
        Float ascent = descriptor != null ? descriptor.getAscent() : null;
        Float descent = descriptor != null ? descriptor.getDescent() : null;
        Float capHeight = descriptor != null ? descriptor.getCapHeight() : null;
        Float xHeight = descriptor != null ? descriptor.getXHeight() : null;
        Float italicAngle = descriptor != null ? descriptor.getItalicAngle() : null;
        Integer unitsPerEm = extractUnitsPerEm(font);
        PdfJsonCosValue cosDictionary = cosMapper.serializeCosValue(font.getCOSObject());
        List<PdfJsonFontConversionCandidate> conversionCandidates = null;
        List<PdfJsonFontType3Glyph> type3Glyphs = null;
        String fontUid = buildFontKey(jobId, pageNumber, fontId);
        if (font instanceof PDType3Font type3Font) {
            try {
                conversionCandidates =
                        type3FontConversionService.synthesize(
                                Type3ConversionRequest.builder()
                                        .document(document)
                                        .font(type3Font)
                                        .fontId(fontId)
                                        .pageNumber(pageNumber)
                                        .fontUid(fontUid)
                                        .build());
                if (conversionCandidates != null && conversionCandidates.isEmpty()) {
                    conversionCandidates = null;
                }
                try {
                    List<Type3GlyphOutline> outlines =
                            type3GlyphExtractor.extractGlyphs(
                                    document, type3Font, fontId, pageNumber);
                    if (outlines != null && !outlines.isEmpty()) {
                        type3Glyphs =
                                outlines.stream()
                                        .map(
                                                outline ->
                                                        PdfJsonFontType3Glyph.builder()
                                                                .charCode(outline.getCharCode())
                                                                .charCodeRaw(
                                                                        outline.getCharCode() >= 0
                                                                                ? outline
                                                                                        .getCharCode()
                                                                                : null)
                                                                .glyphName(outline.getGlyphName())
                                                                .unicode(outline.getUnicode())
                                                                .build())
                                        .collect(Collectors.toList());
                    }
                } catch (Exception ex) {
                    log.debug(
                            "[TYPE3] Failed to extract glyph metadata for {} (page {}): {}",
                            fontId,
                            pageNumber,
                            ex.getMessage());
                }
            } catch (Exception ex) {
                log.warn(
                        "[TYPE3] Failed to evaluate conversion strategies for {} (page {}): {}",
                        fontId,
                        pageNumber,
                        ex.getMessage(),
                        ex);
            }
            registerType3GlyphCoverage(fontUid, conversionCandidates, type3Glyphs);
        }

        return new FontModelCacheEntry(
                font.getName(),
                subtype,
                encoding,
                cidInfo,
                Boolean.valueOf(embedded),
                programData,
                toUnicode,
                standard14Name,
                flags,
                ascent,
                descent,
                capHeight,
                xHeight,
                italicAngle,
                unitsPerEm,
                cosDictionary,
                type3Glyphs,
                conversionCandidates);
    }

    private PdfJsonFont toPdfJsonFont(
            FontModelCacheEntry cacheEntry, String fontId, int pageNumber, String jobId) {
        FontProgramData programData = cacheEntry.programData();
        return PdfJsonFont.builder()
                .id(fontId)
                .pageNumber(pageNumber)
                .uid(buildFontKey(jobId, pageNumber, fontId))
                .baseName(cacheEntry.baseName())
                .subtype(cacheEntry.subtype())
                .encoding(cacheEntry.encoding())
                .cidSystemInfo(cacheEntry.cidSystemInfo())
                .embedded(cacheEntry.embedded())
                .program(programData != null ? programData.getBase64() : null)
                .programFormat(programData != null ? programData.getFormat() : null)
                .webProgram(programData != null ? programData.getWebBase64() : null)
                .webProgramFormat(programData != null ? programData.getWebFormat() : null)
                .pdfProgram(programData != null ? programData.getPdfBase64() : null)
                .pdfProgramFormat(programData != null ? programData.getPdfFormat() : null)
                .type3Glyphs(cacheEntry.type3Glyphs())
                .conversionCandidates(cacheEntry.conversionCandidates())
                .toUnicode(cacheEntry.toUnicode())
                .standard14Name(cacheEntry.standard14Name())
                .fontDescriptorFlags(cacheEntry.fontDescriptorFlags())
                .ascent(cacheEntry.ascent())
                .descent(cacheEntry.descent())
                .capHeight(cacheEntry.capHeight())
                .xHeight(cacheEntry.xHeight())
                .italicAngle(cacheEntry.italicAngle())
                .unitsPerEm(cacheEntry.unitsPerEm())
                .cosDictionary(cacheEntry.cosDictionary())
                .build();
    }

    private record FontByteSource(byte[] bytes, String format, String originLabel) {}

    private List<FontByteSource> collectConversionCandidateSources(
            List<PdfJsonFontConversionCandidate> conversionCandidates) {
        if (conversionCandidates == null || conversionCandidates.isEmpty()) {
            return Collections.emptyList();
        }
        List<PdfJsonFontConversionCandidate> prioritized = new ArrayList<>();
        for (PdfJsonFontConversionCandidate candidate : conversionCandidates) {
            if (candidate == null) {
                continue;
            }
            PdfJsonFontConversionStatus status = candidate.getStatus();
            if (status == PdfJsonFontConversionStatus.SUCCESS
                    || status == PdfJsonFontConversionStatus.WARNING) {
                prioritized.add(candidate);
            }
        }
        if (prioritized.isEmpty()) {
            return Collections.emptyList();
        }
        prioritized.sort(
                Comparator.comparingInt(
                        c ->
                                conversionStatusPriority(
                                        c.getStatus() != null
                                                ? c.getStatus()
                                                : PdfJsonFontConversionStatus.FAILURE)));

        List<FontByteSource> sources = new ArrayList<>();
        for (PdfJsonFontConversionCandidate candidate : prioritized) {
            addCandidatePayload(
                    sources,
                    candidate.getPdfProgram(),
                    candidate.getPdfProgramFormat(),
                    candidate,
                    "pdfProgram");
            addCandidatePayload(
                    sources,
                    candidate.getProgram(),
                    candidate.getProgramFormat(),
                    candidate,
                    "program");
            addCandidatePayload(
                    sources,
                    candidate.getWebProgram(),
                    candidate.getWebProgramFormat(),
                    candidate,
                    "webProgram");
        }
        sources.sort(
                Comparator.comparingInt(
                        source -> fontFormatPreference(source.format(), source.originLabel())));
        return sources;
    }

    private int conversionStatusPriority(PdfJsonFontConversionStatus status) {
        return switch (status) {
            case SUCCESS -> 0;
            case WARNING -> 1;
            default -> 2;
        };
    }

    private void addCandidatePayload(
            List<FontByteSource> sources,
            String base64,
            String format,
            PdfJsonFontConversionCandidate candidate,
            String label) {
        if (base64 == null || base64.isBlank()) {
            return;
        }
        try {
            byte[] bytes = Base64.getDecoder().decode(base64);
            if (bytes.length == 0) {
                return;
            }
            String normalizedFormat = format != null ? format.toLowerCase(Locale.ROOT) : null;
            String strategyId =
                    candidate.getStrategyId() != null ? candidate.getStrategyId() : "unknown";
            String origin = "candidate:" + strategyId + ":" + label;
            sources.add(new FontByteSource(bytes, normalizedFormat, origin));
            log.debug(
                    "[FONT-DEBUG] Registered conversion candidate payload from {} (format={}, size={} bytes)",
                    origin,
                    normalizedFormat,
                    bytes.length);
        } catch (IllegalArgumentException ex) {
            log.warn(
                    "[TYPE3] Failed to decode {} payload for strategy {}: {}",
                    label,
                    candidate.getStrategyId(),
                    ex.getMessage());
        }
    }

    private void registerType3GlyphCoverage(
            String fontUid,
            List<PdfJsonFontConversionCandidate> conversionCandidates,
            List<PdfJsonFontType3Glyph> glyphs) {
        if (fontUid == null) {
            return;
        }
        Set<Integer> coverage = new LinkedHashSet<>();
        if (conversionCandidates != null) {
            for (PdfJsonFontConversionCandidate candidate : conversionCandidates) {
                if (candidate == null || candidate.getGlyphCoverage() == null) {
                    continue;
                }
                for (Integer value : candidate.getGlyphCoverage()) {
                    if (value != null) {
                        coverage.add(value);
                    }
                }
            }
        }
        if (glyphs != null) {
            for (PdfJsonFontType3Glyph glyph : glyphs) {
                if (glyph == null) {
                    continue;
                }
                Integer unicode = glyph.getUnicode();
                if (unicode != null) {
                    coverage.add(unicode);
                } else {
                    Integer charCode = glyph.getCharCode();
                    if (charCode != null && charCode >= 0) {
                        coverage.add(0xF000 | (charCode & 0xFF));
                    }
                }
            }
        }
        if (!coverage.isEmpty()) {
            type3GlyphCoverageCache.put(fontUid, Collections.unmodifiableSet(coverage));
        }
    }

    private boolean isGlyphCoveredByType3Font(Set<Integer> coverage, int codePoint) {
        if (coverage == null || coverage.isEmpty()) {
            return true;
        }
        if (coverage.contains(codePoint)) {
            return true;
        }
        if (codePoint >= 0 && codePoint <= 0xFF) {
            return coverage.contains(0xF000 | (codePoint & 0xFF));
        }
        return false;
    }

    private int fontFormatPreference(String format, String origin) {
        if (format == null) {
            return 5;
        }
        switch (format) {
            case "ttf":
                return 0;
            case "truetype":
                return 1;
            case "otf":
            case "cff":
            case "type1c":
            case "cidfonttype0c":
                return 2;
            default:
                log.debug("[FONT-DEBUG] Unknown font format '{}' from {}", format, origin);
                return 4;
        }
    }

    private record FontModelCacheEntry(
            String baseName,
            String subtype,
            String encoding,
            PdfJsonFontCidSystemInfo cidSystemInfo,
            Boolean embedded,
            FontProgramData programData,
            String toUnicode,
            String standard14Name,
            Integer fontDescriptorFlags,
            Float ascent,
            Float descent,
            Float capHeight,
            Float xHeight,
            Float italicAngle,
            Integer unitsPerEm,
            PdfJsonCosValue cosDictionary,
            List<PdfJsonFontType3Glyph> type3Glyphs,
            List<PdfJsonFontConversionCandidate> conversionCandidates) {}

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
        Set<String> warnedFonts =
                new HashSet<>(); // Track fonts we've already warned about on this page

        Map<String, PdfJsonFont> fontLookup = buildFontModelLookup(fontModels);
        Map<String, Set<Integer>> type3GlyphCache = new HashMap<>();

        for (PdfJsonTextElement element : elements) {
            String text = Objects.toString(element.getText(), "");
            if (text.isEmpty()) {
                continue;
            }

            PDFont font = fontMap.get(buildFontKey(null, pageNumber, element.getFontId()));
            if (font == null && element.getFontId() != null) {
                font = fontMap.get(buildFontKey(null, -1, element.getFontId()));
            }

            if (font == null) {
                fallbackNeeded = true;
                fallbackIds.add(FALLBACK_FONT_ID);
                element.setFallbackUsed(Boolean.TRUE);
                continue;
            }

            PdfJsonFont fontModel = resolveFontModel(fontLookup, pageNumber, element.getFontId());
            if (font instanceof PDType3Font && fontModel != null) {
                Set<Integer> supportedGlyphs =
                        type3GlyphCache.computeIfAbsent(
                                fontModel.getUid() != null ? fontModel.getUid() : fontModel.getId(),
                                key -> {
                                    List<PdfJsonFontType3Glyph> glyphs = fontModel.getType3Glyphs();
                                    if (glyphs == null || glyphs.isEmpty()) {
                                        return Collections.emptySet();
                                    }
                                    return glyphs.stream()
                                            .map(PdfJsonFontType3Glyph::getUnicode)
                                            .filter(Objects::nonNull)
                                            .collect(Collectors.toSet());
                                });

                boolean missingGlyph = false;
                for (int offset = 0; offset < text.length(); ) {
                    int codePoint = text.codePointAt(offset);
                    offset += Character.charCount(codePoint);
                    if (!supportedGlyphs.contains(codePoint)) {
                        missingGlyph = true;
                        break;
                    }
                }

                if (missingGlyph) {
                    fallbackNeeded = true;
                    element.setFallbackUsed(Boolean.TRUE);
                    for (int offset = 0; offset < text.length(); ) {
                        int codePoint = text.codePointAt(offset);
                        offset += Character.charCount(codePoint);
                        if (!supportedGlyphs.contains(codePoint)) {
                            String fallbackId =
                                    fallbackFontService.resolveFallbackFontId(codePoint);
                            fallbackIds.add(fallbackId != null ? fallbackId : FALLBACK_FONT_ID);
                        }
                    }
                }
                continue;
            }

            if (!fallbackFontService.canEncodeFully(font, text)) {
                String fontName =
                        fontModel != null && fontModel.getBaseName() != null
                                ? fontModel
                                        .getBaseName()
                                        .replaceAll("^[A-Z]{6}\\+", "") // Remove subset prefix
                                : (font != null ? font.getName() : "unknown");
                String fontKey = fontName + ":" + element.getFontId() + ":" + pageNumber;
                if (!warnedFonts.contains(fontKey)) {
                    log.warn(
                            "[FALLBACK-NEEDED] Font '{}' (resource {}, subtype {}) cannot encode text on page {}. Using fallback font.",
                            fontName,
                            element.getFontId(),
                            fontModel != null ? fontModel.getSubtype() : "unknown",
                            pageNumber);
                    warnedFonts.add(fontKey);
                }
                fallbackNeeded = true;
                element.setFallbackUsed(Boolean.TRUE);
                for (int offset = 0; offset < text.length(); ) {
                    int codePoint = text.codePointAt(offset);
                    offset += Character.charCount(codePoint);
                    if (!fallbackFontService.canEncode(font, codePoint)) {
                        String fallbackId = fallbackFontService.resolveFallbackFontId(codePoint);
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
            PDFont fallbackFont = fontMap.get(buildFontKey(null, -1, fallbackId));
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

    private PDFont ensureFallbackFont(
            PDDocument document,
            Map<String, PDFont> fontMap,
            List<PdfJsonFont> fontModels,
            String fallbackId)
            throws IOException {
        String effectiveId = fallbackId != null ? fallbackId : FALLBACK_FONT_ID;
        String key = buildFontKey(null, -1, effectiveId);
        PDFont font = fontMap.get(key);
        if (font != null) {
            log.debug(
                    "[FALLBACK-DEBUG] Reusing cached fallback font {} (key: {})", effectiveId, key);
            return font;
        }
        log.debug(
                "[FALLBACK-DEBUG] Loading fallback font {} (key: {}) via fallbackFontService",
                effectiveId,
                key);
        PDFont loaded = fallbackFontService.loadFallbackPdfFont(document, effectiveId);
        log.debug(
                "[FALLBACK-DEBUG] Loaded fallback font {} - PDFont class: {}, name: {}",
                effectiveId,
                loaded.getClass().getSimpleName(),
                loaded.getName());
        fontMap.put(key, loaded);
        if (fontModels != null
                && fontModels.stream().noneMatch(f -> effectiveId.equals(f.getId()))) {
            fontModels.add(fallbackFontService.buildFallbackFontModel(effectiveId));
        }
        return loaded;
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
        return fontService.convertCffProgramToTrueType(fontBytes, toUnicode);
    }

    private String buildUnicodeMapping(PDFont font, String toUnicodeBase64) throws IOException {
        if (toUnicodeBase64 == null || toUnicodeBase64.isBlank()) {
            return null;
        }

        // For CID fonts (Type0), build complete CharCode→CID→GID→Unicode mapping
        if (!(font instanceof PDType0Font type0Font)) {
            // For non-CID fonts, just return ToUnicode as-is
            return toUnicodeBase64;
        }

        try {
            // Build a map of CharCode → Unicode from ToUnicode
            Map<Integer, Integer> charCodeToUnicode = new HashMap<>();
            byte[] toUnicodeBytes = Base64.getDecoder().decode(toUnicodeBase64);
            String toUnicodeStr = new String(toUnicodeBytes, StandardCharsets.UTF_8);

            // Parse ToUnicode CMap for bfchar and bfrange
            java.util.regex.Pattern bfcharPattern =
                    java.util.regex.Pattern.compile("<([0-9A-Fa-f]+)>\\s*<([0-9A-Fa-f]+)>");
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
                    json.append(
                            String.format(
                                    "{\"code\":%d,\"cid\":%d,\"gid\":%d,\"unicode\":%d}",
                                    charCode, cid, gid, unicode));
                } catch (Exception e) {
                    // Skip entries that fail to map
                    log.debug(
                            "Failed to map charCode {} in font {}: {}",
                            charCode,
                            font.getName(),
                            e.getMessage());
                }
            }

            json.append("]}");
            String jsonStr = json.toString();
            log.debug(
                    "Built Unicode mapping for CID font {} with {} entries",
                    font.getName(),
                    charCodeToUnicode.size());
            return Base64.getEncoder().encodeToString(jsonStr.getBytes(StandardCharsets.UTF_8));

        } catch (Exception e) {
            log.warn(
                    "Failed to build Unicode mapping for font {}: {}",
                    font.getName(),
                    e.getMessage());
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
            log.debug(
                    "[FONT-DEBUG] Font {}: Found FontFile3 with subtype {}",
                    font.getName(),
                    subtype);
            return readFontProgram(
                    fontFile3, subtype != null ? subtype : "fontfile3", false, toUnicode);
        }

        PDStream fontFile2 = descriptor.getFontFile2();
        if (fontFile2 != null) {
            log.debug("[FONT-DEBUG] Font {}: Found FontFile2 (TrueType)", font.getName());
            return readFontProgram(fontFile2, null, true, toUnicode);
        }

        PDStream fontFile = descriptor.getFontFile();
        if (fontFile != null) {
            log.debug("[FONT-DEBUG] Font {}: Found FontFile (Type1)", font.getName());
            return readFontProgram(fontFile, "type1", false, toUnicode);
        }

        log.debug("[FONT-DEBUG] Font {}: No font program found", font.getName());
        return null;
    }

    private FontProgramData readFontProgram(
            PDStream stream, String formatHint, boolean detectTrueType, String toUnicode)
            throws IOException {
        try (InputStream inputStream = stream.createInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            inputStream.transferTo(baos);
            byte[] data = baos.toByteArray();
            String format = formatHint;
            if (detectTrueType) {
                format = fontService.detectTrueTypeFormat(data);
            }
            log.debug(
                    "[FONT-DEBUG] Font program: size={} bytes, formatHint={}, detectedFormat={}",
                    data.length,
                    formatHint,
                    format);

            String webBase64 = null;
            String webFormat = null;
            String pdfBase64 = null;
            String pdfFormat = null;
            if (format != null && isCffFormat(format)) {
                log.debug(
                        "[FONT-DEBUG] Font is CFF format, attempting conversion. CFF conversion enabled: {}, method: {}",
                        fontService.isCffConversionEnabled(),
                        fontService.getCffConverterMethod());

                byte[] converted = convertCffProgramToTrueType(data, toUnicode);
                if (converted != null && converted.length > 0) {
                    String detectedFormat = fontService.detectFontFlavor(converted);
                    webBase64 = Base64.getEncoder().encodeToString(converted);
                    webFormat = detectedFormat;
                    log.debug(
                            "[FONT-DEBUG] Primary CFF conversion succeeded: {} bytes -> {}",
                            data.length,
                            detectedFormat);
                    if ("ttf".equals(detectedFormat)) {
                        pdfBase64 = webBase64;
                        pdfFormat = detectedFormat;
                    }
                } else {
                    log.debug("[FONT-DEBUG] Primary CFF conversion returned null/empty");
                }

                if (pdfBase64 == null && fontService.isCffConversionEnabled()) {
                    log.debug("[FONT-DEBUG] Attempting fallback FontForge conversion");
                    byte[] ttfConverted = fontService.convertCffUsingFontForge(data);
                    if (ttfConverted != null && ttfConverted.length > 0) {
                        String detectedFormat = fontService.detectFontFlavor(ttfConverted);
                        if (detectedFormat != null) {
                            pdfBase64 = Base64.getEncoder().encodeToString(ttfConverted);
                            pdfFormat = detectedFormat;
                            if (webBase64 == null) {
                                webBase64 = pdfBase64;
                                webFormat = detectedFormat;
                            }
                            log.debug(
                                    "[FONT-DEBUG] FontForge conversion succeeded: {} bytes -> {}",
                                    data.length,
                                    detectedFormat);
                        }
                    } else {
                        log.debug("[FONT-DEBUG] FontForge conversion also returned null/empty");
                    }
                }

                if (webBase64 == null && pdfBase64 == null) {
                    log.warn(
                            "[FONT-DEBUG] ALL CFF conversions failed - font will not be usable in browser!");
                }
            } else if (format != null) {
                log.debug("[FONT-DEBUG] Font is non-CFF format ({}), using as-is", format);
                // For non-CFF formats (TrueType, etc.), preserve original font stream as pdfProgram
                // This allows PDFBox to reconstruct the font during JSON->PDF
                String base64 = Base64.getEncoder().encodeToString(data);
                pdfBase64 = base64;
                pdfFormat = format;
            }

            String base64 = Base64.getEncoder().encodeToString(data);
            return new FontProgramData(base64, format, webBase64, webFormat, pdfBase64, pdfFormat);
        }
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

    /**
     * Fuzzy match a font name against Standard14 fonts as a last resort. Handles common variations
     * like "TimesNewRoman" → "Times-Roman", "Arial" → "Helvetica", etc.
     *
     * @param baseName the font base name to match
     * @return matched Standard14 font, or null if no reasonable match found
     */
    private Standard14Fonts.FontName fuzzyMatchStandard14(String baseName) {
        if (baseName == null || baseName.isBlank()) {
            return null;
        }

        // Normalize: lowercase, remove spaces/hyphens/underscores, strip prefix (ABCD+FontName)
        String normalized = baseName.trim();
        int plusIndex = normalized.indexOf('+');
        if (plusIndex >= 0 && plusIndex < normalized.length() - 1) {
            normalized = normalized.substring(plusIndex + 1);
        }
        normalized = normalized.toLowerCase(Locale.ROOT).replaceAll("[\\s\\-_]", "");

        // Exact match after normalization
        try {
            Standard14Fonts.FontName exact = Standard14Fonts.getMappedFontName(baseName);
            if (exact != null) {
                return exact;
            }
        } catch (IllegalArgumentException ignored) {
            // Not an exact match, continue with fuzzy matching
        }

        // Times family: Times, TimesRoman, TimesNewRoman, TNR
        if (normalized.contains("times") || normalized.equals("tnr")) {
            if (normalized.contains("bold") && normalized.contains("italic")) {
                return Standard14Fonts.FontName.TIMES_BOLD_ITALIC;
            }
            if (normalized.contains("bold")) {
                return Standard14Fonts.FontName.TIMES_BOLD;
            }
            if (normalized.contains("italic") || normalized.contains("oblique")) {
                return Standard14Fonts.FontName.TIMES_ITALIC;
            }
            return Standard14Fonts.FontName.TIMES_ROMAN;
        }

        // Helvetica family: Helvetica, Arial, Swiss
        if (normalized.contains("helvetica")
                || normalized.contains("arial")
                || normalized.contains("swiss")) {
            if (normalized.contains("bold") && normalized.contains("oblique")) {
                return Standard14Fonts.FontName.HELVETICA_BOLD_OBLIQUE;
            }
            if (normalized.contains("bold")) {
                return Standard14Fonts.FontName.HELVETICA_BOLD;
            }
            if (normalized.contains("oblique") || normalized.contains("italic")) {
                return Standard14Fonts.FontName.HELVETICA_OBLIQUE;
            }
            return Standard14Fonts.FontName.HELVETICA;
        }

        // Courier family: Courier, CourierNew, Mono, Monospace
        if (normalized.contains("courier") || normalized.contains("mono")) {
            if (normalized.contains("bold")
                    && (normalized.contains("oblique") || normalized.contains("italic"))) {
                return Standard14Fonts.FontName.COURIER_BOLD_OBLIQUE;
            }
            if (normalized.contains("bold")) {
                return Standard14Fonts.FontName.COURIER_BOLD;
            }
            if (normalized.contains("oblique") || normalized.contains("italic")) {
                return Standard14Fonts.FontName.COURIER_OBLIQUE;
            }
            return Standard14Fonts.FontName.COURIER;
        }

        // Symbol and ZapfDingbats (less common)
        if (normalized.contains("symbol")) {
            return Standard14Fonts.FontName.SYMBOL;
        }
        if (normalized.contains("zapf") || normalized.contains("dingbat")) {
            return Standard14Fonts.FontName.ZAPF_DINGBATS;
        }

        // No reasonable match found
        return null;
    }

    private List<PdfJsonPage> extractPages(
            PDDocument document,
            Map<Integer, List<PdfJsonTextElement>> textByPage,
            Map<Integer, List<PdfJsonImageElement>> imagesByPage,
            Map<Integer, List<PdfJsonAnnotation>> annotationsByPage,
            boolean omitResourceStreamData)
            throws IOException {
        List<PdfJsonPage> pages = new ArrayList<>();
        int pageIndex = 0;
        for (PDPage page : document.getPages()) {
            PdfJsonPage pageModel = new PdfJsonPage();
            pageModel.setPageNumber(pageIndex + 1);
            // Use CropBox if present (defines visible page area), otherwise fall back to MediaBox
            PDRectangle pageBox = page.getCropBox();
            if (pageBox == null || pageBox.getWidth() == 0 || pageBox.getHeight() == 0) {
                pageBox = page.getMediaBox();
            }
            pageModel.setWidth(pageBox.getWidth());
            pageModel.setHeight(pageBox.getHeight());
            pageModel.setRotation(page.getRotation());
            pageModel.setTextElements(textByPage.getOrDefault(pageIndex + 1, new ArrayList<>()));
            pageModel.setImageElements(imagesByPage.getOrDefault(pageIndex + 1, new ArrayList<>()));
            pageModel.setAnnotations(
                    annotationsByPage.getOrDefault(pageIndex + 1, new ArrayList<>()));
            // Serialize resources but exclude image XObject streams to avoid duplication with
            // imageElements
            COSBase resourcesBase = page.getCOSObject().getDictionaryObject(COSName.RESOURCES);
            COSBase filteredResources = filterImageXObjectsFromResources(resourcesBase);
            PdfJsonCosValue resourcesModel =
                    omitResourceStreamData
                            ? cosMapper.serializeCosValue(
                                    filteredResources,
                                    PdfJsonCosMapper.SerializationContext.RESOURCES_LIGHTWEIGHT)
                            : cosMapper.serializeCosValue(filteredResources);
            pageModel.setResources(resourcesModel);
            pageModel.setContentStreams(extractContentStreams(page, true));
            pages.add(pageModel);
            pageIndex++;
        }
        return pages;
    }

    private Map<Integer, List<PdfJsonImageElement>> collectImages(
            PDDocument document,
            int totalPages,
            Consumer<PdfJsonConversionProgress> progress,
            Map<COSBase, EncodedImage> imageCache)
            throws IOException {
        Map<Integer, List<PdfJsonImageElement>> imagesByPage = new LinkedHashMap<>();
        int pageNumber = 1;
        for (PDPage page : document.getPages()) {
            ImageCollectingEngine engine =
                    new ImageCollectingEngine(page, pageNumber, imagesByPage, imageCache);
            engine.processPage(page);

            // Update progress for image extraction (70-80%)
            int imageProgress = 70 + (int) ((pageNumber / (double) totalPages) * 10);
            progress.accept(
                    PdfJsonConversionProgress.of(
                            imageProgress, "images", "Extracting images", pageNumber, totalPages));
            pageNumber++;
        }
        return imagesByPage;
    }

    private Map<Integer, List<PdfJsonAnnotation>> collectAnnotations(
            PDDocument document,
            int totalPages,
            Consumer<PdfJsonConversionProgress> progress,
            boolean includeRawData)
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

                    if (includeRawData) {
                        // Store raw dictionary for lossless round-trip
                        ann.setRawData(
                                cosMapper.serializeCosValue(
                                        annotDict,
                                        PdfJsonCosMapper.SerializationContext.ANNOTATION_RAW_DATA));
                    }

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

            // Update progress for annotation collection (80-90%)
            int annotationProgress = 80 + (int) ((pageNumber / (double) totalPages) * 10);
            progress.accept(
                    PdfJsonConversionProgress.of(
                            annotationProgress,
                            "annotations",
                            "Collecting annotations",
                            pageNumber,
                            totalPages));
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
                    formField.setRawData(
                            cosMapper.serializeCosValue(
                                    field.getCOSObject(),
                                    PdfJsonCosMapper.SerializationContext.FORM_FIELD_RAW_DATA));

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
                    COSBase rawAnnot =
                            cosMapper.deserializeCosValue(annModel.getRawData(), document);
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
                        COSBase rawField =
                                cosMapper.deserializeCosValue(fieldModel.getRawData(), document);
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
        COSBase base = cosMapper.deserializeCosValue(resourcesModel, document);
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
            COSStream cosStream = cosMapper.buildStreamFromModel(streamModel, document);
            if (cosStream != null) {
                streams.add(new PDStream(cosStream));
            }
        }
        return streams;
    }

    private List<PdfJsonStream> extractContentStreams(PDPage page, boolean omitRawData)
            throws IOException {
        List<PdfJsonStream> streams = new ArrayList<>();
        Iterator<PDStream> iterator = page.getContentStreams();
        if (iterator == null) {
            return streams;
        }
        while (iterator.hasNext()) {
            PDStream stream = iterator.next();
            PdfJsonStream model =
                    omitRawData
                            ? cosMapper.serializeStream(
                                    stream,
                                    PdfJsonCosMapper.SerializationContext
                                            .CONTENT_STREAMS_LIGHTWEIGHT)
                            : cosMapper.serializeStream(stream);
            if (model != null) {
                streams.add(model);
            }
        }
        return streams;
    }

    private List<PdfJsonStream> extractContentStreams(PDPage page) throws IOException {
        return extractContentStreams(page, false);
    }

    private PDStream extractVectorGraphics(
            PDDocument document,
            List<PDStream> preservedStreams,
            List<PdfJsonImageElement> imageElements)
            throws IOException {
        if (preservedStreams == null || preservedStreams.isEmpty()) {
            return null;
        }

        Set<String> imageObjectNames = new HashSet<>();
        if (imageElements != null) {
            for (PdfJsonImageElement element : imageElements) {
                if (element == null) {
                    continue;
                }
                String objectName = element.getObjectName();
                if (objectName != null && !objectName.isBlank()) {
                    imageObjectNames.add(objectName);
                }
            }
        }

        List<Object> filteredTokens = new ArrayList<>();
        for (PDStream stream : preservedStreams) {
            if (stream == null) {
                continue;
            }
            try {
                PDFStreamParser parser = new PDFStreamParser(stream.toByteArray());
                List<Object> tokens = parser.parse();
                collectVectorTokens(tokens, filteredTokens, imageObjectNames);
            } catch (IOException ex) {
                log.debug(
                        "Failed to parse preserved content stream for vector extraction: {}",
                        ex.getMessage());
            }
        }

        if (filteredTokens.isEmpty()) {
            return null;
        }

        PDStream vectorStream = new PDStream(document);
        try (OutputStream outputStream = vectorStream.createOutputStream(COSName.FLATE_DECODE)) {
            new ContentStreamWriter(outputStream).writeTokens(filteredTokens);
        }
        return vectorStream;
    }

    private void collectVectorTokens(
            List<Object> sourceTokens, List<Object> targetTokens, Set<String> imageObjectNames) {
        if (sourceTokens == null || sourceTokens.isEmpty()) {
            return;
        }

        boolean insideText = false;
        boolean insideInlineImage = false;

        for (Object token : sourceTokens) {
            if (token instanceof Operator operator) {
                String name = operator.getName();
                if (OperatorName.BEGIN_TEXT.equals(name)) {
                    insideText = true;
                    continue;
                }
                if (OperatorName.END_TEXT.equals(name)) {
                    insideText = false;
                    continue;
                }
                if (OperatorName.BEGIN_INLINE_IMAGE.equals(name)
                        || OperatorName.BEGIN_INLINE_IMAGE_DATA.equals(name)) {
                    if (!insideText) {
                        targetTokens.add(operator);
                    }
                    insideInlineImage = true;
                    continue;
                }
                if (OperatorName.END_INLINE_IMAGE.equals(name)) {
                    if (!insideText) {
                        targetTokens.add(operator);
                    }
                    insideInlineImage = false;
                    continue;
                }
                if (insideText && !insideInlineImage) {
                    continue;
                }
                if (OperatorName.DRAW_OBJECT.equals(name)
                        && imageObjectNames != null
                        && !imageObjectNames.isEmpty()
                        && !targetTokens.isEmpty()) {
                    Object previous = targetTokens.get(targetTokens.size() - 1);
                    if (previous instanceof COSName cosName
                            && imageObjectNames.contains(cosName.getName())) {
                        targetTokens.remove(targetTokens.size() - 1);
                        continue;
                    }
                }
                targetTokens.add(operator);
            } else {
                if (insideText && !insideInlineImage) {
                    continue;
                }
                targetTokens.add(token);
            }
        }
    }

    private void regeneratePageContent(
            PDDocument document,
            PDPage page,
            List<PdfJsonTextElement> textElements,
            List<PdfJsonImageElement> imageElements,
            Map<String, PDFont> fontMap,
            List<PdfJsonFont> fontModels,
            int pageNumber,
            AppendMode appendMode)
            throws IOException {
        List<DrawableElement> drawables = mergeDrawables(textElements, imageElements);
        Map<String, PDImageXObject> imageCache = new HashMap<>();
        Map<String, PdfJsonFont> runFontLookup = buildFontModelLookup(fontModels);

        AppendMode mode = appendMode != null ? appendMode : AppendMode.OVERWRITE;
        try (PDPageContentStream contentStream =
                new PDPageContentStream(document, page, mode, true, true)) {
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
                                fontMap.get(buildFontKey(null, pageNumber, element.getFontId()));
                        if (baseFont == null && element.getFontId() != null) {
                            baseFont = fontMap.get(buildFontKey(null, -1, element.getFontId()));
                        }

                        float fontScale = resolveFontMatrixSize(element);

                        applyTextState(contentStream, element);
                        applyRenderingMode(contentStream, element.getRenderingMode());
                        applyTextMatrix(contentStream, element);

                        List<FontRun> runs =
                                buildFontRuns(
                                        document,
                                        fontMap,
                                        fontModels,
                                        pageNumber,
                                        baseFont,
                                        text,
                                        element);

                        PDFont activeFont = null;
                        for (FontRun run : runs) {
                            if (run == null || run.text().isEmpty()) {
                                continue;
                            }
                            if (run.font() != activeFont) {
                                contentStream.setFont(run.font(), fontScale);
                                activeFont = run.font();
                            }
                            PdfJsonFont runFontModel =
                                    resolveFontModel(runFontLookup, pageNumber, run.fontId());
                            if (runFontModel == null) {
                                runFontLookup = buildFontModelLookup(fontModels);
                                runFontModel =
                                        resolveFontModel(runFontLookup, pageNumber, run.fontId());
                            }
                            // Check if this is a normalized Type3 font (has Type3 metadata but is
                            // not PDType3Font)
                            boolean isNormalizedType3 =
                                    !(run.font() instanceof PDType3Font)
                                            && runFontModel != null
                                            && runFontModel.getType3Glyphs() != null
                                            && !runFontModel.getType3Glyphs().isEmpty();

                            // For fonts with proper Unicode mappings, let PDFBox handle encoding
                            // This includes: normalized Type3 fonts, PDType0Font (composite fonts)
                            boolean useDirectText =
                                    isNormalizedType3
                                            || run.font()
                                                    instanceof
                                                    org.apache.pdfbox.pdmodel.font.PDType0Font;

                            if (useDirectText) {
                                // Pass text directly - PDFBox handles encoding internally
                                contentStream.showText(run.text());
                            } else {
                                // For actual Type3 fonts and other fonts, encode manually
                                byte[] encoded;
                                if (run.font() instanceof PDType3Font
                                        && run.charCodes() != null
                                        && !run.charCodes().isEmpty()) {
                                    encoded = encodeType3CharCodes(run.charCodes());
                                    if (encoded == null || encoded.length == 0) {
                                        log.warn(
                                                "[FONT-DEBUG] Failed to emit raw Type3 char codes for font {} on page {}",
                                                run.font().getName(),
                                                pageNumber);
                                        continue;
                                    }
                                } else {
                                    try {
                                        log.debug(
                                                "[ENCODE-DEBUG] Encoding text '{}' with font {} (fontId={}, runFontModel={})",
                                                run.text(),
                                                run.font().getName(),
                                                run.fontId(),
                                                runFontModel != null
                                                        ? runFontModel.getId()
                                                        : "null");
                                        encoded =
                                                encodeTextWithFont(
                                                        run.font(),
                                                        runFontModel,
                                                        run.text(),
                                                        run.charCodes());
                                    } catch (IOException ex) {
                                        log.warn(
                                                "Failed to encode text '{}' with font {} (fontId={}, runFontModel={}) on page {}: {}",
                                                run.text(),
                                                run.font().getName(),
                                                run.fontId(),
                                                runFontModel != null
                                                        ? runFontModel.getId()
                                                        : "null",
                                                pageNumber,
                                                ex.getMessage());
                                        continue;
                                    }
                                }
                                if (encoded == null || encoded.length == 0) {
                                    log.warn(
                                            "Failed to encode text '{}' with font {} on page {}",
                                            run.text(),
                                            run.font().getName(),
                                            pageNumber);
                                    continue;
                                }
                                try {
                                    contentStream.showText(
                                            new String(encoded, StandardCharsets.ISO_8859_1));
                                } catch (IllegalArgumentException ex) {
                                    log.warn(
                                            "Failed to render text '{}' with font {} on page {}: {}",
                                            run.text(),
                                            run.font().getName(),
                                            pageNumber,
                                            ex.getMessage());
                                    continue;
                                }
                            }
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
            int pageNumber,
            PDFont primaryFont,
            String text,
            PdfJsonTextElement element)
            throws IOException {
        List<FontRun> runs = new ArrayList<>();
        if (text == null || text.isEmpty()) {
            return runs;
        }

        PDFont baseFont = primaryFont;
        String baseFontId = element.getFontId();
        boolean fallbackApplied = primaryFont == null;
        if (baseFont == null) {
            baseFont = ensureFallbackFont(document, fontMap, fontModels, FALLBACK_FONT_ID);
            if (baseFont != null) {
                baseFontId = FALLBACK_FONT_ID;
                fallbackApplied = true;
            }
        }
        if (baseFont == null) {
            log.warn("Unable to resolve a base font for text element; skipping text content");
            return runs;
        }

        Map<String, PdfJsonFont> runFontLookup = buildFontModelLookup(fontModels);
        PdfJsonFont baseFontModel = resolveFontModel(runFontLookup, pageNumber, baseFontId);
        boolean baseIsType3 =
                baseFontModel != null
                        && baseFontModel.getSubtype() != null
                        && "type3".equalsIgnoreCase(baseFontModel.getSubtype());
        PDFont normalizedType3Font =
                baseIsType3 && baseFontModel.getUid() != null
                        ? type3NormalizedFontCache.get(baseFontModel.getUid())
                        : null;
        Set<Integer> baseType3Coverage =
                baseIsType3 && baseFontModel != null
                        ? type3GlyphCoverageCache.getOrDefault(
                                baseFontModel.getUid(), Collections.emptySet())
                        : Collections.emptySet();
        boolean hasNormalizedType3 = baseIsType3 && normalizedType3Font != null;
        if (hasNormalizedType3 && log.isDebugEnabled()) {
            log.debug(
                    "[TYPE3-RUNTIME] Using normalized library font {} for Type3 resource {} on page {}",
                    normalizedType3Font.getName(),
                    baseFontModel != null ? baseFontModel.getId() : baseFontId,
                    pageNumber);
        }

        StringBuilder buffer = new StringBuilder();
        List<Integer> codeBuffer = new ArrayList<>();
        PDFont currentFont = baseFont;
        String currentFontId = baseFontId;

        List<Integer> elementCodes = element.getCharCodes();
        int codeIndex = 0;
        boolean rawType3CodesUsed = false;
        int rawType3GlyphCount = 0;

        for (int offset = 0; offset < text.length(); ) {
            int codePoint = text.codePointAt(offset);
            offset += Character.charCount(codePoint);
            String glyph = new String(Character.toChars(codePoint));
            PDFont targetFont = baseFont;
            String targetFontId = baseFontId;
            Integer rawCode = null;
            if (elementCodes != null && codeIndex < elementCodes.size()) {
                rawCode = elementCodes.get(codeIndex);
            }
            codeIndex++;

            if (hasNormalizedType3) {
                targetFont = normalizedType3Font;
                // For normalized fonts, check if the font can actually encode the glyph
                // Don't check Type3 coverage since normalized fonts have full glyph sets
                if (!fallbackFontService.canEncode(normalizedType3Font, glyph)) {
                    // Glyph not in normalized font, will trigger fallback below
                    targetFont = null;
                    targetFontId = null;
                }
            } else if (baseIsType3) {
                // For actual Type3 fonts without normalized replacement
                boolean type3SupportsGlyph =
                        isGlyphCoveredByType3Font(baseType3Coverage, codePoint);
                if (!type3SupportsGlyph) {
                    targetFont = null;
                    targetFontId = null;
                }
            }
            if (targetFont == null || !fallbackFontService.canEncode(targetFont, glyph)) {
                fallbackApplied = true;
                // Try to match fallback font to original font family for visual consistency
                String originalFontName =
                        baseFontModel != null ? baseFontModel.getBaseName() : null;
                String fallbackId =
                        fallbackFontService.resolveFallbackFontId(originalFontName, codePoint);
                targetFont = ensureFallbackFont(document, fontMap, fontModels, fallbackId);
                targetFontId = fallbackId != null ? fallbackId : FALLBACK_FONT_ID;
                if (targetFont == null || !fallbackFontService.canEncode(targetFont, glyph)) {
                    String mapped = fallbackFontService.mapUnsupportedGlyph(codePoint);
                    if (mapped != null) {
                        if (targetFont != null
                                && fallbackFontService.canEncode(targetFont, mapped)) {
                            glyph = mapped;
                        } else if (fallbackFontService.canEncode(baseFont, mapped)) {
                            glyph = mapped;
                            targetFont = baseFont;
                            targetFontId = baseFontId;
                        }
                    }
                    if (targetFont == null || !fallbackFontService.canEncode(targetFont, glyph)) {
                        glyph = "?";
                        targetFont =
                                ensureFallbackFont(document, fontMap, fontModels, FALLBACK_FONT_ID);
                        targetFontId = FALLBACK_FONT_ID;
                        if (targetFont == null
                                || !fallbackFontService.canEncode(targetFont, glyph)) {
                            log.debug(
                                    "Dropping unsupported glyph U+{} for text element",
                                    Integer.toHexString(codePoint));
                            continue;
                        }
                    }
                }
                // Fallback applied - tracked at page level, not logged per character
            }

            boolean useRawType3Glyph =
                    rawCode != null
                            && baseIsType3
                            && !hasNormalizedType3
                            && targetFont == baseFont
                            && targetFont instanceof PDType3Font;

            if (targetFont != currentFont) {
                if (buffer.length() > 0) {
                    runs.add(
                            new FontRun(
                                    currentFont,
                                    currentFontId,
                                    buffer.toString(),
                                    codeBuffer.isEmpty() ? null : new ArrayList<>(codeBuffer)));
                    buffer.setLength(0);
                    codeBuffer.clear();
                }
                currentFont = targetFont;
                currentFontId = targetFontId;
            }
            buffer.append(glyph);
            if (useRawType3Glyph
                    && currentFontId != null
                    && currentFontId.equals(element.getFontId())) {
                codeBuffer.add(rawCode);
                rawType3CodesUsed = true;
                rawType3GlyphCount++;
            }
        }

        if (buffer.length() > 0) {
            runs.add(
                    new FontRun(
                            currentFont,
                            currentFontId,
                            buffer.toString(),
                            codeBuffer.isEmpty() ? null : new ArrayList<>(codeBuffer)));
        }

        if (fallbackApplied) {
            element.setFallbackUsed(Boolean.TRUE);
        }

        if (rawType3CodesUsed) {
            log.debug(
                    "[TYPE3-RUNTIME] Reused original Type3 charCodes for font {} on page {} ({} glyphs)",
                    baseFontModel != null ? baseFontModel.getId() : baseFontId,
                    pageNumber,
                    rawType3GlyphCount);
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

    // Cache helpers
    private CachedPdfDocument buildCachedDocument(
            String jobId,
            byte[] pdfBytes,
            PdfJsonDocumentMetadata metadata,
            Map<String, PdfJsonFont> fonts,
            Map<Integer, Map<PDFont, String>> pageFontResources)
            throws IOException {
        if (pdfBytes == null) {
            throw new IllegalArgumentException("pdfBytes must not be null");
        }
        long budget = cacheBudgetBytes;
        // If single document is larger than budget, spill straight to disk
        if (budget > 0 && pdfBytes.length > budget) {
            TempFile tempFile = new TempFile(tempFileManager, ".pdfjsoncache");
            Files.write(tempFile.getPath(), pdfBytes);
            log.debug(
                    "Cached PDF spilled to disk ({} bytes exceeds budget {}) for jobId {}",
                    pdfBytes.length,
                    budget,
                    jobId);
            return new CachedPdfDocument(
                    null, tempFile, pdfBytes.length, metadata, fonts, pageFontResources);
        }
        return new CachedPdfDocument(
                pdfBytes, null, pdfBytes.length, metadata, fonts, pageFontResources);
    }

    private void putCachedDocument(String jobId, CachedPdfDocument cached) {
        synchronized (cacheLock) {
            CachedPdfDocument existing = documentCache.put(jobId, cached);
            if (existing != null) {
                lruCache.remove(jobId);
                currentCacheBytes = Math.max(0L, currentCacheBytes - existing.getInMemorySize());
                existing.close();
            }
            lruCache.put(jobId, cached);
            currentCacheBytes += cached.getInMemorySize();
            enforceCacheBudget();
        }
    }

    private CachedPdfDocument getCachedDocument(String jobId) {
        synchronized (cacheLock) {
            CachedPdfDocument cached = documentCache.get(jobId);
            if (cached != null) {
                lruCache.remove(jobId);
                lruCache.put(jobId, cached);
            }
            return cached;
        }
    }

    private void enforceCacheBudget() {
        if (cacheBudgetBytes <= 0) {
            return;
        }
        // Must be called under cacheLock
        java.util.Iterator<java.util.Map.Entry<String, CachedPdfDocument>> it =
                lruCache.entrySet().iterator();
        while (currentCacheBytes > cacheBudgetBytes && it.hasNext()) {
            java.util.Map.Entry<String, CachedPdfDocument> entry = it.next();
            it.remove();
            CachedPdfDocument removed = entry.getValue();
            documentCache.remove(entry.getKey(), removed);
            currentCacheBytes = Math.max(0L, currentCacheBytes - removed.getInMemorySize());
            removed.close();
            log.warn(
                    "Evicted cached PDF for jobId {} to enforce cache budget (budget={} bytes, current={} bytes)",
                    entry.getKey(),
                    cacheBudgetBytes,
                    currentCacheBytes);
        }
        if (currentCacheBytes > cacheBudgetBytes && !lruCache.isEmpty()) {
            // Spill the most recently used large entry to disk
            String key =
                    lruCache.entrySet().stream()
                            .reduce((first, second) -> second)
                            .map(java.util.Map.Entry::getKey)
                            .orElse(null);
            if (key != null) {
                CachedPdfDocument doc = lruCache.get(key);
                if (doc != null && doc.getInMemorySize() > 0) {
                    try {
                        CachedPdfDocument diskDoc =
                                buildCachedDocument(
                                        key,
                                        doc.getPdfBytes(),
                                        doc.getMetadata(),
                                        doc.getFonts(),
                                        doc.getPageFontResources());
                        lruCache.put(key, diskDoc);
                        documentCache.put(key, diskDoc);
                        currentCacheBytes =
                                Math.max(0L, currentCacheBytes - doc.getInMemorySize())
                                        + diskDoc.getInMemorySize();
                        doc.close();
                        log.debug("Spilled cached PDF for jobId {} to disk to satisfy budget", key);
                    } catch (IOException ex) {
                        log.warn(
                                "Failed to spill cached PDF for jobId {} to disk: {}",
                                key,
                                ex.getMessage());
                    }
                }
            }
        }
    }

    private void removeCachedDocument(String jobId) {
        log.warn(
                "removeCachedDocument called for jobId: {} [CALLER: {}]",
                jobId,
                Thread.currentThread().getStackTrace()[2].toString());
        CachedPdfDocument removed = null;
        synchronized (cacheLock) {
            removed = documentCache.remove(jobId);
            if (removed != null) {
                lruCache.remove(jobId);
                currentCacheBytes = Math.max(0L, currentCacheBytes - removed.getInMemorySize());
                log.warn(
                        "Removed cached document for jobId: {} (size={} bytes)",
                        jobId,
                        removed.getInMemorySize());
            } else {
                log.warn("Attempted to remove jobId: {} but it was not in cache", jobId);
            }
        }
        if (removed != null) {
            removed.close();
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
                log.debug("[ColorApply] Skipping unsupported color space {}", space);
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
        private final String pdfBase64;
        private final String pdfFormat;

        private FontProgramData(
                String base64,
                String format,
                String webBase64,
                String webFormat,
                String pdfBase64,
                String pdfFormat) {
            this.base64 = base64;
            this.format = format;
            this.webBase64 = webBase64;
            this.webFormat = webFormat;
            this.pdfBase64 = pdfBase64;
            this.pdfFormat = pdfFormat;
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

        private String getPdfBase64() {
            return pdfBase64;
        }

        private String getPdfFormat() {
            return pdfFormat;
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

    private static final class FontRun {
        private final PDFont font;
        private final String fontId;
        private final String text;
        private final List<Integer> charCodes;

        private FontRun(PDFont font, String fontId, String text, List<Integer> charCodes) {
            this.font = font;
            this.fontId = fontId;
            this.text = text;
            this.charCodes = charCodes;
        }

        private PDFont font() {
            return font;
        }

        private String fontId() {
            return fontId;
        }

        private String text() {
            return text;
        }

        private List<Integer> charCodes() {
            return charCodes;
        }
    }

    private boolean rewriteTextOperators(
            PDDocument document,
            PDPage page,
            List<PdfJsonTextElement> elements,
            boolean removeOnly,
            boolean forceRegenerate,
            Map<String, PdfJsonFont> fontLookup,
            int pageNumber) {
        if (forceRegenerate) {
            log.debug("forceRegenerate flag set; skipping token rewrite for page");
            return false;
        }
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
            PdfJsonFont currentFontModel = null;

            boolean encounteredModifiedFont = false;

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
                            currentFontModel =
                                    resolveFontModel(fontLookup, pageNumber, currentFontName);
                            log.trace(
                                    "Encountered Tf operator; switching to font resource {}",
                                    currentFontName);
                            if (forceRegenerate) {
                                encounteredModifiedFont = true;
                            }
                        } else {
                            currentFont = null;
                            currentFontName = null;
                            currentFontModel = null;
                            log.debug(
                                    "Tf operator missing resource operand; clearing current font");
                        }
                        break;
                    case "Tj":
                        if (i == 0 || !(tokens.get(i - 1) instanceof COSString)) {
                            log.debug(
                                    "Encountered Tj without preceding string operand; aborting rewrite");
                            return false;
                        }
                        log.trace(
                                "Rewriting Tj operator using font {} (token index {}, cursor remaining {})",
                                currentFontName,
                                i,
                                cursor.remaining());
                        if (!rewriteShowText(
                                tokens,
                                i - 1,
                                currentFont,
                                currentFontModel,
                                currentFontName,
                                cursor,
                                removeOnly)) {
                            log.debug("Failed to rewrite Tj operator; aborting rewrite");
                            return false;
                        }
                        break;
                    case "TJ":
                        if (i == 0 || !(tokens.get(i - 1) instanceof COSArray array)) {
                            log.debug("Encountered TJ without array operand; aborting rewrite");
                            return false;
                        }
                        log.trace(
                                "Rewriting TJ operator using font {} (token index {}, cursor remaining {})",
                                currentFontName,
                                i,
                                cursor.remaining());
                        if (!rewriteShowTextArray(
                                array,
                                currentFont,
                                currentFontModel,
                                currentFontName,
                                cursor,
                                removeOnly)) {
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

            if (forceRegenerate && encounteredModifiedFont) {
                log.debug(
                        "Rewrite succeeded but forceRegenerate=true, returning false to trigger rebuild");
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
            List<Object> tokens,
            int tokenIndex,
            PDFont font,
            PdfJsonFont fontModel,
            String expectedFontName,
            TextElementCursor cursor,
            boolean removeOnly)
            throws IOException {
        if (font == null) {
            log.debug(
                    "rewriteShowText aborted: no active font for expected resource {}",
                    expectedFontName);
            return false;
        }
        COSString cosString = (COSString) tokens.get(tokenIndex);
        int glyphCount = countGlyphs(cosString, font);
        log.trace(
                "rewriteShowText consuming {} glyphs at cursor index {} for font {}",
                glyphCount,
                cursor.index,
                expectedFontName);
        List<PdfJsonTextElement> consumed = cursor.consume(expectedFontName, glyphCount);
        if (consumed == null) {
            log.debug(
                    "Failed to consume {} glyphs for font {} (cursor remaining {})",
                    glyphCount,
                    expectedFontName,
                    cursor.remaining());
            return false;
        }
        if (removeOnly) {
            tokens.set(tokenIndex, new COSString(new byte[0]));
            return true;
        }
        MergedText replacement = mergeText(consumed);
        try {
            byte[] encoded =
                    encodeTextWithFont(
                            font, fontModel, replacement.text(), replacement.charCodes());
            if (encoded == null) {
                log.debug(
                        "Failed to map replacement text to glyphs for font {} (text='{}')",
                        expectedFontName,
                        replacement.text());
                return false;
            }
            tokens.set(tokenIndex, new COSString(encoded));
            return true;
        } catch (IOException | IllegalArgumentException | UnsupportedOperationException ex) {
            log.debug(
                    "Failed to encode replacement text with font {}: {}",
                    expectedFontName,
                    ex.getMessage());
            return false;
        }
    }

    private boolean rewriteShowTextArray(
            COSArray array,
            PDFont font,
            PdfJsonFont fontModel,
            String expectedFontName,
            TextElementCursor cursor,
            boolean removeOnly)
            throws IOException {
        if (font == null) {
            log.debug(
                    "rewriteShowTextArray aborted: no active font for expected resource {}",
                    expectedFontName);
            return false;
        }
        for (int i = 0; i < array.size(); i++) {
            COSBase element = array.get(i);
            if (element instanceof COSString cosString) {
                int glyphCount = countGlyphs(cosString, font);
                List<PdfJsonTextElement> consumed = cursor.consume(expectedFontName, glyphCount);
                if (consumed == null) {
                    log.debug(
                            "Failed to consume {} glyphs for font {} in TJ segment {} (cursor remaining {})",
                            glyphCount,
                            expectedFontName,
                            i,
                            cursor.remaining());
                    return false;
                }
                if (removeOnly) {
                    array.set(i, new COSString(new byte[0]));
                    continue;
                }
                MergedText replacement = mergeText(consumed);
                try {
                    byte[] encoded =
                            encodeTextWithFont(
                                    font, fontModel, replacement.text(), replacement.charCodes());
                    if (encoded == null) {
                        log.debug(
                                "Failed to map replacement text in TJ array for font {} segment {}",
                                expectedFontName,
                                i);
                        return false;
                    }
                    array.set(i, new COSString(encoded));
                } catch (IOException
                        | IllegalArgumentException
                        | UnsupportedOperationException ex) {
                    log.debug(
                            "Failed to encode replacement text in TJ array for font {} segment {}: {}",
                            expectedFontName,
                            i,
                            ex.getMessage());
                    return false;
                }
            }
        }
        return true;
    }

    private byte[] encodeTextWithFont(
            PDFont font, PdfJsonFont fontModel, String text, List<Integer> rawCharCodes)
            throws IOException {
        boolean isType3Font = font instanceof PDType3Font;
        boolean hasType3Metadata =
                fontModel != null
                        && fontModel.getType3Glyphs() != null
                        && !fontModel.getType3Glyphs().isEmpty();

        // For normalized Type3 fonts (font is NOT Type3 but has Type3 metadata)
        if (!isType3Font && hasType3Metadata) {
            // If loaded as full font (not subset), use standard Unicode encoding
            // Try standard encoding first - this works when the font has all glyphs
            try {
                byte[] encoded = font.encode(text);
                // NOTE: Do NOT sanitize encoded bytes for normalized Type3 fonts
                // Multi-byte encodings (UTF-16BE, CID fonts) have null bytes that are essential
                // Removing them corrupts the byte boundaries and produces garbled text
                log.debug(
                        "[TYPE3] Encoded text '{}' for normalized font {}: encoded={} bytes",
                        text.length() > 20 ? text.substring(0, 20) + "..." : text,
                        fontModel.getId(),
                        encoded != null ? encoded.length : 0);
                if (encoded != null && encoded.length > 0) {
                    log.debug(
                            "[TYPE3] Successfully encoded text for normalized Type3 font {} using standard encoding",
                            fontModel.getId());
                    return encoded;
                }
                log.debug(
                        "[TYPE3] Standard encoding produced empty result for normalized Type3 font {}, falling through to Type3 mapping",
                        fontModel.getId());
            } catch (IOException | IllegalArgumentException ex) {
                log.debug(
                        "[TYPE3] Standard encoding failed for normalized Type3 font {}: {}",
                        fontModel.getId(),
                        ex.getMessage());
            }
            // If standard encoding failed, fall through to Type3 glyph mapping (for subset fonts)
            // or return null to trigger fallback font
        } else if (!isType3Font || fontModel == null) {
            // For non-Type3 fonts without Type3 metadata, use standard encoding
            try {
                byte[] encoded = font.encode(text);
                return sanitizeEncoded(encoded);
            } catch (IllegalArgumentException ex) {
                log.debug(
                        "[FONT-DEBUG] Font {} cannot encode text '{}': {}",
                        font.getName(),
                        text,
                        ex.getMessage());
                // Return null to trigger fallback font mechanism
                return null;
            }
        }

        // Type3 glyph mapping logic (for actual Type3 fonts AND normalized Type3 fonts)
        List<PdfJsonFontType3Glyph> glyphs = fontModel.getType3Glyphs();
        if (glyphs == null || glyphs.isEmpty()) {
            return null;
        }

        // For normalized Type3 fonts, DO NOT use rawCharCodes because:
        // 1. They may be stale if text was edited
        // 2. The subset font only has glyphs from the original PDF
        // Instead, try Type3 glyph mapping and return null if glyphs are missing
        // (null will trigger fallback font usage in the calling code)

        // Build Unicode to character code mapping from Type3 glyphs
        Map<Integer, Integer> unicodeToCode = new HashMap<>();
        for (PdfJsonFontType3Glyph glyph : glyphs) {
            if (glyph == null) {
                continue;
            }
            Integer unicode = glyph.getUnicode();
            Integer charCode = glyph.getCharCode();
            if (unicode == null || charCode == null) {
                continue;
            }
            unicodeToCode.putIfAbsent(unicode, charCode);
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        boolean mappedAll = true;
        for (int offset = 0; offset < text.length(); ) {
            int codePoint = text.codePointAt(offset);
            offset += Character.charCount(codePoint);
            Integer charCode = unicodeToCode.get(codePoint);
            if (charCode == null) {
                log.debug(
                        "[TYPE3] Missing glyph mapping for code point U+{} in font {}",
                        Integer.toHexString(codePoint).toUpperCase(Locale.ROOT),
                        fontModel.getId());
                mappedAll = false;
                break;
            }
            if (charCode < 0 || charCode > 0xFF) {
                log.debug(
                        "[TYPE3] Unsupported Type3 charCode {} for font {} (only 1-byte codes supported)",
                        charCode,
                        fontModel.getId());
                mappedAll = false;
                break;
            }
            baos.write(charCode);
        }
        if (mappedAll) {
            return sanitizeEncoded(baos.toByteArray());
        }
        // Fallback to rawCharCodes for actual Type3 fonts if mapping failed
        if (rawCharCodes != null && !rawCharCodes.isEmpty()) {
            boolean valid = true;
            ByteArrayOutputStream fallbackBytes = new ByteArrayOutputStream(rawCharCodes.size());
            for (Integer code : rawCharCodes) {
                if (code == null || code < 0 || code > 0xFF) {
                    valid = false;
                    break;
                }
                fallbackBytes.write(code);
            }
            if (valid) {
                return fallbackBytes.toByteArray();
            }
        }
        return null;
    }

    private byte[] encodeType3CharCodes(List<Integer> charCodes) {
        if (charCodes == null || charCodes.isEmpty()) {
            return null;
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream(charCodes.size());
        for (Integer code : charCodes) {
            if (code == null || code < 0 || code > 0xFF) {
                return null;
            }
            baos.write(code);
        }
        return baos.toByteArray();
    }

    private byte[] sanitizeEncoded(byte[] encoded) {
        if (encoded == null || encoded.length == 0) {
            return new byte[0];
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream(encoded.length);
        for (byte b : encoded) {
            if (isStrippedControlByte(b)) {
                continue;
            }
            baos.write(b);
        }
        byte[] sanitized = baos.toByteArray();
        if (sanitized.length == 0) {
            return sanitized;
        }
        return sanitized;
    }

    private boolean isStrippedControlByte(byte value) {
        if (value == 0) {
            return true;
        }
        int unsigned = Byte.toUnsignedInt(value);
        if (unsigned <= 0x1F) {
            return !(unsigned == 0x09 || unsigned == 0x0A || unsigned == 0x0D);
        }
        return false;
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

    private MergedText mergeText(List<PdfJsonTextElement> elements) {
        StringBuilder builder = new StringBuilder();
        List<Integer> combinedCodes = new ArrayList<>();
        for (PdfJsonTextElement element : elements) {
            builder.append(Objects.toString(element.getText(), ""));
            if (element.getCharCodes() != null && !element.getCharCodes().isEmpty()) {
                combinedCodes.addAll(element.getCharCodes());
            }
        }
        return new MergedText(builder.toString(), combinedCodes.isEmpty() ? null : combinedCodes);
    }

    private record MergedText(String text, List<Integer> charCodes) {}

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
                    log.debug(
                            "Cursor consume failed: font mismatch (expected={}, actual={}) at element {}",
                            expectedFontName,
                            element.getFontId(),
                            index);
                    return null;
                }
                consumed.add(element);
                remaining -= countGlyphs(element);
                index++;
            }
            if (remaining > 0) {
                log.debug(
                        "Cursor consume failed: ran out of elements (remaining={}, currentIndex={}, total={})",
                        remaining,
                        index,
                        elements.size());
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
            List<Integer> codes = element.getCharCodes();
            if (codes != null && !codes.isEmpty()) {
                return codes.size();
            }
            String text = element.getText();
            if (text != null && !text.isEmpty()) {
                return Math.max(1, text.codePointCount(0, text.length()));
            }
            return 1;
        }
    }

    private Map<String, PDFont> buildFontMap(
            PDDocument document, List<PdfJsonFont> fonts, String jobId) throws IOException {
        Map<String, PDFont> fontMap = new HashMap<>();
        if (fonts != null) {
            for (PdfJsonFont fontModel : fonts) {
                if (FALLBACK_FONT_ID.equals(fontModel.getId())) {
                    continue;
                }
                PDFont loadedFont = createFontFromModel(document, fontModel, jobId);
                if (loadedFont != null && fontModel.getId() != null) {
                    // Use null jobId for map keys - JSON->PDF doesn't need job-scoped lookups
                    // The jobId is only used internally for Type3 cache isolation
                    fontMap.put(
                            buildFontKey(null, fontModel.getPageNumber(), fontModel.getId()),
                            loadedFont);
                }
            }
        }

        boolean fallbackPresent =
                fonts != null && fonts.stream().anyMatch(f -> FALLBACK_FONT_ID.equals(f.getId()));
        if (!fallbackPresent) {
            PdfJsonFont fallbackModel = fallbackFontService.buildFallbackFontModel();
            if (fonts != null) {
                fonts.add(fallbackModel);
                log.debug("Added fallback font definition to JSON font list");
            }
            PDFont fallbackFont = createFontFromModel(document, fallbackModel, jobId);
            fontMap.put(buildFontKey(null, -1, FALLBACK_FONT_ID), fallbackFont);
        } else if (!fontMap.containsKey(buildFontKey(null, -1, FALLBACK_FONT_ID))) {
            PdfJsonFont fallbackModel =
                    fonts.stream()
                            .filter(f -> FALLBACK_FONT_ID.equals(f.getId()))
                            .findFirst()
                            .orElse(null);
            if (fallbackModel == null) {
                fallbackModel = fallbackFontService.buildFallbackFontModel();
                fonts.add(fallbackModel);
            }
            PDFont fallbackFont = createFontFromModel(document, fallbackModel, jobId);
            fontMap.put(buildFontKey(null, -1, FALLBACK_FONT_ID), fallbackFont);
        }

        return fontMap;
    }

    private PDFont createFontFromModel(PDDocument document, PdfJsonFont fontModel, String jobId)
            throws IOException {
        if (fontModel == null || fontModel.getId() == null) {
            return null;
        }

        if (FALLBACK_FONT_ID.equals(fontModel.getId())) {
            return fallbackFontService.loadFallbackPdfFont(document);
        }

        log.debug(
                "[FONT-LOAD] Loading font {} (subtype={}, hasCosDictionary={}, hasProgram={}, hasPdfProgram={}, hasWebProgram={})",
                fontModel.getId(),
                fontModel.getSubtype(),
                fontModel.getCosDictionary() != null,
                fontModel.getProgram() != null && !fontModel.getProgram().isBlank(),
                fontModel.getPdfProgram() != null && !fontModel.getPdfProgram().isBlank(),
                fontModel.getWebProgram() != null && !fontModel.getWebProgram().isBlank());

        String originalFormat =
                fontModel.getProgramFormat() != null
                        ? fontModel.getProgramFormat().toLowerCase(Locale.ROOT)
                        : null;

        String program = fontModel.getProgram();
        String webProgram = fontModel.getWebProgram();
        String pdfProgram = fontModel.getPdfProgram();
        String webFormat =
                fontModel.getWebProgramFormat() != null
                        ? fontModel.getWebProgramFormat().toLowerCase(Locale.ROOT)
                        : null;
        String pdfFormat =
                fontModel.getPdfProgramFormat() != null
                        ? fontModel.getPdfProgramFormat().toLowerCase(Locale.ROOT)
                        : null;

        List<FontByteSource> baseCandidates = new ArrayList<>();
        List<FontByteSource> deferredWebCandidates = new ArrayList<>();

        boolean hasPdfProgram = pdfProgram != null && !pdfProgram.isBlank();
        boolean hasWebProgram = webProgram != null && !webProgram.isBlank();

        if (hasPdfProgram) {
            try {
                byte[] bytes = Base64.getDecoder().decode(pdfProgram);
                if (bytes.length > 0) {
                    baseCandidates.add(new FontByteSource(bytes, pdfFormat, "pdfProgram"));
                }
            } catch (IllegalArgumentException ex) {
                log.warn(
                        "Failed to decode pdfProgram for {}: {}",
                        fontModel.getId(),
                        ex.getMessage());
            }
        }

        if (hasWebProgram) {
            try {
                byte[] bytes = Base64.getDecoder().decode(webProgram);
                if (bytes.length > 0) {
                    // Prefer the converted blob when the original program is CFF/Type1C, because
                    // PDFBox expects TrueType/OpenType data during reconstruction.
                    boolean preferWeb =
                            originalFormat == null
                                    || isCffFormat(originalFormat)
                                    || "cidfonttype0c".equals(originalFormat);
                    FontByteSource source = new FontByteSource(bytes, webFormat, "webProgram");
                    if (preferWeb) {
                        baseCandidates.add(source);
                    } else {
                        // Keep the converted blob as a secondary option in case loading the
                        // original program fails: some PDFs mix Type1 metadata with actual CFF
                        // payloads that PDFBox cannot parse.
                        deferredWebCandidates.add(source);
                    }
                }
            } catch (IllegalArgumentException ex) {
                log.warn(
                        "Failed to decode webProgram for {}: {}",
                        fontModel.getId(),
                        ex.getMessage());
            }
        }

        if (program != null && !program.isBlank()) {
            try {
                byte[] bytes = Base64.getDecoder().decode(program);
                if (bytes.length > 0) {
                    // Original bytes should still be attempted. When we already preferred the
                    // converted blob, these will be appended as fallback.
                    baseCandidates.add(new FontByteSource(bytes, originalFormat, "program"));
                }
            } catch (IllegalArgumentException ex) {
                log.warn(
                        "Failed to decode font program for {}: {}",
                        fontModel.getId(),
                        ex.getMessage());
            }
        }

        // If no candidates were added (e.g. both payloads missing/invalid) attempt to fall back to
        // the converted program when it exists but we skipped it earlier.
        if (baseCandidates.isEmpty() && hasWebProgram) {
            try {
                byte[] bytes = Base64.getDecoder().decode(webProgram);
                if (bytes.length > 0) {
                    baseCandidates.add(new FontByteSource(bytes, webFormat, "webProgram"));
                }
            } catch (IllegalArgumentException ignored) {
                // Already logged above when decoding failed the first time.
            }
        }

        baseCandidates.addAll(deferredWebCandidates);

        List<FontByteSource> conversionCandidates =
                collectConversionCandidateSources(fontModel.getConversionCandidates());

        List<FontByteSource> orderedCandidates = new ArrayList<>();
        if (!conversionCandidates.isEmpty()) {
            orderedCandidates.addAll(conversionCandidates);
        }
        orderedCandidates.addAll(baseCandidates);

        boolean isType3Font =
                fontModel.getSubtype() != null && "type3".equalsIgnoreCase(fontModel.getSubtype());
        if (isType3Font) {
            // Generate new UID with current jobId to prevent cache collisions across conversions
            String type3CacheKey =
                    buildFontKey(jobId, fontModel.getPageNumber(), fontModel.getId());

            // Update fontModel UID so runtime lookups use the same key
            fontModel.setUid(type3CacheKey);

            cacheType3NormalizedFont(
                    document, fontModel, orderedCandidates, originalFormat, type3CacheKey);
            PDFont cachedNormalized = type3NormalizedFontCache.get(type3CacheKey);
            if (cachedNormalized != null) {
                log.debug("Using cached normalized font for Type3 {}", fontModel.getId());
                return cachedNormalized;
            }
            PDFont restored = restoreFontFromDictionary(document, fontModel);
            if (restored != null) {
                return restored;
            }
            // Fall through to Standard14 fallback below if nothing else succeeded.
        } else {
            // For TrueType and Type0 fonts, prioritize cosDictionary restoration
            // These fonts often use ToUnicode CMap which is preserved in the dictionary
            String subtype = fontModel.getSubtype();
            boolean preferDictionary =
                    subtype != null
                            && (subtype.equalsIgnoreCase("TrueType")
                                    || subtype.equalsIgnoreCase("Type0"));

            if (preferDictionary) {
                PDFont restored = restoreFontFromDictionary(document, fontModel);
                if (restored != null) {
                    log.debug(
                            "Font {} restored from cosDictionary (preferred for subsetted {})",
                            fontModel.getId(),
                            subtype);
                    return restored;
                }
                // If dictionary restoration fails, fall back to font program bytes
                log.debug(
                        "Font {} cosDictionary restoration failed, trying font program bytes",
                        fontModel.getId());
            }

            PDFont loaded =
                    loadFirstAvailableFont(document, fontModel, orderedCandidates, originalFormat);
            if (loaded != null) {
                return loaded;
            }

            // Try to restore from COS dictionary if font programs failed and we haven't tried yet
            if (!preferDictionary) {
                PDFont restored = restoreFontFromDictionary(document, fontModel);
                if (restored != null) {
                    return restored;
                }
            }
        }

        for (FontByteSource source : orderedCandidates) {
            byte[] fontBytes = source.bytes();
            String format = source.format();
            String originLabel = source.originLabel();

            if (fontBytes == null || fontBytes.length == 0) {
                continue;
            }

            try {
                PDFont font =
                        loadFontFromSource(
                                document, fontModel, source, originalFormat, false, false, false);
                if (font != null) {
                    return font;
                }
            } catch (IOException ex) {
                // loadFontFromSource already logged details.
            }
        }

        PDFont restored = restoreFontFromDictionary(document, fontModel);
        if (restored != null) {
            return restored;
        }

        log.warn(
                "Font {} has no usable program bytes (originalFormat: {}, hasWebProgram: {}, hasPdfProgram: {})",
                fontModel.getId(),
                originalFormat,
                hasWebProgram,
                hasPdfProgram);

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

        // Last resort: Fuzzy match baseName against Standard14 fonts
        Standard14Fonts.FontName fuzzyMatch = fuzzyMatchStandard14(fontModel.getBaseName());
        if (fuzzyMatch != null) {
            log.debug(
                    "Fuzzy-matched font {} (baseName: {}) to Standard14 font {}",
                    fontModel.getId(),
                    fontModel.getBaseName(),
                    fuzzyMatch.getName());
            PDFont font = new PDType1Font(fuzzyMatch);
            applyAdditionalFontMetadata(document, font, fontModel);
            return font;
        }

        PDFont fallback = fallbackFontService.loadFallbackPdfFont(document);
        applyAdditionalFontMetadata(document, fallback, fontModel);
        return fallback;
    }

    private void cacheType3NormalizedFont(
            PDDocument document,
            PdfJsonFont fontModel,
            List<FontByteSource> candidates,
            String originalFormat,
            String cacheKey)
            throws IOException {
        if (cacheKey == null || candidates == null || candidates.isEmpty()) {
            return;
        }
        if (type3NormalizedFontCache.containsKey(cacheKey)) {
            return;
        }
        for (FontByteSource source : candidates) {
            PDFont font =
                    loadFontFromSource(
                            document, fontModel, source, originalFormat, true, true, true);
            if (font != null) {
                type3NormalizedFontCache.put(cacheKey, font);
                log.debug(
                        "Cached normalized font {} for Type3 {} (key: {})",
                        source.originLabel(),
                        fontModel.getId(),
                        cacheKey);
                break;
            }
        }
    }

    private PDFont loadFirstAvailableFont(
            PDDocument document,
            PdfJsonFont fontModel,
            List<FontByteSource> candidates,
            String originalFormat)
            throws IOException {
        for (FontByteSource source : candidates) {
            PDFont font =
                    loadFontFromSource(
                            document, fontModel, source, originalFormat, false, false, false);
            if (font != null) {
                return font;
            }
        }
        return null;
    }

    private PDFont loadFontFromSource(
            PDDocument document,
            PdfJsonFont fontModel,
            FontByteSource source,
            String originalFormat,
            boolean suppressWarn,
            boolean skipMetadataLog,
            boolean skipMetadata)
            throws IOException {
        if (source == null) {
            return null;
        }
        byte[] fontBytes = source.bytes();
        if (fontBytes == null || fontBytes.length == 0) {
            return null;
        }
        String format = source.format();
        String originLabel = source.originLabel();
        try {
            if (!skipMetadataLog) {
                log.debug(
                        "[FONT-DEBUG] Attempting to load font {} using payload {} (format={}, size={} bytes)",
                        fontModel.getId(),
                        originLabel,
                        format,
                        fontBytes.length);
            }
            if (isType1Format(format)) {
                try (InputStream stream = new ByteArrayInputStream(fontBytes)) {
                    PDFont font = new PDType1Font(document, stream);
                    if (!skipMetadata) {
                        applyAdditionalFontMetadata(document, font, fontModel);
                    }
                    log.debug(
                            "Successfully loaded Type1 font {} from {} bytes (format: {}, originalFormat: {})",
                            fontModel.getId(),
                            originLabel,
                            format,
                            originalFormat);
                    return font;
                }
            }
            try (InputStream stream = new ByteArrayInputStream(fontBytes)) {
                // For library fonts (Type3 normalized fonts), load WITHOUT subsetting
                // so all glyphs are available for editing
                boolean willBeSubset = !originLabel.contains("type3-library");
                if (!willBeSubset) {
                    log.debug(
                            "[TYPE3-RUNTIME] Loading library font {} WITHOUT subsetting (full glyph set) from {}",
                            fontModel.getId(),
                            originLabel);
                }
                PDFont font = PDType0Font.load(document, stream, willBeSubset);
                if (!skipMetadata) {
                    applyAdditionalFontMetadata(document, font, fontModel);
                }
                log.debug(
                        "Successfully loaded Type0 font {} from {} bytes (format: {}, originalFormat: {}, subset: {})",
                        fontModel.getId(),
                        originLabel,
                        format,
                        originalFormat,
                        willBeSubset);
                return font;
            }
        } catch (IOException ex) {
            if (suppressWarn) {
                log.debug(
                        "Unable to load embedded font program for {} from {} (format: {}, originalFormat: {}): {}",
                        fontModel.getId(),
                        originLabel,
                        format,
                        originalFormat,
                        ex.getMessage());
            } else {
                log.warn(
                        "Unable to load embedded font program for {} from {} (format: {}, originalFormat: {}): {}",
                        fontModel.getId(),
                        originLabel,
                        format,
                        originalFormat,
                        ex.getMessage());
            }
            return null;
        }
    }

    private PDFont restoreFontFromDictionary(PDDocument document, PdfJsonFont fontModel)
            throws IOException {
        if (fontModel.getCosDictionary() == null) {
            log.debug("[FONT-RESTORE] Font {} has no cosDictionary", fontModel.getId());
            return null;
        }

        // Deserialize the cosDictionary - cosMapper handles validation internally
        COSBase restored;
        try {
            restored = cosMapper.deserializeCosValue(fontModel.getCosDictionary(), document);
        } catch (Exception ex) {
            log.warn(
                    "[FONT-RESTORE] Font {} cosDictionary deserialization failed: {}",
                    fontModel.getId(),
                    ex.getMessage());
            return null;
        }

        if (!(restored instanceof COSDictionary cosDictionary)) {
            log.warn(
                    "[FONT-RESTORE] Font {} cosDictionary deserialized to {} instead of COSDictionary",
                    fontModel.getId(),
                    restored != null ? restored.getClass().getSimpleName() : "null");
            return null;
        }

        // Validate that dictionary contains required font keys
        if (!cosDictionary.containsKey(org.apache.pdfbox.cos.COSName.TYPE)
                || !cosDictionary.containsKey(org.apache.pdfbox.cos.COSName.SUBTYPE)) {
            log.warn(
                    "[FONT-RESTORE] Font {} cosDictionary missing required Type or Subtype keys",
                    fontModel.getId());
            return null;
        }

        try {
            PDFont font = PDFontFactory.createFont(cosDictionary);
            if (font == null) {
                log.warn(
                        "[FONT-RESTORE] Font {} PDFontFactory returned null for valid dictionary",
                        fontModel.getId());
                return null;
            }

            if (!font.isEmbedded()) {
                log.warn(
                        "[FONT-RESTORE] Font {} restored from dictionary but is not embedded; rejecting to avoid system font substitution",
                        fontModel.getId());
                return null;
            }

            applyAdditionalFontMetadata(document, font, fontModel);
            log.debug(
                    "[FONT-RESTORE] Successfully restored embedded font {} (subtype={}) from original dictionary",
                    fontModel.getId(),
                    font.getSubType());
            return font;

        } catch (IOException ex) {
            log.warn(
                    "[FONT-RESTORE] Failed to restore font {} from dictionary ({}): {}",
                    fontModel.getId(),
                    fontModel.getSubtype(),
                    ex.getMessage());
            return null;
        } catch (Exception ex) {
            log.error(
                    "[FONT-RESTORE] Unexpected error restoring font {} from dictionary: {}",
                    fontModel.getId(),
                    ex.getMessage(),
                    ex);
            return null;
        }
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
        private final Map<COSBase, EncodedImage> imageCache;

        private COSName currentXObjectName;
        private int imageCounter = 0;

        protected ImageCollectingEngine(
                PDPage page,
                int pageNumber,
                Map<Integer, List<PdfJsonImageElement>> imagesByPage,
                Map<COSBase, EncodedImage> imageCache)
                throws IOException {
            super(page);
            this.pageNumber = pageNumber;
            this.imagesByPage = imagesByPage;
            this.imageCache = imageCache;
        }

        @Override
        public void processPage(PDPage page) throws IOException {
            super.processPage(page);
        }

        @Override
        public void drawImage(PDImage pdImage) throws IOException {
            EncodedImage encoded = getOrEncodeImage(pdImage);
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

        private EncodedImage getOrEncodeImage(PDImage pdImage) {
            if (pdImage == null) {
                return null;
            }

            if (pdImage instanceof PDImageXObject xObject) {
                if (xObject.isStencil()) {
                    return encodeImage(pdImage);
                }
                COSBase key = xObject.getCOSObject();
                EncodedImage cached = imageCache.get(key);
                if (cached != null) {
                    return cached;
                }
                EncodedImage encoded = encodeImage(pdImage);
                if (encoded != null) {
                    imageCache.put(key, encoded);
                }
                return encoded;
            }

            return encodeImage(pdImage);
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
        private final Map<COSBase, FontModelCacheEntry> fontCache;
        private final String jobId;

        private int currentPage = 1;
        private Map<PDFont, String> currentFontResources = Collections.emptyMap();
        private int currentZOrderCounter;

        TextCollectingStripper(
                PDDocument document,
                Map<String, PdfJsonFont> fonts,
                Map<Integer, List<PdfJsonTextElement>> textByPage,
                Map<Integer, Map<PDFont, String>> pageFontResources,
                Map<COSBase, FontModelCacheEntry> fontCache,
                String jobId)
                throws IOException {
            this.document = document;
            this.fonts = fonts;
            this.textByPage = textByPage;
            this.pageFontResources = pageFontResources;
            this.fontCache = fontCache != null ? fontCache : new IdentityHashMap<>();
            this.jobId = jobId;
        }

        @Override
        protected void startPage(PDPage page) throws IOException {
            super.startPage(page);
            currentPage = getCurrentPageNo();
            currentFontResources =
                    pageFontResources.getOrDefault(currentPage, Collections.emptyMap());
            currentZOrderCounter = 0;
        }

        @Override
        protected void writeString(String text, List<TextPosition> textPositions)
                throws IOException {
            if (textPositions == null || textPositions.isEmpty()) {
                return;
            }
            List<PdfJsonTextElement> pageElements =
                    textByPage.computeIfAbsent(currentPage, key -> new ArrayList<>());

            TextRunAccumulator accumulator = null;
            for (TextPosition position : textPositions) {
                PDFont font = position.getFont();
                String fontId = registerFont(font);
                PdfJsonTextElement element = createTextElement(position, fontId, font);

                if (accumulator == null) {
                    accumulator = new TextRunAccumulator(element, position);
                } else if (!accumulator.canAppend(element, position)) {
                    PdfJsonTextElement built = accumulator.build();
                    built.setZOrder(1_000_000 + currentZOrderCounter++);
                    pageElements.add(built);
                    accumulator = new TextRunAccumulator(element, position);
                } else {
                    accumulator.append(element, position);
                }
            }

            if (accumulator != null) {
                PdfJsonTextElement built = accumulator.build();
                built.setZOrder(1_000_000 + currentZOrderCounter++);
                pageElements.add(built);
            }
        }

        private PdfJsonTextElement createTextElement(
                TextPosition position, String fontId, PDFont pdfont) throws IOException {
            PdfJsonTextElement element = new PdfJsonTextElement();
            element.setText(position.getUnicode());
            element.setFontId(fontId);
            element.setFontSize(position.getFontSizeInPt());
            element.setX(position.getXDirAdj());
            element.setY(position.getYDirAdj());
            element.setWidth(position.getWidthDirAdj());
            element.setHeight(position.getHeightDir());
            element.setTextMatrix(extractMatrix(position));
            element.setFontMatrixSize(computeFontMatrixSize(element.getTextMatrix()));
            element.setSpaceWidth(position.getWidthOfSpace());
            if (pdfont instanceof PDType3Font) {
                int[] codes = position.getCharacterCodes();
                if (codes != null && codes.length > 0) {
                    List<Integer> codeList = new ArrayList<>(codes.length);
                    for (int code : codes) {
                        if (code >= 0) {
                            codeList.add(code);
                        }
                    }
                    if (!codeList.isEmpty()) {
                        element.setCharCodes(codeList);
                    }
                }
            }

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
            return element;
        }

        private void compactTextElement(PdfJsonTextElement element) {
            if (element == null) {
                return;
            }

            List<Float> matrix = element.getTextMatrix();
            if (matrix != null) {
                if (matrix.isEmpty()) {
                    element.setTextMatrix(null);
                } else if (matrix.size() == 6) {
                    element.setX(null);
                    element.setY(null);
                }
            }

            if (isZero(element.getCharacterSpacing())) {
                element.setCharacterSpacing(null);
            }
            if (isZero(element.getWordSpacing())) {
                element.setWordSpacing(null);
            }
            if (isZero(element.getLeading())) {
                element.setLeading(null);
            }
            if (isZero(element.getRise())) {
                element.setRise(null);
            }
            if (element.getHorizontalScaling() != null
                    && Math.abs(element.getHorizontalScaling() - 100f) < FLOAT_EPSILON) {
                element.setHorizontalScaling(null);
            }
            if (element.getRenderingMode() != null && element.getRenderingMode() == 0) {
                element.setRenderingMode(null);
            }
            if (isDefaultBlack(element.getFillColor())) {
                element.setFillColor(null);
            }
            if (isDefaultBlack(element.getStrokeColor())) {
                element.setStrokeColor(null);
            }
        }

        private boolean isZero(Float value) {
            return value != null && Math.abs(value) < FLOAT_EPSILON;
        }

        private boolean isDefaultBlack(PdfJsonTextColor color) {
            if (color == null || color.getComponents() == null) {
                return true;
            }
            List<Float> components = color.getComponents();
            if (components.isEmpty()) {
                return true;
            }
            String space = color.getColorSpace();
            if (space == null || "DeviceRGB".equals(space)) {
                if (components.size() < 3) {
                    return false;
                }
                return Math.abs(components.get(0)) < FLOAT_EPSILON
                        && Math.abs(components.get(1)) < FLOAT_EPSILON
                        && Math.abs(components.get(2)) < FLOAT_EPSILON;
            }
            if ("DeviceGray".equals(space)) {
                return Math.abs(components.get(0)) < FLOAT_EPSILON;
            }
            return false;
        }

        private Float baselineFrom(PdfJsonTextElement element) {
            List<Float> matrix = element.getTextMatrix();
            if (matrix != null && matrix.size() >= 6) {
                return matrix.get(5);
            }
            return element.getY();
        }

        private TextStyleKey buildStyleKey(PdfJsonTextElement element) {
            return new TextStyleKey(
                    element.getFontId(),
                    element.getFontSize(),
                    element.getFontMatrixSize(),
                    element.getCharacterSpacing(),
                    element.getWordSpacing(),
                    element.getHorizontalScaling(),
                    element.getLeading(),
                    element.getRise(),
                    element.getFillColor(),
                    element.getStrokeColor(),
                    element.getRenderingMode(),
                    element.getSpaceWidth());
        }

        private class TextRunAccumulator {
            private final PdfJsonTextElement baseElement;
            private final TextStyleKey styleKey;
            private final float orientationA;
            private final float orientationB;
            private final float orientationC;
            private final float orientationD;
            private final Float baseline;
            private final List<Float> baseMatrix;
            private final float startXCoord;
            private final float startYCoord;
            private final StringBuilder textBuilder = new StringBuilder();
            private final List<Integer> charCodeBuffer = new ArrayList<>();
            private float totalWidth;
            private float maxHeight;
            private float endXCoord;

            TextRunAccumulator(PdfJsonTextElement element, TextPosition position) {
                this.baseElement = element;
                this.styleKey = buildStyleKey(element);
                this.baseMatrix =
                        element.getTextMatrix() != null
                                ? new ArrayList<>(element.getTextMatrix())
                                : null;
                if (baseMatrix != null && baseMatrix.size() >= 6) {
                    orientationA = baseMatrix.get(0);
                    orientationB = baseMatrix.get(1);
                    orientationC = baseMatrix.get(2);
                    orientationD = baseMatrix.get(3);
                    startXCoord = baseMatrix.get(4);
                    startYCoord = baseMatrix.get(5);
                } else {
                    orientationA = 1f;
                    orientationB = 0f;
                    orientationC = 0f;
                    orientationD = 1f;
                    startXCoord = element.getX() != null ? element.getX() : 0f;
                    startYCoord = element.getY() != null ? element.getY() : 0f;
                }
                this.baseline = baselineFrom(element);
                this.totalWidth = element.getWidth() != null ? element.getWidth() : 0f;
                this.maxHeight = element.getHeight() != null ? element.getHeight() : 0f;
                this.endXCoord = position.getXDirAdj() + position.getWidthDirAdj();
                this.textBuilder.append(element.getText());
                if (element.getCharCodes() != null) {
                    charCodeBuffer.addAll(element.getCharCodes());
                }
            }

            boolean canAppend(PdfJsonTextElement element, TextPosition position) {
                if (!styleKey.equals(buildStyleKey(element))) {
                    return false;
                }
                List<Float> matrix = element.getTextMatrix();
                float a = 1f;
                float b = 0f;
                float c = 0f;
                float d = 1f;
                if (matrix != null && matrix.size() >= 4) {
                    a = matrix.get(0);
                    b = matrix.get(1);
                    c = matrix.get(2);
                    d = matrix.get(3);
                }
                if (Math.abs(a - orientationA) > ORIENTATION_TOLERANCE
                        || Math.abs(b - orientationB) > ORIENTATION_TOLERANCE
                        || Math.abs(c - orientationC) > ORIENTATION_TOLERANCE
                        || Math.abs(d - orientationD) > ORIENTATION_TOLERANCE) {
                    return false;
                }

                Float otherBaseline = baselineFrom(element);
                if (baseline != null && otherBaseline != null) {
                    if (Math.abs(otherBaseline - baseline) > BASELINE_TOLERANCE) {
                        return false;
                    }
                } else if (baseline != null || otherBaseline != null) {
                    return false;
                }

                return true;
            }

            void append(PdfJsonTextElement element, TextPosition position) {
                textBuilder.append(element.getText());
                float width =
                        element.getWidth() != null ? element.getWidth() : position.getWidthDirAdj();
                totalWidth += width;
                float height =
                        element.getHeight() != null ? element.getHeight() : position.getHeightDir();
                if (height > maxHeight) {
                    maxHeight = height;
                }
                endXCoord = position.getXDirAdj() + position.getWidthDirAdj();
                if (element.getCharCodes() != null) {
                    charCodeBuffer.addAll(element.getCharCodes());
                }
            }

            PdfJsonTextElement build() {
                PdfJsonTextElement result = baseElement;
                result.setText(textBuilder.toString());
                float widthCandidate = endXCoord - startXCoord;
                if (widthCandidate > totalWidth) {
                    totalWidth = widthCandidate;
                }
                result.setWidth(totalWidth);
                result.setHeight(maxHeight);
                if (baseMatrix != null && baseMatrix.size() == 6) {
                    List<Float> matrix = new ArrayList<>(baseMatrix);
                    matrix.set(0, orientationA);
                    matrix.set(1, orientationB);
                    matrix.set(2, orientationC);
                    matrix.set(3, orientationD);
                    matrix.set(4, startXCoord);
                    matrix.set(5, startYCoord);
                    result.setTextMatrix(matrix);
                    result.setX(null);
                    result.setY(null);
                }
                if (charCodeBuffer.isEmpty()) {
                    result.setCharCodes(null);
                } else {
                    result.setCharCodes(new ArrayList<>(charCodeBuffer));
                }
                compactTextElement(result);
                return result;
            }
        }

        private record TextStyleKey(
                String fontId,
                Float fontSize,
                Float fontMatrixSize,
                Float characterSpacing,
                Float wordSpacing,
                Float horizontalScaling,
                Float leading,
                Float rise,
                PdfJsonTextColor fillColor,
                PdfJsonTextColor strokeColor,
                Integer renderingMode,
                Float spaceWidth) {}

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
            String key = buildFontKey(jobId, currentPage, fontId);
            if (!fonts.containsKey(key)) {
                fonts.put(
                        key, buildFontModel(document, font, fontId, currentPage, fontCache, jobId));
            }
            return fontId;
        }

        private PdfJsonTextColor toTextColor(PDColor color) {
            if (color == null) {
                return null;
            }
            PDColorSpace colorSpace = color.getColorSpace();
            if (colorSpace == null) {
                log.debug("[ColorCapture] No color space for PDColor {}", color);
                return null;
            }
            float[] components = color.getComponents();
            String colorSpaceName = colorSpace.getName();
            float[] effective = components;
            try {
                float[] rgb = colorSpace.toRGB(components);
                if (rgb != null && rgb.length >= 3) {
                    effective = rgb;
                    colorSpaceName = COSName.DEVICERGB.getName();
                }
            } catch (IOException ex) {
                log.debug(
                        "[ColorCapture] Failed to convert color space {} to RGB: {}",
                        colorSpaceName,
                        ex.getMessage());
            }
            List<Float> values = new ArrayList<>(effective.length);
            for (float component : effective) {
                values.add(component);
            }
            return PdfJsonTextColor.builder().colorSpace(colorSpaceName).components(values).build();
        }

        private String sanitizeForLog(String value) {
            if (value == null) {
                return "null";
            }
            return value.replace("\n", "\\n").replace("\r", "\\r");
        }

        private String describeColor(PdfJsonTextColor color) {
            if (color == null || color.getComponents() == null) {
                return "null";
            }
            return color.getColorSpace() + "=" + color.getComponents();
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

    /**
     * Get the job ID from the current request context
     *
     * @return The job ID, or null if not in an async job context
     */
    private String getJobIdFromRequest() {
        // First check ThreadLocal (for async jobs)
        String jobId = stirling.software.common.util.JobContext.getJobId();
        if (jobId != null) {
            log.debug("Retrieved jobId from JobContext: {}", jobId);
            return jobId;
        }

        // Fallback to request attribute (for sync jobs)
        try {
            org.springframework.web.context.request.RequestAttributes attrs =
                    org.springframework.web.context.request.RequestContextHolder
                            .getRequestAttributes();
            if (attrs instanceof org.springframework.web.context.request.ServletRequestAttributes) {
                jakarta.servlet.http.HttpServletRequest request =
                        ((org.springframework.web.context.request.ServletRequestAttributes) attrs)
                                .getRequest();
                jobId = (String) request.getAttribute("jobId");
                if (jobId != null) {
                    log.debug("Retrieved jobId from request attribute: {}", jobId);
                    return jobId;
                }
            }
        } catch (Exception e) {
            log.debug("Could not retrieve job ID from request context: {}", e.getMessage());
        }
        return null;
    }

    /**
     * Report progress to TaskManager for async jobs
     *
     * @param jobId The job ID
     * @param progress The progress update
     */
    private void reportProgressToTaskManager(String jobId, PdfJsonConversionProgress progress) {
        try {
            log.debug(
                    "Reporting progress for job {}: {}% - {}",
                    jobId, progress.getPercent(), progress.getStage());
            // Add progress note to job
            String note;
            if (progress.getCurrent() != null && progress.getTotal() != null) {
                note =
                        String.format(
                                "[%d%%] %s: %s (%d/%d)",
                                progress.getPercent(),
                                progress.getStage(),
                                progress.getMessage(),
                                progress.getCurrent(),
                                progress.getTotal());
            } else {
                note =
                        String.format(
                                "[%d%%] %s: %s",
                                progress.getPercent(), progress.getStage(), progress.getMessage());
            }
            boolean added = taskManager.addNote(jobId, note);
            if (!added) {
                log.warn("Failed to add note - job {} not found in TaskManager", jobId);
            } else {
                log.debug("Successfully added progress note for job {}: {}", jobId, note);
            }
        } catch (Exception e) {
            log.error("Exception reporting progress for job {}: {}", jobId, e.getMessage(), e);
        }
    }

    // ========================================================================
    // Lazy Page Loading Support
    // ========================================================================

    /**
     * Stores PDF bytes for lazy page loading. Each page is extracted on-demand by re-loading the
     * PDF from bytes.
     */
    private static class CachedPdfDocument {
        private final byte[] pdfBytes;
        private final TempFile pdfTempFile;
        private final long pdfSize;
        private final PdfJsonDocumentMetadata metadata;
        private final Map<String, PdfJsonFont> fonts; // Font map with UIDs for consistency
        private final Map<Integer, Map<PDFont, String>> pageFontResources; // Page font resources
        private final long timestamp;

        public CachedPdfDocument(
                byte[] pdfBytes,
                TempFile pdfTempFile,
                long pdfSize,
                PdfJsonDocumentMetadata metadata,
                Map<String, PdfJsonFont> fonts,
                Map<Integer, Map<PDFont, String>> pageFontResources) {
            this.pdfBytes = pdfBytes;
            this.pdfTempFile = pdfTempFile;
            this.pdfSize = pdfSize;
            this.metadata = metadata;
            // Create defensive copies to prevent mutation of shared maps
            this.fonts =
                    fonts != null
                            ? new java.util.concurrent.ConcurrentHashMap<>(fonts)
                            : new java.util.concurrent.ConcurrentHashMap<>();
            this.pageFontResources =
                    pageFontResources != null
                            ? new java.util.concurrent.ConcurrentHashMap<>(pageFontResources)
                            : new java.util.concurrent.ConcurrentHashMap<>();
            this.timestamp = System.currentTimeMillis();
        }

        // Getters return defensive copies to prevent external mutation
        public byte[] getPdfBytes() throws IOException {
            if (pdfBytes != null) {
                return pdfBytes;
            }
            if (pdfTempFile != null) {
                return Files.readAllBytes(pdfTempFile.getPath());
            }
            throw new IOException("Cached PDF backing missing");
        }

        public PdfJsonDocumentMetadata getMetadata() {
            return metadata;
        }

        public Map<String, PdfJsonFont> getFonts() {
            return new java.util.concurrent.ConcurrentHashMap<>(fonts);
        }

        public Map<Integer, Map<PDFont, String>> getPageFontResources() {
            return new java.util.concurrent.ConcurrentHashMap<>(pageFontResources);
        }

        public long getPdfSize() {
            return pdfSize;
        }

        public long getInMemorySize() {
            return pdfBytes != null ? pdfBytes.length : 0L;
        }

        public boolean isDiskBacked() {
            return pdfBytes == null && pdfTempFile != null;
        }

        public long getTimestamp() {
            return timestamp;
        }

        public CachedPdfDocument withUpdatedPdfBytes(byte[] nextBytes) {
            return withUpdatedFonts(nextBytes, this.fonts);
        }

        public CachedPdfDocument withUpdatedFonts(
                byte[] nextBytes, Map<String, PdfJsonFont> nextFonts) {
            Map<String, PdfJsonFont> fontsToUse = nextFonts != null ? nextFonts : this.fonts;
            return new CachedPdfDocument(
                    nextBytes,
                    null,
                    nextBytes != null ? nextBytes.length : 0,
                    metadata,
                    fontsToUse,
                    pageFontResources);
        }

        public void close() {
            if (pdfTempFile != null) {
                pdfTempFile.close();
            }
        }
    }

    /**
     * Extracts document metadata, fonts, and page dimensions without page content. Caches the PDF
     * bytes for subsequent page requests.
     */
    public byte[] extractDocumentMetadata(MultipartFile file, String jobId) throws IOException {
        if (file == null) {
            throw ExceptionUtils.createNullArgumentException("fileInput");
        }

        Consumer<PdfJsonConversionProgress> progress =
                jobId != null
                        ? (p) -> {
                            log.debug(
                                    "Progress: [{}%] {} - {}{}",
                                    p.getPercent(),
                                    p.getStage(),
                                    p.getMessage(),
                                    (p.getCurrent() != null && p.getTotal() != null)
                                            ? String.format(
                                                    " (%d/%d)", p.getCurrent(), p.getTotal())
                                            : "");
                            reportProgressToTaskManager(jobId, p);
                        }
                        : (p) -> {};

        // Read PDF bytes once for processing and caching
        byte[] pdfBytes = file.getBytes();

        try (PDDocument document = pdfDocumentFactory.load(pdfBytes, true)) {
            int totalPages = document.getNumberOfPages();

            // Extract fonts
            progress.accept(
                    PdfJsonConversionProgress.of(30, "fonts", "Collecting font information"));
            Map<String, PdfJsonFont> fonts = new LinkedHashMap<>();
            Map<Integer, Map<PDFont, String>> pageFontResources = new HashMap<>();
            Map<COSBase, FontModelCacheEntry> fontCache = new IdentityHashMap<>();
            int pageNumber = 1;
            for (PDPage page : document.getPages()) {
                Map<PDFont, String> resourceMap =
                        collectFontsForPage(document, page, pageNumber, fonts, fontCache, jobId);
                pageFontResources.put(pageNumber, resourceMap);
                pageNumber++;
            }

            // Build metadata response
            progress.accept(PdfJsonConversionProgress.of(90, "metadata", "Extracting metadata"));
            PdfJsonDocumentMetadata docMetadata = new PdfJsonDocumentMetadata();
            docMetadata.setMetadata(extractMetadata(document));
            docMetadata.setXmpMetadata(extractXmpMetadata(document));

            List<PdfJsonFont> serializedFonts = new ArrayList<>(fonts.values());
            serializedFonts.sort(
                    Comparator.comparing(
                            PdfJsonFont::getUid, Comparator.nullsLast(Comparator.naturalOrder())));
            dedupeFontPayloads(serializedFonts);
            stripFontCosStreamData(serializedFonts);
            docMetadata.setFonts(serializedFonts);

            // Extract page dimensions
            List<PdfJsonPageDimension> pageDimensions = new ArrayList<>();
            int pageIndex = 0;
            for (PDPage page : document.getPages()) {
                PdfJsonPageDimension dim = new PdfJsonPageDimension();
                dim.setPageNumber(pageIndex + 1);
                PDRectangle mediaBox = page.getMediaBox();
                dim.setWidth(mediaBox.getWidth());
                dim.setHeight(mediaBox.getHeight());
                dim.setRotation(page.getRotation());
                pageDimensions.add(dim);
                pageIndex++;
            }
            docMetadata.setPageDimensions(pageDimensions);
            docMetadata.setFormFields(collectFormFields(document));
            docMetadata.setLazyImages(Boolean.TRUE);

            // Cache PDF bytes, metadata, and fonts for lazy page loading
            if (jobId != null) {
                CachedPdfDocument cached =
                        buildCachedDocument(jobId, pdfBytes, docMetadata, fonts, pageFontResources);
                putCachedDocument(jobId, cached);
                log.debug(
                        "Cached PDF bytes ({} bytes, {} pages, {} fonts) for lazy loading, jobId: {} (diskBacked={})",
                        cached.getPdfSize(),
                        totalPages,
                        fonts.size(),
                        jobId,
                        cached.isDiskBacked());

                // Schedule cleanup after 30 minutes
                scheduleDocumentCleanup(jobId);
            }

            progress.accept(
                    PdfJsonConversionProgress.of(100, "complete", "Metadata extraction complete"));

            return objectMapper.writeValueAsBytes(docMetadata);
        }
    }

    /** Extracts a single page from cached PDF bytes. Re-loads the PDF for each request. */
    public byte[] extractSinglePage(String jobId, int pageNumber) throws IOException {
        CachedPdfDocument cached = getCachedDocument(jobId);
        if (cached == null) {
            throw new stirling.software.SPDF.exception.CacheUnavailableException(
                    "No cached document found for jobId: " + jobId);
        }

        int pageIndex = pageNumber - 1;
        int totalPages = cached.getMetadata().getPageDimensions().size();

        if (pageIndex < 0 || pageIndex >= totalPages) {
            throw new IllegalArgumentException(
                    "Page number " + pageNumber + " out of range (1-" + totalPages + ")");
        }

        log.debug(
                "Loading PDF from {} to extract page {} (jobId: {})",
                cached.isDiskBacked() ? "disk cache" : "memory cache",
                pageNumber,
                jobId);

        // Re-load PDF from cached bytes and extract the single page
        try (PDDocument document = pdfDocumentFactory.load(cached.getPdfBytes(), true)) {
            PDPage page = document.getPage(pageIndex);
            PdfJsonPage pageModel = new PdfJsonPage();
            pageModel.setPageNumber(pageNumber);
            PDRectangle mediaBox = page.getMediaBox();
            pageModel.setWidth(mediaBox.getWidth());
            pageModel.setHeight(mediaBox.getHeight());
            pageModel.setRotation(page.getRotation());

            // Extract text on-demand using cached fonts (ensures consistent font UIDs)
            // Create thread-local copies to prevent mutation of cached maps
            Map<String, PdfJsonFont> threadLocalFonts =
                    new java.util.concurrent.ConcurrentHashMap<>(cached.getFonts());
            Map<Integer, Map<PDFont, String>> threadLocalPageFontResources =
                    new java.util.concurrent.ConcurrentHashMap<>(cached.getPageFontResources());

            Map<Integer, List<PdfJsonTextElement>> textByPage = new LinkedHashMap<>();
            TextCollectingStripper stripper =
                    new TextCollectingStripper(
                            document,
                            threadLocalFonts,
                            textByPage,
                            threadLocalPageFontResources,
                            new IdentityHashMap<>(),
                            jobId);
            stripper.setStartPage(pageNumber);
            stripper.setEndPage(pageNumber);
            stripper.setSortByPosition(true);
            stripper.getText(document);
            pageModel.setTextElements(textByPage.getOrDefault(pageNumber, List.of()));

            // Extract annotations on-demand
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

                    // For cached page extraction, skip rawData to avoid huge payloads
                    annotations.add(ann);
                } catch (Exception e) {
                    log.warn(
                            "Failed to extract annotation on page {}: {}",
                            pageNumber,
                            e.getMessage());
                }
            }
            pageModel.setAnnotations(annotations);

            // Extract images on-demand
            Map<Integer, List<PdfJsonImageElement>> singlePageImages = new LinkedHashMap<>();
            ImageCollectingEngine engine =
                    new ImageCollectingEngine(
                            page, pageNumber, singlePageImages, new IdentityHashMap<>());
            engine.processPage(page);
            List<PdfJsonImageElement> images = singlePageImages.getOrDefault(pageNumber, List.of());
            pageModel.setImageElements(images);

            // Extract resources and content streams
            COSBase resourcesBase = page.getCOSObject().getDictionaryObject(COSName.RESOURCES);
            COSBase filteredResources = filterImageXObjectsFromResources(resourcesBase);
            pageModel.setResources(
                    cosMapper.serializeCosValue(
                            filteredResources,
                            PdfJsonCosMapper.SerializationContext.RESOURCES_LIGHTWEIGHT));
            pageModel.setContentStreams(extractContentStreams(page, true));

            log.debug(
                    "Extracted page {} (text: {}, images: {}, annotations: {}) for jobId: {}",
                    pageNumber,
                    pageModel.getTextElements().size(),
                    images.size(),
                    pageModel.getAnnotations().size(),
                    jobId);

            return objectMapper.writeValueAsBytes(pageModel);
        }
    }

    public byte[] exportUpdatedPages(String jobId, PdfJsonDocument updates) throws IOException {
        if (jobId == null || jobId.isBlank()) {
            throw new IllegalArgumentException("jobId is required for incremental export");
        }
        log.debug("Looking up cache for jobId: {}", jobId);
        CachedPdfDocument cached = getCachedDocument(jobId);
        if (cached == null) {
            log.error(
                    "Cache not found for jobId: {}. Available cache keys: {}",
                    jobId,
                    documentCache.keySet());
            throw new stirling.software.SPDF.exception.CacheUnavailableException(
                    "No cached document available for jobId: " + jobId);
        }
        log.debug(
                "Found cached document for jobId: {} (size={}, diskBacked={})",
                jobId,
                cached.getPdfSize(),
                cached.isDiskBacked());
        if (updates == null || updates.getPages() == null || updates.getPages().isEmpty()) {
            log.debug(
                    "Incremental export requested with no page updates; returning cached PDF for jobId {}",
                    jobId);
            return cached.getPdfBytes();
        }

        try (PDDocument document = pdfDocumentFactory.load(cached.getPdfBytes(), true)) {
            Map<String, PdfJsonFont> mergedFonts = new LinkedHashMap<>();
            if (cached.getFonts() != null) {
                cached.getFonts()
                        .forEach(
                                (key, value) -> {
                                    PdfJsonFont clone = cloneFont(value);
                                    mergedFonts.put(key, clone != null ? clone : value);
                                });
            }
            if (updates.getFonts() != null) {
                for (PdfJsonFont font : updates.getFonts()) {
                    if (font == null) {
                        continue;
                    }
                    String cacheKey = resolveFontCacheKey(font);
                    if (cacheKey == null) {
                        continue;
                    }
                    PdfJsonFont clone = cloneFont(font);
                    PdfJsonFont toStore = clone != null ? clone : font;
                    mergedFonts.put(cacheKey, toStore);
                    if (toStore.getUid() != null) {
                        type3NormalizedFontCache.remove(toStore.getUid());
                    }
                }
            }

            List<PdfJsonFont> fontModels = new ArrayList<>(mergedFonts.values());
            List<PdfJsonFont> fontModelsCopy = new ArrayList<>(fontModels);
            // Generate synthetic jobId for this incremental update to prevent cache collisions
            String updateJobId = "incremental:" + jobId + ":" + java.util.UUID.randomUUID();
            Map<String, PDFont> fontMap = buildFontMap(document, fontModelsCopy, updateJobId);

            Set<Integer> updatedPages = new HashSet<>();
            for (PdfJsonPage pageModel : updates.getPages()) {
                if (pageModel == null) {
                    continue;
                }
                Integer pageNumber = pageModel.getPageNumber();
                if (pageNumber == null) {
                    log.warn(
                            "Skipping incremental page update without pageNumber for jobId {}",
                            jobId);
                    continue;
                }
                int pageIndex = pageNumber - 1;
                if (pageIndex < 0 || pageIndex >= document.getNumberOfPages()) {
                    log.warn(
                            "Skipping incremental update for out-of-range page {} (jobId {})",
                            pageNumber,
                            jobId);
                    continue;
                }
                PDPage page = document.getPage(pageIndex);
                replacePageContentFromModel(
                        document, page, pageModel, fontMap, fontModelsCopy, pageNumber);
                updatedPages.add(pageIndex);
            }

            if (updatedPages.isEmpty()) {
                log.debug(
                        "Incremental export for jobId {} resulted in no page updates; returning cached PDF",
                        jobId);
                return cached.getPdfBytes();
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            byte[] updatedBytes = baos.toByteArray();

            CachedPdfDocument updated =
                    buildCachedDocument(
                            jobId,
                            updatedBytes,
                            cached.getMetadata(),
                            mergedFonts,
                            cached.getPageFontResources());
            putCachedDocument(jobId, updated);

            // Clear Type3 cache entries for this incremental update
            clearType3CacheEntriesForJob(updateJobId);

            log.debug(
                    "Incremental export complete for jobId {} (pages updated: {})",
                    jobId,
                    updatedPages.stream().map(i -> i + 1).sorted().toList());
            return updatedBytes;
        }
    }

    /** Clears a cached document. */
    public void clearCachedDocument(String jobId) {
        CachedPdfDocument cached = getCachedDocument(jobId);
        removeCachedDocument(jobId);
        if (cached != null) {
            log.debug(
                    "Removed cached PDF ({} bytes, diskBacked={}) for jobId: {}",
                    cached.getPdfSize(),
                    cached.isDiskBacked(),
                    jobId);
        }

        // Clear Type3 caches for this job
        clearType3CacheEntriesForJob(jobId);
    }

    /**
     * Clear job-specific entries from Type3 font caches. Font UIDs include jobId prefix, so we can
     * identify and remove them.
     */
    private void clearType3CacheEntriesForJob(String jobId) {
        if (jobId == null || jobId.isEmpty()) {
            return;
        }

        String jobPrefix = jobId + ":";

        // Collect keys to remove (to avoid ConcurrentModificationException)
        java.util.List<String> keysToRemove = new java.util.ArrayList<>();

        // Find Type3 normalized font keys for this job
        for (String key : type3NormalizedFontCache.keySet()) {
            if (key.startsWith(jobPrefix)) {
                keysToRemove.add(key);
            }
        }

        // Remove collected keys
        for (String key : keysToRemove) {
            type3NormalizedFontCache.remove(key);
        }
        int removedFonts = keysToRemove.size();

        // Find Type3 glyph coverage keys for this job
        keysToRemove.clear();
        for (String key : type3GlyphCoverageCache.keySet()) {
            if (key.startsWith(jobPrefix)) {
                keysToRemove.add(key);
            }
        }

        // Remove collected keys
        for (String key : keysToRemove) {
            type3GlyphCoverageCache.remove(key);
        }
        int removedGlyphs = keysToRemove.size();

        if (removedFonts > 0 || removedGlyphs > 0) {
            log.debug(
                    "Cleared Type3 caches for jobId {}: {} fonts, {} glyph entries",
                    jobId,
                    removedFonts,
                    removedGlyphs);
        }
    }

    private void replacePageContentFromModel(
            PDDocument document,
            PDPage page,
            PdfJsonPage pageModel,
            Map<String, PDFont> fontMap,
            List<PdfJsonFont> fontModels,
            int pageNumberValue)
            throws IOException {
        boolean preserveExistingAnnotations =
                shouldPreserveExistingAnnotations(pageModel.getAnnotations());
        boolean preserveExistingContentStreams =
                shouldPreserveExistingContentStreams(pageModel.getContentStreams());
        boolean preserveExistingResources = shouldPreserveExistingResources(pageModel.getResources());

        PDRectangle currentBox = page.getMediaBox();
        float fallbackWidth = currentBox != null ? currentBox.getWidth() : 612f;
        float fallbackHeight = currentBox != null ? currentBox.getHeight() : 792f;

        float width = safeFloat(pageModel.getWidth(), fallbackWidth);
        float height = safeFloat(pageModel.getHeight(), fallbackHeight);
        PDRectangle newBox = new PDRectangle(width, height);
        page.setMediaBox(newBox);
        page.setCropBox(newBox);

        if (pageModel.getRotation() != null) {
            page.setRotation(pageModel.getRotation());
        }

        if (!preserveExistingResources) {
            applyPageResources(document, page, pageModel.getResources());
        }

        List<PDStream> preservedStreams;
        if (preserveExistingContentStreams) {
            preservedStreams = snapshotExistingContentStreams(page);
        } else {
            preservedStreams = buildContentStreams(document, pageModel.getContentStreams());
            if (preservedStreams.isEmpty()) {
                page.setContents(new ArrayList<>());
            } else {
                page.setContents(preservedStreams);
            }
        }

        List<PdfJsonImageElement> imageElements =
                pageModel.getImageElements() != null
                        ? new ArrayList<>(pageModel.getImageElements())
                        : new ArrayList<>();

        if (!preservedStreams.isEmpty() && !imageElements.isEmpty()) {
            reconstructImageXObjects(document, page, preservedStreams, imageElements);
        }

        List<PdfJsonTextElement> textElements =
                pageModel.getTextElements() != null
                        ? new ArrayList<>(pageModel.getTextElements())
                        : new ArrayList<>();

        PreflightResult preflightResult =
                preflightTextElements(document, fontMap, fontModels, textElements, pageNumberValue);
        if (!preflightResult.fallbackFontIds().isEmpty()) {
            ensureFallbackResources(page, preflightResult.fallbackFontIds(), fontMap);
        }

        Map<String, PdfJsonFont> fontLookup = buildFontModelLookup(fontModels);

        AppendMode appendMode =
                preservedStreams.isEmpty() ? AppendMode.OVERWRITE : AppendMode.APPEND;

        RegenerateMode regenerateMode =
                determineRegenerateMode(
                        document,
                        page,
                        preservedStreams,
                        textElements,
                        imageElements,
                        preflightResult,
                        fontLookup,
                        pageNumberValue);

        if (regenerateMode == RegenerateMode.REUSE_EXISTING) {
            if (!preserveExistingAnnotations) {
                page.getAnnotations().clear();
                List<PdfJsonAnnotation> annotations =
                        pageModel.getAnnotations() != null
                                ? new ArrayList<>(pageModel.getAnnotations())
                                : new ArrayList<>();
                restoreAnnotations(document, page, annotations);
            }
            return;
        }

        if (regenerateMode == RegenerateMode.REGENERATE_WITH_VECTOR_OVERLAY) {
            PDStream vectorStream =
                    extractVectorGraphics(document, preservedStreams, imageElements);
            if (vectorStream != null) {
                page.setContents(Collections.singletonList(vectorStream));
                appendMode = AppendMode.APPEND;
            } else {
                page.setContents(new ArrayList<>());
                appendMode = AppendMode.OVERWRITE;
            }
        } else if (regenerateMode == RegenerateMode.REGENERATE_CLEAR) {
            page.setContents(new ArrayList<>());
            appendMode = AppendMode.OVERWRITE;
        }

        regeneratePageContent(
                document,
                page,
                textElements,
                imageElements,
                fontMap,
                fontModels,
                pageNumberValue,
                appendMode);

        if (!preserveExistingAnnotations) {
            page.getAnnotations().clear();
            List<PdfJsonAnnotation> annotations =
                    pageModel.getAnnotations() != null
                            ? new ArrayList<>(pageModel.getAnnotations())
                            : new ArrayList<>();
            restoreAnnotations(document, page, annotations);
        }
    }

    private RegenerateMode determineRegenerateMode(
            PDDocument document,
            PDPage page,
            List<PDStream> preservedStreams,
            List<PdfJsonTextElement> textElements,
            List<PdfJsonImageElement> imageElements,
            PreflightResult preflightResult,
            Map<String, PdfJsonFont> fontLookup,
            int pageNumberValue)
            throws IOException {
        boolean hasText = textElements != null && !textElements.isEmpty();
        boolean hasImages = imageElements != null && !imageElements.isEmpty();

        if (!hasText && !hasImages) {
            return RegenerateMode.REGENERATE_CLEAR;
        }

        if (preservedStreams.isEmpty()) {
            return RegenerateMode.REGENERATE_CLEAR;
        }

        if (hasImages) {
            return RegenerateMode.REGENERATE_WITH_VECTOR_OVERLAY;
        }

        if (hasText && !preflightResult.usesFallback()) {
            boolean rewriteSucceeded =
                    rewriteTextOperators(
                            document, page, textElements, false, true, fontLookup, pageNumberValue);
            if (rewriteSucceeded) {
                return RegenerateMode.REUSE_EXISTING;
            }
            return RegenerateMode.REGENERATE_WITH_VECTOR_OVERLAY;
        }

        return RegenerateMode.REGENERATE_WITH_VECTOR_OVERLAY;
    }

    private enum RegenerateMode {
        REUSE_EXISTING,
        REGENERATE_WITH_VECTOR_OVERLAY,
        REGENERATE_CLEAR
    }

    private boolean shouldPreserveExistingAnnotations(List<PdfJsonAnnotation> annotations) {
        if (annotations == null || annotations.isEmpty()) {
            return true;
        }
        for (PdfJsonAnnotation annotation : annotations) {
            if (annotation == null || annotation.getRawData() == null) {
                return true;
            }
            if (hasMissingStreamData(annotation.getRawData())) {
                return true;
            }
        }
        return false;
    }

    private boolean shouldPreserveExistingContentStreams(List<PdfJsonStream> streams) {
        if (streams == null || streams.isEmpty()) {
            return false;
        }
        for (PdfJsonStream stream : streams) {
            if (stream == null || stream.getRawData() == null) {
                return true;
            }
        }
        return false;
    }

    private boolean shouldPreserveExistingResources(PdfJsonCosValue resources) {
        return hasMissingStreamData(resources);
    }

    private List<PDStream> snapshotExistingContentStreams(PDPage page) throws IOException {
        List<PDStream> streams = new ArrayList<>();
        Iterator<PDStream> iterator = page.getContentStreams();
        if (iterator == null) {
            return streams;
        }
        while (iterator.hasNext()) {
            PDStream stream = iterator.next();
            if (stream != null) {
                streams.add(stream);
            }
        }
        return streams;
    }

    private boolean hasMissingStreamData(PdfJsonCosValue value) {
        if (value == null || value.getType() == null) {
            return false;
        }
        switch (value.getType()) {
            case STREAM:
                PdfJsonStream stream = value.getStream();
                return stream == null || stream.getRawData() == null;
            case ARRAY:
                if (value.getItems() != null) {
                    for (PdfJsonCosValue item : value.getItems()) {
                        if (hasMissingStreamData(item)) {
                            return true;
                        }
                    }
                }
                return false;
            case DICTIONARY:
                if (value.getEntries() != null) {
                    for (PdfJsonCosValue entry : value.getEntries().values()) {
                        if (hasMissingStreamData(entry)) {
                            return true;
                        }
                    }
                }
                return false;
            default:
                return false;
        }
    }

    /** Schedules automatic cleanup of cached documents after 30 minutes. */
    private void scheduleDocumentCleanup(String jobId) {
        new Thread(
                        () -> {
                            try {
                                Thread.sleep(TimeUnit.MINUTES.toMillis(30));
                                clearCachedDocument(jobId);
                                log.debug("Auto-cleaned cached document for jobId: {}", jobId);
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            }
                        })
                .start();
    }
}
