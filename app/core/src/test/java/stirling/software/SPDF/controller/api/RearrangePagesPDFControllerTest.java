package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

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

    @Test
    void testDeletePages_Success() throws IOException {
        MockMultipartFile file = createMockPdf();
        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(file);
        request.setPageNumbers("1,3");

        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(file)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        ResponseEntity<StreamingResponseBody> response = controller.deletePages(request);

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

        PDDocument mockDoc = mock(PDDocument.class);
        PDDocument mockNewDoc = mock(PDDocument.class);
        PDPage page0 = mock(PDPage.class);
        PDPage page1 = mock(PDPage.class);
        PDPage page2 = mock(PDPage.class);

        when(pdfDocumentFactory.load(file)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(3);
        when(mockDoc.getPage(0)).thenReturn(page0);
        when(mockDoc.getPage(1)).thenReturn(page1);
        when(mockDoc.getPage(2)).thenReturn(page2);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDoc))
                .thenReturn(mockNewDoc);

        ResponseEntity<StreamingResponseBody> response = controller.rearrangePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
        verify(mockNewDoc).addPage(page2);
        verify(mockNewDoc).addPage(page1);
        verify(mockNewDoc).addPage(page0);
    }

    @Test
    void testRearrangePages_RemoveFirst() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("REMOVE_FIRST");

        PDDocument mockDoc = mock(PDDocument.class);
        PDDocument mockNewDoc = mock(PDDocument.class);
        PDPage page0 = mock(PDPage.class);
        PDPage page1 = mock(PDPage.class);
        PDPage page2 = mock(PDPage.class);

        when(pdfDocumentFactory.load(file)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(3);
        when(mockDoc.getPage(1)).thenReturn(page1);
        when(mockDoc.getPage(2)).thenReturn(page2);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDoc))
                .thenReturn(mockNewDoc);

        ResponseEntity<StreamingResponseBody> response = controller.rearrangePages(request);

        assertNotNull(response);
        verify(mockNewDoc).addPage(page1);
        verify(mockNewDoc).addPage(page2);
        verify(mockNewDoc, never()).addPage(page0);
    }

    @Test
    void testRearrangePages_RemoveLast() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("REMOVE_LAST");

        PDDocument mockDoc = mock(PDDocument.class);
        PDDocument mockNewDoc = mock(PDDocument.class);
        PDPage page0 = mock(PDPage.class);
        PDPage page1 = mock(PDPage.class);

        when(pdfDocumentFactory.load(file)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(3);
        when(mockDoc.getPage(0)).thenReturn(page0);
        when(mockDoc.getPage(1)).thenReturn(page1);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDoc))
                .thenReturn(mockNewDoc);

        ResponseEntity<StreamingResponseBody> response = controller.rearrangePages(request);

        assertNotNull(response);
        verify(mockNewDoc).addPage(page0);
        verify(mockNewDoc).addPage(page1);
    }

    @Test
    void testRearrangePages_RemoveFirstAndLast() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("REMOVE_FIRST_AND_LAST");

        PDDocument mockDoc = mock(PDDocument.class);
        PDDocument mockNewDoc = mock(PDDocument.class);
        PDPage page1 = mock(PDPage.class);

        when(pdfDocumentFactory.load(file)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(4);
        when(mockDoc.getPage(1)).thenReturn(page1);
        when(mockDoc.getPage(2)).thenReturn(page1);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDoc))
                .thenReturn(mockNewDoc);

        ResponseEntity<StreamingResponseBody> response = controller.rearrangePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testRearrangePages_DuplexSort() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("DUPLEX_SORT");

        PDDocument mockDoc = mock(PDDocument.class);
        PDDocument mockNewDoc = mock(PDDocument.class);
        PDPage page0 = mock(PDPage.class);
        PDPage page1 = mock(PDPage.class);
        PDPage page2 = mock(PDPage.class);
        PDPage page3 = mock(PDPage.class);

        when(pdfDocumentFactory.load(file)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(4);
        when(mockDoc.getPage(anyInt())).thenReturn(page0);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDoc))
                .thenReturn(mockNewDoc);

        ResponseEntity<StreamingResponseBody> response = controller.rearrangePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testRearrangePages_BookletSort() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("BOOKLET_SORT");

        PDDocument mockDoc = mock(PDDocument.class);
        PDDocument mockNewDoc = mock(PDDocument.class);
        PDPage page = mock(PDPage.class);

        when(pdfDocumentFactory.load(file)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(4);
        when(mockDoc.getPage(anyInt())).thenReturn(page);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDoc))
                .thenReturn(mockNewDoc);

        ResponseEntity<StreamingResponseBody> response = controller.rearrangePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testRearrangePages_OddEvenSplit() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("ODD_EVEN_SPLIT");

        PDDocument mockDoc = mock(PDDocument.class);
        PDDocument mockNewDoc = mock(PDDocument.class);
        PDPage page = mock(PDPage.class);

        when(pdfDocumentFactory.load(file)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(4);
        when(mockDoc.getPage(anyInt())).thenReturn(page);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDoc))
                .thenReturn(mockNewDoc);

        ResponseEntity<StreamingResponseBody> response = controller.rearrangePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testRearrangePages_CustomPageOrder() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("3,1,2");
        request.setCustomMode("custom");

        PDDocument mockDoc = mock(PDDocument.class);
        PDDocument mockNewDoc = mock(PDDocument.class);
        PDPage page0 = mock(PDPage.class);
        PDPage page1 = mock(PDPage.class);
        PDPage page2 = mock(PDPage.class);

        when(pdfDocumentFactory.load(file)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(3);
        when(mockDoc.getPage(0)).thenReturn(page0);
        when(mockDoc.getPage(1)).thenReturn(page1);
        when(mockDoc.getPage(2)).thenReturn(page2);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDoc))
                .thenReturn(mockNewDoc);

        ResponseEntity<StreamingResponseBody> response = controller.rearrangePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testRearrangePages_Duplicate() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("3");
        request.setCustomMode("DUPLICATE");

        PDDocument mockDoc = mock(PDDocument.class);
        PDDocument mockNewDoc = mock(PDDocument.class);
        PDPage page = mock(PDPage.class);

        when(pdfDocumentFactory.load(file)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(2);
        when(mockDoc.getPage(anyInt())).thenReturn(page);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDoc))
                .thenReturn(mockNewDoc);

        ResponseEntity<StreamingResponseBody> response = controller.rearrangePages(request);

        assertNotNull(response);
        // 2 pages * 3 duplicates = 6 addPage calls
        verify(mockNewDoc, times(6)).addPage(page);
    }

    @Test
    void testRearrangePages_SideStitchBooklet() throws IOException {
        MockMultipartFile file = createMockPdf();
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("SIDE_STITCH_BOOKLET_SORT");

        PDDocument mockDoc = mock(PDDocument.class);
        PDDocument mockNewDoc = mock(PDDocument.class);
        PDPage page = mock(PDPage.class);

        when(pdfDocumentFactory.load(file)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(4);
        when(mockDoc.getPage(anyInt())).thenReturn(page);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDoc))
                .thenReturn(mockNewDoc);

        ResponseEntity<StreamingResponseBody> response = controller.rearrangePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }
}
