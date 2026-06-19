package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.model.api.general.RearrangePagesRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class RearrangePagesPDFControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private RearrangePagesPDFController controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    private MockMultipartFile createMockPdf() {
        return new MockMultipartFile(
                "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[] {1, 2, 3});
    }

    /** Build a real, in-memory PDDocument with the requested number of blank pages. */
    private PDDocument buildRealPdf(int pageCount) throws IOException {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pageCount; i++) {
            doc.addPage(new PDPage());
        }
        return doc;
    }

    /**
     * Returns the underlying {@link org.apache.pdfbox.cos.COSDictionary} for each page in document
     * order. PDPageTree returns a fresh PDPage wrapper per get(), so comparing wrappers with
     * assertSame is unreliable - the COSDictionary identity is the stable handle.
     */
    private List<Object> snapshotCosPages(PDDocument doc) {
        List<Object> snapshot = new ArrayList<>();
        for (PDPage p : doc.getPages()) {
            snapshot.add(p.getCOSObject());
        }
        return snapshot;
    }

    private List<Object> reloadAndSnapshot(ResponseEntity<Resource> response) throws IOException {
        try (var in = response.getBody().getInputStream();
                var baos = new ByteArrayOutputStream()) {
            in.transferTo(baos);
            try (PDDocument out = Loader.loadPDF(baos.toByteArray())) {
                return snapshotCosPages(out);
            }
        }
    }

    @Test
    void testDeletePages_Success() throws IOException {
        MockMultipartFile file = createMockPdf();
        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(file);
        request.setPageNumbers("1,3");

        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(file)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        ResponseEntity<Resource> response = controller.deletePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
        verify(mockDoc).removePage(2); // page 3 (0-indexed = 2) removed first (descending)
        verify(mockDoc).removePage(0); // page 1 (0-indexed = 0)
    }

    @Test
    void testRearrangePages_ReverseOrder() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("REVERSE_ORDER");

        try (PDDocument realDoc = buildRealPdf(3)) {
            List<Object> originals = snapshotCosPages(realDoc);
            when(pdfDocumentFactory.load(file)).thenReturn(realDoc);

            ResponseEntity<Resource> response = controller.rearrangePages(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
            List<Object> finalOrder = reloadAndSnapshot(response);
            assertEquals(3, finalOrder.size());
            // We can no longer compare references after a save/reload, so compare via
            // the in-memory snapshot taken *after* the controller mutated the source.
            List<Object> mutatedSource = snapshotCosPages(realDoc);
            assertSame(originals.get(2), mutatedSource.get(0));
            assertSame(originals.get(1), mutatedSource.get(1));
            assertSame(originals.get(0), mutatedSource.get(2));
        }
    }

    @Test
    void testRearrangePages_RemoveFirst() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("REMOVE_FIRST");

        try (PDDocument realDoc = buildRealPdf(3)) {
            List<Object> originals = snapshotCosPages(realDoc);
            when(pdfDocumentFactory.load(file)).thenReturn(realDoc);

            ResponseEntity<Resource> response = controller.rearrangePages(request);

            assertNotNull(response);
            List<Object> mutated = snapshotCosPages(realDoc);
            assertEquals(2, mutated.size());
            assertSame(originals.get(1), mutated.get(0));
            assertSame(originals.get(2), mutated.get(1));
        }
    }

    @Test
    void testRearrangePages_RemoveLast() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("REMOVE_LAST");

        try (PDDocument realDoc = buildRealPdf(3)) {
            List<Object> originals = snapshotCosPages(realDoc);
            when(pdfDocumentFactory.load(file)).thenReturn(realDoc);

            ResponseEntity<Resource> response = controller.rearrangePages(request);

            assertNotNull(response);
            List<Object> mutated = snapshotCosPages(realDoc);
            assertEquals(2, mutated.size());
            assertSame(originals.get(0), mutated.get(0));
            assertSame(originals.get(1), mutated.get(1));
        }
    }

    @Test
    void testRearrangePages_RemoveFirstAndLast() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("REMOVE_FIRST_AND_LAST");

        try (PDDocument realDoc = buildRealPdf(4)) {
            List<Object> originals = snapshotCosPages(realDoc);
            when(pdfDocumentFactory.load(file)).thenReturn(realDoc);

            ResponseEntity<Resource> response = controller.rearrangePages(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
            List<Object> mutated = snapshotCosPages(realDoc);
            assertEquals(2, mutated.size());
            assertSame(originals.get(1), mutated.get(0));
            assertSame(originals.get(2), mutated.get(1));
        }
    }

    @Test
    void testRearrangePages_DuplexSort() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("DUPLEX_SORT");

        try (PDDocument realDoc = buildRealPdf(4)) {
            when(pdfDocumentFactory.load(file)).thenReturn(realDoc);

            ResponseEntity<Resource> response = controller.rearrangePages(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
            assertEquals(4, realDoc.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_BookletSort() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("BOOKLET_SORT");

        try (PDDocument realDoc = buildRealPdf(4)) {
            when(pdfDocumentFactory.load(file)).thenReturn(realDoc);

            ResponseEntity<Resource> response = controller.rearrangePages(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
            assertEquals(4, realDoc.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_OddEvenSplit() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("ODD_EVEN_SPLIT");

        try (PDDocument realDoc = buildRealPdf(4)) {
            when(pdfDocumentFactory.load(file)).thenReturn(realDoc);

            ResponseEntity<Resource> response = controller.rearrangePages(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
            assertEquals(4, realDoc.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_CustomPageOrder() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("3,1,2");
        request.setCustomMode("custom");

        try (PDDocument realDoc = buildRealPdf(3)) {
            List<Object> originals = snapshotCosPages(realDoc);
            when(pdfDocumentFactory.load(file)).thenReturn(realDoc);

            ResponseEntity<Resource> response = controller.rearrangePages(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
            List<Object> mutated = snapshotCosPages(realDoc);
            assertEquals(3, mutated.size());
            assertSame(originals.get(2), mutated.get(0));
            assertSame(originals.get(0), mutated.get(1));
            assertSame(originals.get(1), mutated.get(2));
        }
    }

    @Test
    void testRearrangePages_Duplicate() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("3");
        request.setCustomMode("DUPLICATE");

        try (PDDocument realDoc = buildRealPdf(2)) {
            when(pdfDocumentFactory.load(file)).thenReturn(realDoc);

            ResponseEntity<Resource> response = controller.rearrangePages(request);

            assertNotNull(response);
            // 2 pages * 3 duplicates = 6 final pages
            assertEquals(6, realDoc.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_SideStitchBooklet() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("SIDE_STITCH_BOOKLET_SORT");

        try (PDDocument realDoc = buildRealPdf(4)) {
            when(pdfDocumentFactory.load(file)).thenReturn(realDoc);

            ResponseEntity<Resource> response = controller.rearrangePages(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
            assertEquals(4, realDoc.getNumberOfPages());
        }
    }
}
