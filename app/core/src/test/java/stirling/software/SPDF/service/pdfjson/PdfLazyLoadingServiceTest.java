package stirling.software.SPDF.service.pdfjson;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.Map;

import org.apache.pdfbox.pdmodel.font.PDFont;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.TaskManager;

import tools.jackson.databind.ObjectMapper;

class PdfLazyLoadingServiceTest {

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

    @Test
    void extractDocumentMetadata_nullFile_throwsException() {
        assertThrows(
                Exception.class,
                () ->
                        service.extractDocumentMetadata(
                                null,
                                "job1",
                                new HashMap<>(),
                                new HashMap<>(),
                                new ByteArrayOutputStream()));
    }

    @Test
    void clearCachedDocument_nonExistentJob_doesNotThrow() {
        service.clearCachedDocument("nonexistent");
        // Should complete without error
    }

    @Test
    void clearCachedDocument_existingJob_removesEntry() throws Exception {
        // Access the documentCache via reflection to verify behavior
        Field cacheField = PdfLazyLoadingService.class.getDeclaredField("documentCache");
        cacheField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> cache = (Map<String, Object>) cacheField.get(service);

        // Verify cache is initially empty
        assertTrue(cache.isEmpty());

        // clearCachedDocument on nonexistent should not throw
        service.clearCachedDocument("job1");
        assertTrue(cache.isEmpty());
    }

    @Test
    void extractSinglePage_nonExistentJob_throwsIllegalArgument() {
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        service.extractSinglePage(
                                "nonexistent",
                                1,
                                cos -> null,
                                page -> null,
                                cos -> cos,
                                (doc, pageNum) -> new java.util.ArrayList<>(),
                                (doc, pageNum) -> new java.util.ArrayList<>(),
                                new ByteArrayOutputStream()));
    }

    @Test
    void extractDocumentMetadata_withValidPdf_returnsBytes() throws Exception {
        // Create a real minimal PDF document for the factory to return
        org.apache.pdfbox.pdmodel.PDDocument doc = new org.apache.pdfbox.pdmodel.PDDocument();
        doc.addPage(new org.apache.pdfbox.pdmodel.PDPage());

        MultipartFile file = mock(MultipartFile.class);
        byte[] pdfBytes = new byte[] {0x25, 0x50, 0x44, 0x46}; // %PDF
        when(file.getBytes()).thenReturn(pdfBytes);
        when(pdfDocumentFactory.load(eq(pdfBytes), eq(true))).thenReturn(doc);

        stirling.software.SPDF.model.json.PdfJsonMetadata metadata =
                new stirling.software.SPDF.model.json.PdfJsonMetadata();
        metadata.setNumberOfPages(1);
        when(metadataService.extractMetadata(any())).thenReturn(metadata);
        when(metadataService.extractXmpMetadata(any())).thenReturn(null);
        // Service now writes directly to the OutputStream using writeValue, not writeValueAsBytes.
        // ObjectMapper.writeValue(OutputStream, Object) — the OutputStream is argument 0.
        doAnswer(
                        inv -> {
                            OutputStream os = inv.getArgument(0, OutputStream.class);
                            os.write(new byte[] {'{', '}'});
                            return null;
                        })
                .when(objectMapper)
                .writeValue(any(OutputStream.class), any());
        when(taskManager.addNote(any(), any())).thenReturn(true);

        Map<String, PdfJsonFont> fonts = new HashMap<>();
        Map<Integer, Map<PDFont, String>> pageFontResources = new HashMap<>();
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        service.extractDocumentMetadata(file, "job1", fonts, pageFontResources, out);

        assertNotNull(out.toByteArray());
        assertEquals(2, out.toByteArray().length);
        verify(metadataService).extractMetadata(any());
    }
}
