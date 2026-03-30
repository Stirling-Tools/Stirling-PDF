package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.converters.PdfToVideoRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CheckProgramInstall;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ConvertPdfToVideoControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private ConvertPdfToVideoController controller;

    @Test
    void convertPdfToVideo_ffmpegNotAvailableThrows() {
        PdfToVideoRequest request = new PdfToVideoRequest();
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", "content".getBytes());
        request.setFileInput(pdfFile);

        try (MockedStatic<CheckProgramInstall> mock =
                Mockito.mockStatic(CheckProgramInstall.class)) {
            mock.when(CheckProgramInstall::isFfmpegAvailable).thenReturn(false);

            assertThrows(Exception.class, () -> controller.convertPdfToVideo(request));
        }
    }

    @Test
    void convertPdfToVideo_nullFileThrows() {
        PdfToVideoRequest request = new PdfToVideoRequest();
        request.setFileInput(null);

        try (MockedStatic<CheckProgramInstall> mock =
                Mockito.mockStatic(CheckProgramInstall.class)) {
            mock.when(CheckProgramInstall::isFfmpegAvailable).thenReturn(true);

            assertThrows(Exception.class, () -> controller.convertPdfToVideo(request));
        }
    }

    @Test
    void convertPdfToVideo_emptyFileThrows() {
        PdfToVideoRequest request = new PdfToVideoRequest();
        MockMultipartFile emptyFile =
                new MockMultipartFile("fileInput", "doc.pdf", "application/pdf", new byte[0]);
        request.setFileInput(emptyFile);

        try (MockedStatic<CheckProgramInstall> mock =
                Mockito.mockStatic(CheckProgramInstall.class)) {
            mock.when(CheckProgramInstall::isFfmpegAvailable).thenReturn(true);

            assertThrows(Exception.class, () -> controller.convertPdfToVideo(request));
        }
    }

    @Test
    void convertPdfToVideo_nonPdfContentTypeReturnsBadRequest() throws Exception {
        PdfToVideoRequest request = new PdfToVideoRequest();
        MockMultipartFile txtFile =
                new MockMultipartFile("fileInput", "doc.txt", "text/plain", "content".getBytes());
        request.setFileInput(txtFile);

        try (MockedStatic<CheckProgramInstall> mock =
                Mockito.mockStatic(CheckProgramInstall.class)) {
            mock.when(CheckProgramInstall::isFfmpegAvailable).thenReturn(true);

            ResponseEntity<byte[]> response = controller.convertPdfToVideo(request);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        }
    }

    @Test
    void convertPdfToVideo_invalidOpacityThrows() {
        PdfToVideoRequest request = new PdfToVideoRequest();
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", "content".getBytes());
        request.setFileInput(pdfFile);
        request.setOpacity(1.5f);

        try (MockedStatic<CheckProgramInstall> mock =
                Mockito.mockStatic(CheckProgramInstall.class)) {
            mock.when(CheckProgramInstall::isFfmpegAvailable).thenReturn(true);

            assertThrows(Exception.class, () -> controller.convertPdfToVideo(request));
        }
    }

    @Test
    void convertPdfToVideo_negativeOpacityThrows() {
        PdfToVideoRequest request = new PdfToVideoRequest();
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", "content".getBytes());
        request.setFileInput(pdfFile);
        request.setOpacity(-0.1f);

        try (MockedStatic<CheckProgramInstall> mock =
                Mockito.mockStatic(CheckProgramInstall.class)) {
            mock.when(CheckProgramInstall::isFfmpegAvailable).thenReturn(true);

            assertThrows(Exception.class, () -> controller.convertPdfToVideo(request));
        }
    }

    @Test
    void convertPdfToVideo_negativeSecondsPerPageThrows() {
        PdfToVideoRequest request = new PdfToVideoRequest();
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", "content".getBytes());
        request.setFileInput(pdfFile);
        request.setSecondsPerPage(-1);

        try (MockedStatic<CheckProgramInstall> mock =
                Mockito.mockStatic(CheckProgramInstall.class)) {
            mock.when(CheckProgramInstall::isFfmpegAvailable).thenReturn(true);

            assertThrows(Exception.class, () -> controller.convertPdfToVideo(request));
        }
    }

    @Test
    void convertPdfToVideo_zeroSecondsPerPageThrows() {
        PdfToVideoRequest request = new PdfToVideoRequest();
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", "content".getBytes());
        request.setFileInput(pdfFile);
        request.setSecondsPerPage(0);

        try (MockedStatic<CheckProgramInstall> mock =
                Mockito.mockStatic(CheckProgramInstall.class)) {
            mock.when(CheckProgramInstall::isFfmpegAvailable).thenReturn(true);

            assertThrows(Exception.class, () -> controller.convertPdfToVideo(request));
        }
    }

    @Test
    void controllerIsConstructed() {
        assertNotNull(controller);
    }
}
