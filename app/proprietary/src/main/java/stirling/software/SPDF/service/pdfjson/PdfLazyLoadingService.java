package stirling.software.SPDF.service.pdfjson;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.PdfJsonConversionProgress;
import stirling.software.SPDF.model.json.PdfJsonAnnotation;
import stirling.software.SPDF.model.json.PdfJsonCosValue;
import stirling.software.SPDF.model.json.PdfJsonDocumentMetadata;
import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonImageElement;
import stirling.software.SPDF.model.json.PdfJsonPage;
import stirling.software.SPDF.model.json.PdfJsonPageDimension;
import stirling.software.SPDF.model.json.PdfJsonStream;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.TaskManager;
import stirling.software.common.util.ExceptionUtils;

/**
 * Service for lazy loading PDF pages. Caches PDF documents and extracts pages on-demand to reduce
 * memory usage for large PDFs.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PdfLazyLoadingService {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;
    private final TaskManager taskManager;
    private final PdfJsonMetadataService metadataService;
    private final PdfJsonImageService imageService;

    /** Cache for storing PDDocuments for lazy page loading. Key is jobId. */
    private final Map<String, CachedPdfDocument> documentCache = new ConcurrentHashMap<>();

    /**
     * Stores PDF file bytes for lazy page loading. Each page is extracted on-demand by re-loading
     * the PDF from bytes.
     */
    @Data
    private static class CachedPdfDocument {
        private final byte[] pdfBytes;
        private final PdfJsonDocumentMetadata metadata;
        private final long timestamp;

        public CachedPdfDocument(byte[] pdfBytes, PdfJsonDocumentMetadata metadata) {
            this.pdfBytes = pdfBytes;
            this.metadata = metadata;
            this.timestamp = System.currentTimeMillis();
        }
    }

    /**
     * Extracts document metadata, fonts, and page dimensions without page content. Caches the PDF
     * bytes for subsequent page requests.
     *
     * @param file The uploaded PDF file
     * @param jobId The job ID for caching
     * @param fonts Font map (will be populated)
     * @param pageFontResources Page font resources map (will be populated)
     * @return Serialized metadata JSON
     * @throws IOException If extraction fails
     */
    public byte[] extractDocumentMetadata(
            MultipartFile file,
            String jobId,
            Map<String, PdfJsonFont> fonts,
            Map<Integer, Map<PDFont, String>> pageFontResources)
            throws IOException {
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

            // Build metadata response
            progress.accept(PdfJsonConversionProgress.of(90, "metadata", "Extracting metadata"));
            PdfJsonDocumentMetadata docMetadata = new PdfJsonDocumentMetadata();
            docMetadata.setMetadata(metadataService.extractMetadata(document));
            docMetadata.setXmpMetadata(metadataService.extractXmpMetadata(document));
            docMetadata.setLazyImages(Boolean.TRUE);

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

            // Cache PDF bytes and metadata for lazy page loading
            if (jobId != null) {
                CachedPdfDocument cached = new CachedPdfDocument(pdfBytes, docMetadata);
                documentCache.put(jobId, cached);
                log.info(
                        "Cached PDF bytes ({} bytes) for lazy loading, jobId: {}",
                        pdfBytes.length,
                        jobId);

                // Schedule cleanup after 30 minutes
                scheduleDocumentCleanup(jobId);
            }

            progress.accept(
                    PdfJsonConversionProgress.of(100, "complete", "Metadata extraction complete"));

            return objectMapper.writeValueAsBytes(docMetadata);
        }
    }

    /**
     * Extracts a single page from cached PDF bytes. Re-loads the PDF for each request.
     *
     * @param jobId The job ID
     * @param pageNumber The page number (1-indexed)
     * @param serializeCosValue Function to serialize COS values
     * @param extractContentStreams Function to extract content streams
     * @param filterImageXObjectsFromResources Function to filter image XObjects
     * @param extractText Function to extract text elements for the page
     * @param extractAnnotations Function to extract annotations for the page
     * @return Serialized page JSON
     * @throws IOException If extraction fails
     */
    public byte[] extractSinglePage(
            String jobId,
            int pageNumber,
            java.util.function.Function<COSBase, PdfJsonCosValue> serializeCosValue,
            java.util.function.Function<PDPage, List<PdfJsonStream>> extractContentStreams,
            java.util.function.Function<COSBase, COSBase> filterImageXObjectsFromResources,
            java.util.function.BiFunction<PDDocument, Integer, List<PdfJsonTextElement>>
                    extractText,
            java.util.function.BiFunction<PDDocument, Integer, List<PdfJsonAnnotation>>
                    extractAnnotations)
            throws IOException {
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

        log.debug("Loading PDF from bytes to extract page {} (jobId: {})", pageNumber, jobId);

        // Re-load PDF from cached bytes and extract the single page
        try (PDDocument document = pdfDocumentFactory.load(cached.getPdfBytes(), true)) {
            PDPage page = document.getPage(pageIndex);
            PdfJsonPage pageModel = new PdfJsonPage();
            pageModel.setPageNumber(pageNumber);
            PDRectangle mediaBox = page.getMediaBox();
            pageModel.setWidth(mediaBox.getWidth());
            pageModel.setHeight(mediaBox.getHeight());
            pageModel.setRotation(page.getRotation());

            // Extract text on-demand
            pageModel.setTextElements(extractText.apply(document, pageNumber));

            // Extract annotations on-demand
            pageModel.setAnnotations(extractAnnotations.apply(document, pageNumber));

            // Extract images on-demand
            List<PdfJsonImageElement> images =
                    imageService.extractImagesForPage(document, page, pageNumber);
            pageModel.setImageElements(images);

            // Extract resources and content streams
            COSBase resourcesBase = page.getCOSObject().getDictionaryObject(COSName.RESOURCES);
            COSBase filteredResources = filterImageXObjectsFromResources.apply(resourcesBase);
            pageModel.setResources(serializeCosValue.apply(filteredResources));
            pageModel.setContentStreams(extractContentStreams.apply(page));

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
}
