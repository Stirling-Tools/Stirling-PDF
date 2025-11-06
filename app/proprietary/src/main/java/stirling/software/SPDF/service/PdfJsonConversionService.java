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
import org.springframework.beans.factory.annotation.Value;
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
import stirling.software.SPDF.model.json.PdfJsonFormField;
import stirling.software.SPDF.model.json.PdfJsonImageElement;
import stirling.software.SPDF.model.json.PdfJsonMetadata;
import stirling.software.SPDF.model.json.PdfJsonPage;
import stirling.software.SPDF.model.json.PdfJsonPageDimension;
import stirling.software.SPDF.model.json.PdfJsonStream;
import stirling.software.SPDF.model.json.PdfJsonTextColor;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.SPDF.service.pdfjson.PdfJsonFontService;
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

    @Value("${stirling.pdf.json.font-normalization.enabled:true}")
    private boolean fontNormalizationEnabled;

    /** Cache for storing PDDocuments for lazy page loading. Key is jobId. */
    private final Map<String, CachedPdfDocument> documentCache = new ConcurrentHashMap<>();

    private volatile boolean ghostscriptAvailable;

    private static final float FLOAT_EPSILON = 0.0001f;
    private static final float ORIENTATION_TOLERANCE = 0.0005f;
    private static final float BASELINE_TOLERANCE = 0.5f;

    @PostConstruct
    private void initializeToolAvailability() {
        initializeGhostscriptAvailability();
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
        String jobId = getJobIdFromRequest();
        log.info("Starting PDF to JSON conversion, jobId from context: {}", jobId);

        Consumer<PdfJsonConversionProgress> progress =
                progressCallback != null
                        ? (p) -> {
                            log.info(
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
                        : jobId != null
                                ? (p) -> {
                                    log.info(
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
                                    log.info(
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

            progress.accept(PdfJsonConversionProgress.of(20, "parsing", "Parsing PDF structure"));

            byte[] cachedPdfBytes = null;

            try (PDDocument document = pdfDocumentFactory.load(workingPath, true)) {
                int totalPages = document.getNumberOfPages();
                boolean useLazyImages = totalPages > 5 && jobId != null;
                Map<COSBase, FontModelCacheEntry> fontCache = new IdentityHashMap<>();
                Map<COSBase, EncodedImage> imageCache = new IdentityHashMap<>();
                log.info(
                        "Converting PDF to JSON ({} pages) - {} mode",
                        totalPages,
                        useLazyImages ? "lazy image" : "standard");
                Map<String, PdfJsonFont> fonts = new LinkedHashMap<>();
                Map<Integer, List<PdfJsonTextElement>> textByPage = new LinkedHashMap<>();
                Map<Integer, Map<PDFont, String>> pageFontResources = new HashMap<>();

                progress.accept(
                        PdfJsonConversionProgress.of(30, "fonts", "Collecting font information"));
                int pageNumber = 1;
                for (PDPage page : document.getPages()) {
                    Map<PDFont, String> resourceMap =
                            collectFontsForPage(document, page, pageNumber, fonts, fontCache);
                    pageFontResources.put(pageNumber, resourceMap);
                    log.debug(
                            "PDF→JSON: collected {} font resources on page {}",
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
                                document, fonts, textByPage, pageFontResources, fontCache);
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
                Map<Integer, List<PdfJsonAnnotation>> annotationsByPage =
                        collectAnnotations(document, totalPages, progress);

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
                pdfJson.setFonts(serializedFonts);
                pdfJson.setPages(
                        extractPages(document, textByPage, imagesByPage, annotationsByPage));
                pdfJson.setFormFields(collectFormFields(document));

                if (useLazyImages && jobId != null) {
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
                        PDRectangle mediaBox = page.getMediaBox();
                        dim.setWidth(mediaBox.getWidth());
                        dim.setHeight(mediaBox.getHeight());
                        dim.setRotation(page.getRotation());
                        pageDimensions.add(dim);
                        pageIndex++;
                    }
                    docMetadata.setPageDimensions(pageDimensions);

                    if (cachedPdfBytes == null) {
                        cachedPdfBytes = Files.readAllBytes(workingPath);
                    }
                    CachedPdfDocument cached =
                            new CachedPdfDocument(
                                    cachedPdfBytes, docMetadata, fonts, pageFontResources);
                    documentCache.put(jobId, cached);
                    log.info(
                            "Cached PDF bytes ({} bytes, {} pages, {} fonts) for lazy images, jobId: {}",
                            cachedPdfBytes.length,
                            totalPages,
                            fonts.size(),
                            jobId);
                    scheduleDocumentCleanup(jobId);
                }

                if (lightweight) {
                    applyLightweightTransformations(pdfJson);
                }

                progress.accept(
                        PdfJsonConversionProgress.of(95, "serializing", "Generating JSON output"));

                log.info(
                        "PDF→JSON conversion complete (fonts: {}, pages: {}, lazyImages: {})",
                        serializedFonts.size(),
                        pdfJson.getPages().size(),
                        useLazyImages);

                byte[] result = objectMapper.writeValueAsBytes(pdfJson);
                progress.accept(PdfJsonConversionProgress.complete());
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
                        log.debug(
                                "Skipping token rewrite for page {} because fallback fonts are required",
                                pageNumberValue);
                        rewriteSucceeded = false;
                    } else if (!preservedStreams.isEmpty()) {
                        log.info("Attempting token rewrite for page {}", pageNumberValue);
                        rewriteSucceeded =
                                rewriteTextOperators(document, page, elements, false, false);
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
                    log.info("Regenerating page content for page {}", pageNumberValue);
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
            PDDocument document,
            PDPage page,
            int pageNumber,
            Map<String, PdfJsonFont> fonts,
            Map<COSBase, FontModelCacheEntry> fontCache)
            throws IOException {
        Map<PDFont, String> mapping = new HashMap<>();
        Set<COSBase> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        collectFontsFromResources(
                document, page.getResources(), pageNumber, fonts, mapping, visited, "", fontCache);
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
            Map<COSBase, FontModelCacheEntry> fontCache)
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
            String key = buildFontKey(pageNumber, fontId);
            if (!fonts.containsKey(key)) {
                fonts.put(key, buildFontModel(font, fontId, pageNumber, fontCache));
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
                            fontCache);
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

    private String buildFontKey(int pageNumber, String fontId) {
        return pageNumber + ":" + fontId;
    }

    private String buildFontKey(Integer pageNumber, String fontId) {
        int page = pageNumber != null ? pageNumber : -1;
        return buildFontKey(page, fontId);
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
            if (hasUsableProgram) {
                font.setCosDictionary(null);
            }
        }
    }

    private boolean hasPayload(String value) {
        return value != null && !value.isBlank();
    }

    private PdfJsonFont buildFontModel(
            PDFont font, String fontId, int pageNumber, Map<COSBase, FontModelCacheEntry> fontCache)
            throws IOException {
        COSBase cosObject = font.getCOSObject();
        FontModelCacheEntry cacheEntry = fontCache.get(cosObject);
        if (cacheEntry == null) {
            cacheEntry = createFontCacheEntry(font);
            fontCache.put(cosObject, cacheEntry);
        }
        return toPdfJsonFont(cacheEntry, fontId, pageNumber);
    }

    private FontModelCacheEntry createFontCacheEntry(PDFont font) throws IOException {
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
                cosDictionary);
    }

    private PdfJsonFont toPdfJsonFont(
            FontModelCacheEntry cacheEntry, String fontId, int pageNumber) {
        FontProgramData programData = cacheEntry.programData();
        return PdfJsonFont.builder()
                .id(fontId)
                .pageNumber(pageNumber)
                .uid(buildFontKey(pageNumber, fontId))
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
            PdfJsonCosValue cosDictionary) {}

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

            if (!fallbackFontService.canEncodeFully(font, text)) {
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
        PDFont loaded = fallbackFontService.loadFallbackPdfFont(document, effectiveId);
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
            log.info(
                    "[FONT-DEBUG] Font {}: Found FontFile3 with subtype {}",
                    font.getName(),
                    subtype);
            return readFontProgram(
                    fontFile3, subtype != null ? subtype : "fontfile3", false, toUnicode);
        }

        PDStream fontFile2 = descriptor.getFontFile2();
        if (fontFile2 != null) {
            log.info("[FONT-DEBUG] Font {}: Found FontFile2 (TrueType)", font.getName());
            return readFontProgram(fontFile2, null, true, toUnicode);
        }

        PDStream fontFile = descriptor.getFontFile();
        if (fontFile != null) {
            log.info("[FONT-DEBUG] Font {}: Found FontFile (Type1)", font.getName());
            return readFontProgram(fontFile, "type1", false, toUnicode);
        }

        log.warn("[FONT-DEBUG] Font {}: No font program found", font.getName());
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
            log.info(
                    "[FONT-DEBUG] Font program: size={} bytes, formatHint={}, detectedFormat={}",
                    data.length,
                    formatHint,
                    format);

            String webBase64 = null;
            String webFormat = null;
            String pdfBase64 = null;
            String pdfFormat = null;
            if (format != null && isCffFormat(format)) {
                log.info(
                        "[FONT-DEBUG] Font is CFF format, attempting conversion. CFF conversion enabled: {}, method: {}",
                        fontService.isCffConversionEnabled(),
                        fontService.getCffConverterMethod());

                byte[] converted = convertCffProgramToTrueType(data, toUnicode);
                if (converted != null && converted.length > 0) {
                    String detectedFormat = fontService.detectFontFlavor(converted);
                    webBase64 = Base64.getEncoder().encodeToString(converted);
                    webFormat = detectedFormat;
                    log.info(
                            "[FONT-DEBUG] Primary CFF conversion succeeded: {} bytes -> {}",
                            data.length,
                            detectedFormat);
                    if ("ttf".equals(detectedFormat)) {
                        pdfBase64 = webBase64;
                        pdfFormat = detectedFormat;
                    }
                } else {
                    log.warn("[FONT-DEBUG] Primary CFF conversion returned null/empty");
                }

                if (pdfBase64 == null && fontService.isCffConversionEnabled()) {
                    log.info("[FONT-DEBUG] Attempting fallback FontForge conversion");
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
                            log.info(
                                    "[FONT-DEBUG] FontForge conversion succeeded: {} bytes -> {}",
                                    data.length,
                                    detectedFormat);
                        }
                    } else {
                        log.warn("[FONT-DEBUG] FontForge conversion also returned null/empty");
                    }
                }

                if (webBase64 == null && pdfBase64 == null) {
                    log.error(
                            "[FONT-DEBUG] ALL CFF conversions failed - font will not be usable in browser!");
                }
            } else if (format != null) {
                log.info("[FONT-DEBUG] Font is non-CFF format ({}), using as-is", format);
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
            pageModel.setResources(cosMapper.serializeCosValue(filteredResources));
            pageModel.setContentStreams(extractContentStreams(page));
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
            PDDocument document, int totalPages, Consumer<PdfJsonConversionProgress> progress)
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
                    ann.setRawData(cosMapper.serializeCosValue(annotDict));

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
                    formField.setRawData(cosMapper.serializeCosValue(field.getCOSObject()));

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

    private List<PdfJsonStream> extractContentStreams(PDPage page) throws IOException {
        List<PdfJsonStream> streams = new ArrayList<>();
        Iterator<PDStream> iterator = page.getContentStreams();
        if (iterator == null) {
            return streams;
        }
        while (iterator.hasNext()) {
            PDStream stream = iterator.next();
            PdfJsonStream model = cosMapper.serializeStream(stream);
            if (model != null) {
                streams.add(model);
            }
        }
        return streams;
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

            if (!fallbackFontService.canEncode(baseFont, codePoint)) {
                fallbackApplied = true;
                String fallbackId = fallbackFontService.resolveFallbackFontId(codePoint);
                targetFont = ensureFallbackFont(document, fontMap, fontModels, fallbackId);
                if (targetFont == null || !fallbackFontService.canEncode(targetFont, glyph)) {
                    String mapped = fallbackFontService.mapUnsupportedGlyph(codePoint);
                    if (mapped != null) {
                        if (fallbackFontService.canEncode(baseFont, mapped)) {
                            glyph = mapped;
                            targetFont = baseFont;
                        } else if (targetFont != null
                                && fallbackFontService.canEncode(targetFont, mapped)) {
                            glyph = mapped;
                        }
                    }
                }
                if (targetFont == null || !fallbackFontService.canEncode(targetFont, glyph)) {
                    glyph = "?";
                    targetFont =
                            ensureFallbackFont(document, fontMap, fontModels, FALLBACK_FONT_ID);
                    if (targetFont == null || !fallbackFontService.canEncode(targetFont, glyph)) {
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
            PDDocument document,
            PDPage page,
            List<PdfJsonTextElement> elements,
            boolean removeOnly,
            boolean forceRegenerate) {
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
                            log.trace(
                                    "Encountered Tf operator; switching to font resource {}",
                                    currentFontName);
                            if (forceRegenerate) {
                                encounteredModifiedFont = true;
                            }
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
                        log.trace(
                                "Rewriting Tj operator using font {} (token index {}, cursor remaining {})",
                                currentFontName,
                                i,
                                cursor.remaining());
                        if (!rewriteShowText(
                                cosString, currentFont, currentFontName, cursor, removeOnly)) {
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
                                array, currentFont, currentFontName, cursor, removeOnly)) {
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
            COSString cosString,
            PDFont font,
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
            cosString.setValue(new byte[0]);
            return true;
        }
        String replacement = mergeText(consumed);
        try {
            byte[] encoded = font.encode(replacement);
            cosString.setValue(encoded);
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
                String replacement = mergeText(consumed);
                try {
                    byte[] encoded = font.encode(replacement);
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
            PdfJsonFont fallbackModel = fallbackFontService.buildFallbackFontModel();
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
                            .orElse(null);
            if (fallbackModel == null) {
                fallbackModel = fallbackFontService.buildFallbackFontModel();
                fonts.add(fallbackModel);
            }
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
            return fallbackFontService.loadFallbackPdfFont(document);
        }

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

        record FontByteSource(byte[] bytes, String format, String originLabel) {}

        List<FontByteSource> candidates = new ArrayList<>();
        List<FontByteSource> deferredWebCandidates = new ArrayList<>();

        boolean hasPdfProgram = pdfProgram != null && !pdfProgram.isBlank();
        boolean hasWebProgram = webProgram != null && !webProgram.isBlank();

        if (hasPdfProgram) {
            try {
                byte[] bytes = Base64.getDecoder().decode(pdfProgram);
                if (bytes.length > 0) {
                    candidates.add(new FontByteSource(bytes, pdfFormat, "pdfProgram"));
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
                        candidates.add(source);
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
                    candidates.add(new FontByteSource(bytes, originalFormat, "program"));
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
        if (candidates.isEmpty() && hasWebProgram) {
            try {
                byte[] bytes = Base64.getDecoder().decode(webProgram);
                if (bytes.length > 0) {
                    candidates.add(new FontByteSource(bytes, webFormat, "webProgram"));
                }
            } catch (IllegalArgumentException ignored) {
                // Already logged above when decoding failed the first time.
            }
        }

        candidates.addAll(deferredWebCandidates);

        for (FontByteSource source : candidates) {
            byte[] fontBytes = source.bytes();
            String format = source.format();
            String originLabel = source.originLabel();

            if (fontBytes == null || fontBytes.length == 0) {
                continue;
            }

            try {
                if (isType1Format(format)) {
                    try (InputStream stream = new ByteArrayInputStream(fontBytes)) {
                        PDFont font = new PDType1Font(document, stream);
                        applyAdditionalFontMetadata(document, font, fontModel);
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
                    PDFont font = PDType0Font.load(document, stream, true);
                    applyAdditionalFontMetadata(document, font, fontModel);
                    log.debug(
                            "Successfully loaded Type0 font {} from {} bytes (format: {}, originalFormat: {})",
                            fontModel.getId(),
                            originLabel,
                            format,
                            originalFormat);
                    return font;
                }
            } catch (IOException ex) {
                log.warn(
                        "Unable to load embedded font program for {} from {} (format: {}, originalFormat: {}): {}",
                        fontModel.getId(),
                        originLabel,
                        format,
                        originalFormat,
                        ex.getMessage());
            }
        }

        // As a last resort, rebuild the original font dictionary which still references the
        // embedded program streams captured during extraction. This handles subset fonts whose
        // raw program bytes cannot be reloaded directly (e.g., missing Unicode cmap tables).
        if (fontModel.getCosDictionary() != null) {
            COSBase restored =
                    cosMapper.deserializeCosValue(fontModel.getCosDictionary(), document);
            if (restored instanceof COSDictionary cosDictionary) {
                try {
                    PDFont font = PDFontFactory.createFont(cosDictionary);
                    if (font != null && font.isEmbedded()) {
                        applyAdditionalFontMetadata(document, font, fontModel);
                        log.debug(
                                "Successfully restored embedded font {} from original dictionary",
                                fontModel.getId());
                        return font;
                    }
                    log.debug(
                            "Restored font {} from dictionary but font was {}embedded; continuing",
                            fontModel.getId(),
                            font != null && font.isEmbedded() ? "" : "not ");
                } catch (IOException ex) {
                    log.debug(
                            "Failed to restore font {} from stored dictionary: {}",
                            fontModel.getId(),
                            ex.getMessage());
                }
            }
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

        PDFont fallback = fallbackFontService.loadFallbackPdfFont(document);
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

        private int currentPage = 1;
        private Map<PDFont, String> currentFontResources = Collections.emptyMap();
        private int currentZOrderCounter;

        TextCollectingStripper(
                PDDocument document,
                Map<String, PdfJsonFont> fonts,
                Map<Integer, List<PdfJsonTextElement>> textByPage,
                Map<Integer, Map<PDFont, String>> pageFontResources,
                Map<COSBase, FontModelCacheEntry> fontCache)
                throws IOException {
            this.document = document;
            this.fonts = fonts;
            this.textByPage = textByPage;
            this.pageFontResources = pageFontResources;
            this.fontCache = fontCache != null ? fontCache : new IdentityHashMap<>();
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
                PdfJsonTextElement element = createTextElement(position, fontId);

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

        private PdfJsonTextElement createTextElement(TextPosition position, String fontId)
                throws IOException {
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
            String key = buildFontKey(currentPage, fontId);
            if (!fonts.containsKey(key)) {
                fonts.put(key, buildFontModel(font, fontId, currentPage, fontCache));
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
            log.info(
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
                log.info("Successfully added progress note for job {}: {}", jobId, note);
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
    @lombok.Data
    private static class CachedPdfDocument {
        private final byte[] pdfBytes;
        private final PdfJsonDocumentMetadata metadata;
        private final Map<String, PdfJsonFont> fonts; // Font map with UIDs for consistency
        private final Map<Integer, Map<PDFont, String>> pageFontResources; // Page font resources
        private final long timestamp;

        public CachedPdfDocument(
                byte[] pdfBytes,
                PdfJsonDocumentMetadata metadata,
                Map<String, PdfJsonFont> fonts,
                Map<Integer, Map<PDFont, String>> pageFontResources) {
            this.pdfBytes = pdfBytes;
            this.metadata = metadata;
            this.fonts = fonts;
            this.pageFontResources = pageFontResources;
            this.timestamp = System.currentTimeMillis();
        }

        public CachedPdfDocument withUpdatedPdfBytes(byte[] nextBytes) {
            return new CachedPdfDocument(nextBytes, metadata, fonts, pageFontResources);
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
                            log.info(
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
                        collectFontsForPage(document, page, pageNumber, fonts, fontCache);
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
                        new CachedPdfDocument(pdfBytes, docMetadata, fonts, pageFontResources);
                documentCache.put(jobId, cached);
                log.info(
                        "Cached PDF bytes ({} bytes, {} pages, {} fonts) for lazy loading, jobId: {}",
                        pdfBytes.length,
                        totalPages,
                        fonts.size(),
                        jobId);

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
        CachedPdfDocument cached = documentCache.get(jobId);
        if (cached == null) {
            throw new IllegalArgumentException("No cached document found for jobId: " + jobId);
        }

        int pageIndex = pageNumber - 1;
        int totalPages = cached.getMetadata().getPageDimensions().size();

        if (pageIndex < 0 || pageIndex >= totalPages) {
            throw new IllegalArgumentException(
                    "Page number " + pageNumber + " out of range (1-" + totalPages + ")");
        }

        log.debug(
                "Loading PDF from bytes ({} bytes) to extract page {} (jobId: {})",
                cached.getPdfBytes().length,
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
            Map<Integer, List<PdfJsonTextElement>> textByPage = new LinkedHashMap<>();
            TextCollectingStripper stripper =
                    new TextCollectingStripper(
                            document,
                            cached.getFonts(),
                            textByPage,
                            cached.getPageFontResources(),
                            new IdentityHashMap<>());
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

                    ann.setRawData(cosMapper.serializeCosValue(annotDict));
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
            pageModel.setResources(cosMapper.serializeCosValue(filteredResources));
            pageModel.setContentStreams(extractContentStreams(page));

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
        CachedPdfDocument cached = documentCache.get(jobId);
        if (cached == null) {
            throw new IllegalArgumentException("No cached document available for jobId: " + jobId);
        }
        if (updates == null || updates.getPages() == null || updates.getPages().isEmpty()) {
            log.info(
                    "Incremental export requested with no page updates; returning cached PDF for jobId {}",
                    jobId);
            return cached.getPdfBytes();
        }

        try (PDDocument document = pdfDocumentFactory.load(cached.getPdfBytes(), true)) {
            List<PdfJsonFont> fontModels = new ArrayList<>(cached.getFonts().values());
            if (updates.getFonts() != null) {
                for (PdfJsonFont font : updates.getFonts()) {
                    if (font == null || font.getId() == null) {
                        continue;
                    }
                    boolean exists =
                            fontModels.stream()
                                    .anyMatch(
                                            existing ->
                                                    Objects.equals(existing.getId(), font.getId())
                                                            && Objects.equals(
                                                                    existing.getUid(),
                                                                    font.getUid()));
                    if (!exists) {
                        fontModels.add(font);
                    }
                }
            }

            List<PdfJsonFont> fontModelsCopy = new ArrayList<>(fontModels);
            Map<String, PDFont> fontMap = buildFontMap(document, fontModelsCopy);

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
                log.info(
                        "Incremental export for jobId {} resulted in no page updates; returning cached PDF",
                        jobId);
                return cached.getPdfBytes();
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            byte[] updatedBytes = baos.toByteArray();

            documentCache.put(jobId, cached.withUpdatedPdfBytes(updatedBytes));

            log.info(
                    "Incremental export complete for jobId {} (pages updated: {})",
                    jobId,
                    updatedPages.stream().map(i -> i + 1).sorted().toList());
            return updatedBytes;
        }
    }

    /** Clears a cached document. */
    public void clearCachedDocument(String jobId) {
        CachedPdfDocument cached = documentCache.remove(jobId);
        if (cached != null) {
            log.info(
                    "Removed cached PDF bytes ({} bytes) for jobId: {}",
                    cached.getPdfBytes().length,
                    jobId);
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

        applyPageResources(document, page, pageModel.getResources());

        List<PDStream> preservedStreams =
                buildContentStreams(document, pageModel.getContentStreams());
        if (preservedStreams.isEmpty()) {
            page.setContents(new ArrayList<>());
        } else {
            page.setContents(preservedStreams);
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
                        pageNumberValue);

        if (regenerateMode == RegenerateMode.REUSE_EXISTING) {
            page.getAnnotations().clear();
            List<PdfJsonAnnotation> annotations =
                    pageModel.getAnnotations() != null
                            ? new ArrayList<>(pageModel.getAnnotations())
                            : new ArrayList<>();
            restoreAnnotations(document, page, annotations);
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

        page.getAnnotations().clear();
        List<PdfJsonAnnotation> annotations =
                pageModel.getAnnotations() != null
                        ? new ArrayList<>(pageModel.getAnnotations())
                        : new ArrayList<>();
        restoreAnnotations(document, page, annotations);
    }

    private RegenerateMode determineRegenerateMode(
            PDDocument document,
            PDPage page,
            List<PDStream> preservedStreams,
            List<PdfJsonTextElement> textElements,
            List<PdfJsonImageElement> imageElements,
            PreflightResult preflightResult,
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
                    rewriteTextOperators(document, page, textElements, false, true);
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

    /** Schedules automatic cleanup of cached documents after 30 minutes. */
    private void scheduleDocumentCleanup(String jobId) {
        new Thread(
                        () -> {
                            try {
                                Thread.sleep(TimeUnit.MINUTES.toMillis(30));
                                clearCachedDocument(jobId);
                                log.info("Auto-cleaned cached document for jobId: {}", jobId);
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            }
                        })
                .start();
    }
}
