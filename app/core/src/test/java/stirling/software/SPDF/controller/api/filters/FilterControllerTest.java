package stirling.software.SPDF.controller.api.filters;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.SPDF.model.api.PDFComparisonAndCount;
import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.model.api.filter.ContainsTextRequest;
import stirling.software.SPDF.model.api.filter.FileSizeRequest;
import stirling.software.SPDF.model.api.filter.PageRotationRequest;
import stirling.software.SPDF.model.api.filter.PageSizeRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class FilterControllerTest {
    private static ResponseEntity<StreamingResponseBody> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(out -> out.write(bytes));
    }

    private static byte[] drainBody(ResponseEntity<StreamingResponseBody> response)
            throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        response.getBody().writeTo(baos);
        return baos.toByteArray();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private FilterController filterController;

    private MockMultipartFile mockFile;

    @BeforeEach
    void setUp() {
        mockFile =
                new MockMultipartFile(
                        "fileInput",
                        "test.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "PDF content".getBytes());
    }

    // ---- containsText tests ----

    @Test
    void containsText_whenTextFound_returns200() throws Exception {
        ContainsTextRequest request = new ContainsTextRequest();
        request.setFileInput(mockFile);
        request.setText("hello");
        request.setPageNumbers("all");

        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);

        ResponseEntity<StreamingResponseBody> expectedResponse = streamingOk(new byte[] {1, 2, 3});

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class);
                MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {

            pdfUtilsMock.when(() -> PdfUtils.hasText(mockDoc, "all", "hello")).thenReturn(true);
            webMock.when(
                            () ->
                                    WebResponseUtils.pdfDocToWebResponse(
                                            mockDoc, "test.pdf", tempFileManager))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> result = filterController.containsText(request);

            assertEquals(HttpStatus.OK, result.getStatusCode());
            assertArrayEquals(new byte[] {1, 2, 3}, drainBody(result));
        }
    }

    @Test
    void containsText_whenTextNotFound_returns204() throws Exception {
        ContainsTextRequest request = new ContainsTextRequest();
        request.setFileInput(mockFile);
        request.setText("missing");
        request.setPageNumbers("all");

        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class)) {
            pdfUtilsMock.when(() -> PdfUtils.hasText(mockDoc, "all", "missing")).thenReturn(false);

            ResponseEntity<StreamingResponseBody> result = filterController.containsText(request);

            assertEquals(HttpStatus.NO_CONTENT, result.getStatusCode());
            assertNull(result.getBody());
        }
    }

    // ---- containsImage tests ----

    @Test
    void containsImage_whenImageFound_returns200() throws Exception {
        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(mockFile);
        request.setPageNumbers("all");

        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);

        ResponseEntity<StreamingResponseBody> expectedResponse = streamingOk(new byte[] {4, 5, 6});

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class);
                MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {

            pdfUtilsMock.when(() -> PdfUtils.hasImages(mockDoc, "all")).thenReturn(true);
            webMock.when(
                            () ->
                                    WebResponseUtils.pdfDocToWebResponse(
                                            mockDoc, "test.pdf", tempFileManager))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> result = filterController.containsImage(request);

            assertEquals(HttpStatus.OK, result.getStatusCode());
            assertArrayEquals(new byte[] {4, 5, 6}, drainBody(result));
        }
    }

    @Test
    void containsImage_whenNoImage_returns204() throws Exception {
        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(mockFile);
        request.setPageNumbers("1");

        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class)) {
            pdfUtilsMock.when(() -> PdfUtils.hasImages(mockDoc, "1")).thenReturn(false);

            ResponseEntity<StreamingResponseBody> result = filterController.containsImage(request);

            assertEquals(HttpStatus.NO_CONTENT, result.getStatusCode());
        }
    }

    // ---- pageCount tests ----

    @Test
    void pageCount_greaterComparator_passes() throws Exception {
        PDFComparisonAndCount request = new PDFComparisonAndCount();
        request.setFileInput(mockFile);
        request.setPageCount(3);
        request.setComparator("Greater");

        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(mockFile.getBytes());

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(() -> WebResponseUtils.multiPartFileToWebResponse(mockFile))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> result = filterController.pageCount(request);

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }
    }

    @Test
    void pageCount_greaterComparator_fails() throws Exception {
        PDFComparisonAndCount request = new PDFComparisonAndCount();
        request.setFileInput(mockFile);
        request.setPageCount(10);
        request.setComparator("Greater");

        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        ResponseEntity<byte[]> result = filterController.pageCount(request);

        assertEquals(HttpStatus.NO_CONTENT, result.getStatusCode());
    }

    @Test
    void pageCount_equalComparator_passes() throws Exception {
        PDFComparisonAndCount request = new PDFComparisonAndCount();
        request.setFileInput(mockFile);
        request.setPageCount(5);
        request.setComparator("Equal");

        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(mockFile.getBytes());

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(() -> WebResponseUtils.multiPartFileToWebResponse(mockFile))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> result = filterController.pageCount(request);

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }
    }

    @Test
    void pageCount_lessComparator_passes() throws Exception {
        PDFComparisonAndCount request = new PDFComparisonAndCount();
        request.setFileInput(mockFile);
        request.setPageCount(10);
        request.setComparator("Less");

        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(mockFile.getBytes());

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(() -> WebResponseUtils.multiPartFileToWebResponse(mockFile))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> result = filterController.pageCount(request);

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }
    }

    @Test
    void pageCount_invalidComparator_throwsException() throws Exception {
        PDFComparisonAndCount request = new PDFComparisonAndCount();
        request.setFileInput(mockFile);
        request.setPageCount(5);
        request.setComparator("Invalid");

        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        assertThrows(IllegalArgumentException.class, () -> filterController.pageCount(request));
    }

    // ---- pageSize tests ----

    @Test
    void pageSize_equalToA4_returns200() throws Exception {
        PageSizeRequest request = new PageSizeRequest();
        request.setFileInput(mockFile);
        request.setStandardPageSize("A4");
        request.setComparator("Equal");

        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getMediaBox()).thenReturn(PDRectangle.A4);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(mockFile.getBytes());

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class);
                MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {

            pdfUtilsMock.when(() -> PdfUtils.textToPageSize("A4")).thenReturn(PDRectangle.A4);
            webMock.when(() -> WebResponseUtils.multiPartFileToWebResponse(mockFile))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> result = filterController.pageSize(request);

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }
    }

    @Test
    void pageSize_smallerThanA4_greaterComparator_returns204() throws Exception {
        PageSizeRequest request = new PageSizeRequest();
        request.setFileInput(mockFile);
        request.setStandardPageSize("A4");
        request.setComparator("Greater");

        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getMediaBox()).thenReturn(PDRectangle.A5);

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class)) {
            pdfUtilsMock.when(() -> PdfUtils.textToPageSize("A4")).thenReturn(PDRectangle.A4);

            ResponseEntity<byte[]> result = filterController.pageSize(request);

            assertEquals(HttpStatus.NO_CONTENT, result.getStatusCode());
        }
    }

    @Test
    void pageSize_largerThanA4_greaterComparator_returns200() throws Exception {
        PageSizeRequest request = new PageSizeRequest();
        request.setFileInput(mockFile);
        request.setStandardPageSize("A4");
        request.setComparator("Greater");

        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getMediaBox()).thenReturn(PDRectangle.A3);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(mockFile.getBytes());

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class);
                MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {

            pdfUtilsMock.when(() -> PdfUtils.textToPageSize("A4")).thenReturn(PDRectangle.A4);
            webMock.when(() -> WebResponseUtils.multiPartFileToWebResponse(mockFile))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> result = filterController.pageSize(request);

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }
    }

    // ---- fileSize tests ----

    @Test
    void fileSize_greaterComparator_passes() throws Exception {
        FileSizeRequest request = new FileSizeRequest();
        request.setFileInput(mockFile);
        request.setFileSize(5L);
        request.setComparator("Greater");

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(mockFile.getBytes());

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(() -> WebResponseUtils.multiPartFileToWebResponse(mockFile))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> result = filterController.fileSize(request);

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }
    }

    @Test
    void fileSize_greaterComparator_fails() throws Exception {
        FileSizeRequest request = new FileSizeRequest();
        request.setFileInput(mockFile);
        request.setFileSize(999999L);
        request.setComparator("Greater");

        ResponseEntity<byte[]> result = filterController.fileSize(request);

        assertEquals(HttpStatus.NO_CONTENT, result.getStatusCode());
    }

    @Test
    void fileSize_equalComparator_passes() throws Exception {
        FileSizeRequest request = new FileSizeRequest();
        request.setFileInput(mockFile);
        request.setFileSize(mockFile.getSize());
        request.setComparator("Equal");

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(mockFile.getBytes());

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(() -> WebResponseUtils.multiPartFileToWebResponse(mockFile))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> result = filterController.fileSize(request);

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }
    }

    @Test
    void fileSize_invalidComparator_throwsException() {
        FileSizeRequest request = new FileSizeRequest();
        request.setFileInput(mockFile);
        request.setFileSize(10L);
        request.setComparator("BadValue");

        assertThrows(IllegalArgumentException.class, () -> filterController.fileSize(request));
    }

    // ---- pageRotation tests ----

    @Test
    void pageRotation_equalComparator_passes() throws Exception {
        PageRotationRequest request = new PageRotationRequest();
        request.setFileInput(mockFile);
        request.setRotation(90);
        request.setComparator("Equal");

        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getRotation()).thenReturn(90);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(mockFile.getBytes());

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(() -> WebResponseUtils.multiPartFileToWebResponse(mockFile))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> result = filterController.pageRotation(request);

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }
    }

    @Test
    void pageRotation_equalComparator_fails() throws Exception {
        PageRotationRequest request = new PageRotationRequest();
        request.setFileInput(mockFile);
        request.setRotation(90);
        request.setComparator("Equal");

        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getRotation()).thenReturn(0);

        ResponseEntity<byte[]> result = filterController.pageRotation(request);

        assertEquals(HttpStatus.NO_CONTENT, result.getStatusCode());
    }

    @Test
    void pageRotation_greaterComparator_passes() throws Exception {
        PageRotationRequest request = new PageRotationRequest();
        request.setFileInput(mockFile);
        request.setRotation(0);
        request.setComparator("Greater");

        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getRotation()).thenReturn(90);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(mockFile.getBytes());

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(() -> WebResponseUtils.multiPartFileToWebResponse(mockFile))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> result = filterController.pageRotation(request);

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }
    }

    @Test
    void pageRotation_lessComparator_passes() throws Exception {
        PageRotationRequest request = new PageRotationRequest();
        request.setFileInput(mockFile);
        request.setRotation(180);
        request.setComparator("Less");

        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getRotation()).thenReturn(90);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(mockFile.getBytes());

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(() -> WebResponseUtils.multiPartFileToWebResponse(mockFile))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> result = filterController.pageRotation(request);

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }
    }

    @Test
    void pageRotation_invalidComparator_throwsException() throws Exception {
        PageRotationRequest request = new PageRotationRequest();
        request.setFileInput(mockFile);
        request.setRotation(90);
        request.setComparator("NotValid");

        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getRotation()).thenReturn(90);

        assertThrows(IllegalArgumentException.class, () -> filterController.pageRotation(request));
    }
}
