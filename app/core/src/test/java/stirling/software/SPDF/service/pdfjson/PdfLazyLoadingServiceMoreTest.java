package stirling.software.SPDF.service.pdfjson;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.json.PdfJsonDocumentMetadata;
import stirling.software.SPDF.model.json.PdfJsonImageElement;
import stirling.software.SPDF.model.json.PdfJsonPageDimension;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.TaskManager;

import tools.jackson.databind.ObjectMapper;

/**
 * Additional branch coverage for {@link PdfLazyLoadingService}: the cache-hit page extraction path,
 * out-of-range page validation (both ends), and cache removal of an existing entry. Dependencies
 * are mocked; a real in-memory PDF is handed back by the factory for the happy path.
 */
@DisplayName("PdfLazyLoadingService additional branch tests")
class PdfLazyLoadingServiceMoreTest {

    private PdfLazyLoadingService service;
    private CustomPDFDocumentFactory pdfDocumentFactory;
    private ObjectMapper objectMapper;
    private TaskManager taskManager;
    private PdfJsonMetadataService metadataService;
    private PdfJsonImageService imageService;

    @BeforeEach
    void setUp() {
        pdfDocumentFactory = mock(CustomPDFDocumentFactory.class);
        objectMapper = mock(ObjectMapper.class);
        taskManager = mock(TaskManager.class);
        metadataService = mock(PdfJsonMetadataService.class);
        imageService = mock(PdfJsonImageService.class);
        service =
                new PdfLazyLoadingService(
                        pdfDocumentFactory,
                        objectMapper,
                        taskManager,
                        metadataService,
                        imageService);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> cache() throws Exception {
        Field f = PdfLazyLoadingService.class.getDeclaredField("documentCache");
        f.setAccessible(true);
        return (Map<String, Object>) f.get(service);
    }

    /** Reflectively builds a CachedPdfDocument and inserts it into the document cache. */
    private void seedCache(String jobId, byte[] pdfBytes, int pageCount) throws Exception {
        PdfJsonDocumentMetadata metadata = new PdfJsonDocumentMetadata();
        List<PdfJsonPageDimension> dims = new ArrayList<>();
        for (int i = 0; i < pageCount; i++) {
            PdfJsonPageDimension d = new PdfJsonPageDimension();
            d.setPageNumber(i + 1);
            d.setWidth(200);
            d.setHeight(200);
            dims.add(d);
        }
        metadata.setPageDimensions(dims);

        Class<?> cachedClass =
                Class.forName(
                        "stirling.software.SPDF.service.pdfjson.PdfLazyLoadingService$CachedPdfDocument");
        Constructor<?> ctor =
                cachedClass.getDeclaredConstructor(byte[].class, PdfJsonDocumentMetadata.class);
        ctor.setAccessible(true);
        Object cached = ctor.newInstance(pdfBytes, metadata);
        cache().put(jobId, cached);
    }

    private static byte[] tinyPdfBytes(int pages) throws Exception {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage(new PDRectangle(200, 200)));
            }
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static PDDocument tinyDoc(int pages) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            doc.addPage(new PDPage(new PDRectangle(200, 200)));
        }
        return doc;
    }

    @Nested
    @DisplayName("extractSinglePage cache hit")
    class CacheHit {

        @Test
        @DisplayName("extracts the requested page and writes JSON to the stream")
        void extractsPage() throws Exception {
            byte[] pdfBytes = tinyPdfBytes(2);
            seedCache("job-hit", pdfBytes, 2);

            when(pdfDocumentFactory.load(eq(pdfBytes), eq(true))).thenReturn(tinyDoc(2));
            List<PdfJsonImageElement> images = new ArrayList<>();
            when(imageService.extractImagesForPage(any(), any(), eq(2))).thenReturn(images);

            doAnswer(
                            inv -> {
                                OutputStream os = inv.getArgument(0, OutputStream.class);
                                os.write(new byte[] {'p', 'g'});
                                return null;
                            })
                    .when(objectMapper)
                    .writeValue(any(OutputStream.class), any());

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractSinglePage(
                    "job-hit",
                    2,
                    cos -> null,
                    page -> new ArrayList<>(),
                    cos -> cos,
                    (doc, pageNum) -> new ArrayList<>(),
                    (doc, pageNum) -> new ArrayList<>(),
                    out);

            assertThat(out.toByteArray()).hasSize(2);
            verify(pdfDocumentFactory).load(eq(pdfBytes), eq(true));
            verify(imageService).extractImagesForPage(any(), any(), eq(2));
        }
    }

    @Nested
    @DisplayName("extractSinglePage out-of-range")
    class OutOfRange {

        @Test
        @DisplayName("page number above the page count is rejected")
        void aboveRange() throws Exception {
            seedCache("job-hi", tinyPdfBytes(1), 1);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThatThrownBy(
                            () ->
                                    service.extractSinglePage(
                                            "job-hi",
                                            5,
                                            cos -> null,
                                            page -> new ArrayList<>(),
                                            cos -> cos,
                                            (doc, pageNum) -> new ArrayList<>(),
                                            (doc, pageNum) -> new ArrayList<>(),
                                            out))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("out of range");

            // The factory is never consulted when validation fails.
            verify(pdfDocumentFactory, never()).load(any(byte[].class), anyBoolean());
        }

        @Test
        @DisplayName("page number below 1 is rejected")
        void belowRange() throws Exception {
            seedCache("job-lo", tinyPdfBytes(2), 2);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThatThrownBy(
                            () ->
                                    service.extractSinglePage(
                                            "job-lo",
                                            0,
                                            cos -> null,
                                            page -> new ArrayList<>(),
                                            cos -> cos,
                                            (doc, pageNum) -> new ArrayList<>(),
                                            (doc, pageNum) -> new ArrayList<>(),
                                            out))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("out of range");
        }
    }

    @Nested
    @DisplayName("clearCachedDocument")
    class ClearCache {

        @Test
        @DisplayName("removes an existing cached entry")
        void removesExisting() throws Exception {
            seedCache("job-clear", tinyPdfBytes(1), 1);
            assertThat(cache()).containsKey("job-clear");

            service.clearCachedDocument("job-clear");

            assertThat(cache()).doesNotContainKey("job-clear");
        }
    }
}
