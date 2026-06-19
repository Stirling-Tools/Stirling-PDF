package stirling.software.SPDF.controller.api.filters;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class FilterControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private FilterController filterController;

    private FileUpload mockFile;
    private static final long FILE_SIZE = "PDF content".getBytes().length;

    @BeforeEach
    void setUp() {
        mockFile = TestFileUploads.pdf("PDF content".getBytes());
    }

    // ---- containsText tests ----

    @Test
    void containsText_whenTextFound_returns200() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);

        Response expectedResponse = Response.ok(new byte[] {1, 2, 3}).build();

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class);
                MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {

            pdfUtilsMock.when(() -> PdfUtils.hasText(mockDoc, "all", "hello")).thenReturn(true);
            webMock.when(
                            () ->
                                    WebResponseUtils.pdfDocToWebResponse(
                                            mockDoc, "test.pdf", tempFileManager))
                    .thenReturn(expectedResponse);

            Response result = filterController.containsText(mockFile, null, "all", "hello");

            assertEquals(200, result.getStatus());
            assertSame(expectedResponse, result);
        }
    }

    @Test
    void containsText_whenTextNotFound_returns204() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class)) {
            pdfUtilsMock.when(() -> PdfUtils.hasText(mockDoc, "all", "missing")).thenReturn(false);

            Response result = filterController.containsText(mockFile, null, "all", "missing");

            assertEquals(204, result.getStatus());
            assertNull(result.getEntity());
        }
    }

    // ---- containsImage tests ----

    @Test
    void containsImage_whenImageFound_returns200() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);

        Response expectedResponse = Response.ok(new byte[] {4, 5, 6}).build();

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class);
                MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {

            pdfUtilsMock.when(() -> PdfUtils.hasImages(mockDoc, "all")).thenReturn(true);
            webMock.when(
                            () ->
                                    WebResponseUtils.pdfDocToWebResponse(
                                            mockDoc, "test.pdf", tempFileManager))
                    .thenReturn(expectedResponse);

            Response result = filterController.containsImage(mockFile, null, "all");

            assertEquals(200, result.getStatus());
            assertSame(expectedResponse, result);
        }
    }

    @Test
    void containsImage_whenNoImage_returns204() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class)) {
            pdfUtilsMock.when(() -> PdfUtils.hasImages(mockDoc, "1")).thenReturn(false);

            Response result = filterController.containsImage(mockFile, null, "1");

            assertEquals(204, result.getStatus());
        }
    }

    // ---- pageCount tests ----

    @Test
    void pageCount_greaterComparator_passes() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        Response expectedResponse = Response.ok(new byte[] {1}).build();

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(
                            () ->
                                    WebResponseUtils.multiPartFileToWebResponse(
                                            any(MultipartFile.class)))
                    .thenReturn(expectedResponse);

            Response result = filterController.pageCount(mockFile, null, "Greater", 3);

            assertEquals(200, result.getStatus());
        }
    }

    @Test
    void pageCount_greaterComparator_fails() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        Response result = filterController.pageCount(mockFile, null, "Greater", 10);

        assertEquals(204, result.getStatus());
    }

    @Test
    void pageCount_equalComparator_passes() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        Response expectedResponse = Response.ok(new byte[] {1}).build();

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(
                            () ->
                                    WebResponseUtils.multiPartFileToWebResponse(
                                            any(MultipartFile.class)))
                    .thenReturn(expectedResponse);

            Response result = filterController.pageCount(mockFile, null, "Equal", 5);

            assertEquals(200, result.getStatus());
        }
    }

    @Test
    void pageCount_lessComparator_passes() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        Response expectedResponse = Response.ok(new byte[] {1}).build();

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(
                            () ->
                                    WebResponseUtils.multiPartFileToWebResponse(
                                            any(MultipartFile.class)))
                    .thenReturn(expectedResponse);

            Response result = filterController.pageCount(mockFile, null, "Less", 10);

            assertEquals(200, result.getStatus());
        }
    }

    @Test
    void pageCount_invalidComparator_throwsException() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getNumberOfPages()).thenReturn(5);

        assertThrows(
                IllegalArgumentException.class,
                () -> filterController.pageCount(mockFile, null, "Invalid", 5));
    }

    // ---- pageSize tests ----

    @Test
    void pageSize_equalToA4_returns200() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getMediaBox()).thenReturn(PDRectangle.A4);

        Response expectedResponse = Response.ok(new byte[] {1}).build();

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class);
                MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {

            pdfUtilsMock.when(() -> PdfUtils.textToPageSize("A4")).thenReturn(PDRectangle.A4);
            webMock.when(
                            () ->
                                    WebResponseUtils.multiPartFileToWebResponse(
                                            any(MultipartFile.class)))
                    .thenReturn(expectedResponse);

            Response result = filterController.pageSize(mockFile, null, "Equal", "A4");

            assertEquals(200, result.getStatus());
        }
    }

    @Test
    void pageSize_smallerThanA4_greaterComparator_returns204() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getMediaBox()).thenReturn(PDRectangle.A5);

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class)) {
            pdfUtilsMock.when(() -> PdfUtils.textToPageSize("A4")).thenReturn(PDRectangle.A4);

            Response result = filterController.pageSize(mockFile, null, "Greater", "A4");

            assertEquals(204, result.getStatus());
        }
    }

    @Test
    void pageSize_largerThanA4_greaterComparator_returns200() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getMediaBox()).thenReturn(PDRectangle.A3);

        Response expectedResponse = Response.ok(new byte[] {1}).build();

        try (MockedStatic<PdfUtils> pdfUtilsMock = mockStatic(PdfUtils.class);
                MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {

            pdfUtilsMock.when(() -> PdfUtils.textToPageSize("A4")).thenReturn(PDRectangle.A4);
            webMock.when(
                            () ->
                                    WebResponseUtils.multiPartFileToWebResponse(
                                            any(MultipartFile.class)))
                    .thenReturn(expectedResponse);

            Response result = filterController.pageSize(mockFile, null, "Greater", "A4");

            assertEquals(200, result.getStatus());
        }
    }

    // ---- fileSize tests ----

    @Test
    void fileSize_greaterComparator_passes() throws Exception {
        Response expectedResponse = Response.ok(new byte[] {1}).build();

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(
                            () ->
                                    WebResponseUtils.multiPartFileToWebResponse(
                                            any(MultipartFile.class)))
                    .thenReturn(expectedResponse);

            Response result = filterController.fileSize(mockFile, null, "Greater", 5L);

            assertEquals(200, result.getStatus());
        }
    }

    @Test
    void fileSize_greaterComparator_fails() throws Exception {
        Response result = filterController.fileSize(mockFile, null, "Greater", 999999L);

        assertEquals(204, result.getStatus());
    }

    @Test
    void fileSize_equalComparator_passes() throws Exception {
        Response expectedResponse = Response.ok(new byte[] {1}).build();

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(
                            () ->
                                    WebResponseUtils.multiPartFileToWebResponse(
                                            any(MultipartFile.class)))
                    .thenReturn(expectedResponse);

            Response result = filterController.fileSize(mockFile, null, "Equal", FILE_SIZE);

            assertEquals(200, result.getStatus());
        }
    }

    @Test
    void fileSize_invalidComparator_throwsException() {
        assertThrows(
                IllegalArgumentException.class,
                () -> filterController.fileSize(mockFile, null, "BadValue", 10L));
    }

    // ---- pageRotation tests ----

    @Test
    void pageRotation_equalComparator_passes() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getRotation()).thenReturn(90);

        Response expectedResponse = Response.ok(new byte[] {1}).build();

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(
                            () ->
                                    WebResponseUtils.multiPartFileToWebResponse(
                                            any(MultipartFile.class)))
                    .thenReturn(expectedResponse);

            Response result = filterController.pageRotation(mockFile, null, "Equal", 90);

            assertEquals(200, result.getStatus());
        }
    }

    @Test
    void pageRotation_equalComparator_fails() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getRotation()).thenReturn(0);

        Response result = filterController.pageRotation(mockFile, null, "Equal", 90);

        assertEquals(204, result.getStatus());
    }

    @Test
    void pageRotation_greaterComparator_passes() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getRotation()).thenReturn(90);

        Response expectedResponse = Response.ok(new byte[] {1}).build();

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(
                            () ->
                                    WebResponseUtils.multiPartFileToWebResponse(
                                            any(MultipartFile.class)))
                    .thenReturn(expectedResponse);

            Response result = filterController.pageRotation(mockFile, null, "Greater", 0);

            assertEquals(200, result.getStatus());
        }
    }

    @Test
    void pageRotation_lessComparator_passes() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getRotation()).thenReturn(90);

        Response expectedResponse = Response.ok(new byte[] {1}).build();

        try (MockedStatic<WebResponseUtils> webMock = mockStatic(WebResponseUtils.class)) {
            webMock.when(
                            () ->
                                    WebResponseUtils.multiPartFileToWebResponse(
                                            any(MultipartFile.class)))
                    .thenReturn(expectedResponse);

            Response result = filterController.pageRotation(mockFile, null, "Less", 180);

            assertEquals(200, result.getStatus());
        }
    }

    @Test
    void pageRotation_invalidComparator_throwsException() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        PDPage mockPage = mock(PDPage.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDoc);
        when(mockDoc.getPage(0)).thenReturn(mockPage);
        when(mockPage.getRotation()).thenReturn(90);

        assertThrows(
                IllegalArgumentException.class,
                () -> filterController.pageRotation(mockFile, null, "NotValid", 90));
    }
}
