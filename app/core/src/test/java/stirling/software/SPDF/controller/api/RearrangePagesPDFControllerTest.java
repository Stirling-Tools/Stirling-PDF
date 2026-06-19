package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
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
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
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

    private FileUpload createMockPdf() {
        return TestFileUploads.of(new byte[] {1, 2, 3}, "test.pdf", "application/pdf");
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

    private List<Object> reloadAndSnapshot(Response response) throws IOException {
        StreamingOutput streaming = (StreamingOutput) response.getEntity();
        try (var baos = new ByteArrayOutputStream()) {
            streaming.write(baos);
            try (PDDocument out = Loader.loadPDF(baos.toByteArray())) {
                return snapshotCosPages(out);
            }
        }
    }

    @Test
    void testDeletePages_Success() throws IOException {
        FileUpload file = createMockPdf();

        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        Response response = controller.deletePages(file, null, "1,3");

        assertNotNull(response);
        assertEquals(200, response.getStatus());
        verify(mockDoc).removePage(2); // page 3 (0-indexed = 2) removed first (descending)
        verify(mockDoc).removePage(0); // page 1 (0-indexed = 0)
    }

    @Test
    void testRearrangePages_ReverseOrder() throws IOException {
        FileUpload file = createMockPdf();

        try (PDDocument realDoc = buildRealPdf(3)) {
            List<Object> originals = snapshotCosPages(realDoc);
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(realDoc);

            Response response = controller.rearrangePages(file, null, "", "REVERSE_ORDER");

            assertNotNull(response);
            assertEquals(200, response.getStatus());
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
        FileUpload file = createMockPdf();

        try (PDDocument realDoc = buildRealPdf(3)) {
            List<Object> originals = snapshotCosPages(realDoc);
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(realDoc);

            Response response = controller.rearrangePages(file, null, "", "REMOVE_FIRST");

            assertNotNull(response);
            List<Object> mutated = snapshotCosPages(realDoc);
            assertEquals(2, mutated.size());
            assertSame(originals.get(1), mutated.get(0));
            assertSame(originals.get(2), mutated.get(1));
        }
    }

    @Test
    void testRearrangePages_RemoveLast() throws IOException {
        FileUpload file = createMockPdf();

        try (PDDocument realDoc = buildRealPdf(3)) {
            List<Object> originals = snapshotCosPages(realDoc);
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(realDoc);

            Response response = controller.rearrangePages(file, null, "", "REMOVE_LAST");

            assertNotNull(response);
            List<Object> mutated = snapshotCosPages(realDoc);
            assertEquals(2, mutated.size());
            assertSame(originals.get(0), mutated.get(0));
            assertSame(originals.get(1), mutated.get(1));
        }
    }

    @Test
    void testRearrangePages_RemoveFirstAndLast() throws IOException {
        FileUpload file = createMockPdf();

        try (PDDocument realDoc = buildRealPdf(4)) {
            List<Object> originals = snapshotCosPages(realDoc);
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(realDoc);

            Response response = controller.rearrangePages(file, null, "", "REMOVE_FIRST_AND_LAST");

            assertNotNull(response);
            assertEquals(200, response.getStatus());
            List<Object> mutated = snapshotCosPages(realDoc);
            assertEquals(2, mutated.size());
            assertSame(originals.get(1), mutated.get(0));
            assertSame(originals.get(2), mutated.get(1));
        }
    }

    @Test
    void testRearrangePages_DuplexSort() throws IOException {
        FileUpload file = createMockPdf();

        try (PDDocument realDoc = buildRealPdf(4)) {
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(realDoc);

            Response response = controller.rearrangePages(file, null, "", "DUPLEX_SORT");

            assertNotNull(response);
            assertEquals(200, response.getStatus());
            assertEquals(4, realDoc.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_BookletSort() throws IOException {
        FileUpload file = createMockPdf();

        try (PDDocument realDoc = buildRealPdf(4)) {
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(realDoc);

            Response response = controller.rearrangePages(file, null, "", "BOOKLET_SORT");

            assertNotNull(response);
            assertEquals(200, response.getStatus());
            assertEquals(4, realDoc.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_OddEvenSplit() throws IOException {
        FileUpload file = createMockPdf();

        try (PDDocument realDoc = buildRealPdf(4)) {
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(realDoc);

            Response response = controller.rearrangePages(file, null, "", "ODD_EVEN_SPLIT");

            assertNotNull(response);
            assertEquals(200, response.getStatus());
            assertEquals(4, realDoc.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_CustomPageOrder() throws IOException {
        FileUpload file = createMockPdf();

        try (PDDocument realDoc = buildRealPdf(3)) {
            List<Object> originals = snapshotCosPages(realDoc);
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(realDoc);

            Response response = controller.rearrangePages(file, null, "3,1,2", "custom");

            assertNotNull(response);
            assertEquals(200, response.getStatus());
            List<Object> mutated = snapshotCosPages(realDoc);
            assertEquals(3, mutated.size());
            assertSame(originals.get(2), mutated.get(0));
            assertSame(originals.get(0), mutated.get(1));
            assertSame(originals.get(1), mutated.get(2));
        }
    }

    @Test
    void testRearrangePages_Duplicate() throws IOException {
        FileUpload file = createMockPdf();

        try (PDDocument realDoc = buildRealPdf(2)) {
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(realDoc);

            Response response = controller.rearrangePages(file, null, "3", "DUPLICATE");

            assertNotNull(response);
            // 2 pages * 3 duplicates = 6 final pages
            assertEquals(6, realDoc.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_SideStitchBooklet() throws IOException {
        FileUpload file = createMockPdf();

        try (PDDocument realDoc = buildRealPdf(4)) {
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(realDoc);

            Response response =
                    controller.rearrangePages(file, null, "", "SIDE_STITCH_BOOKLET_SORT");

            assertNotNull(response);
            assertEquals(200, response.getStatus());
            assertEquals(4, realDoc.getNumberOfPages());
        }
    }
}
