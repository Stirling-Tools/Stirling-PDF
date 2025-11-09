package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.general.OverlayPdfsRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class PdfOverlayControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private PdfOverlayController controller;

    @ParameterizedTest(name = "Overlay Mode: {0}")
    @CsvSource({"InterleavedOverlay", "FixedRepeatOverlay", "SequentialOverlay"})
    @DisplayName("Overlays PDFs sequentially and returns generated document")
    void overlaySequentialSuccess(String overlayMode) throws Exception {
        MockMultipartFile baseFile =
                new MockMultipartFile(
                        "fileInput", "base.pdf", MediaType.APPLICATION_PDF_VALUE, createPdf(2));
        MockMultipartFile overlayFile =
                new MockMultipartFile(
                        "overlayFiles",
                        "overlay.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        createPdf(1));

        PDDocument baseDocument = new PDDocument();
        baseDocument.addPage(new PDPage());
        baseDocument.addPage(new PDPage());
        Mockito.when(pdfDocumentFactory.load(baseFile)).thenReturn(baseDocument);

        OverlayPdfsRequest request = new OverlayPdfsRequest();
        request.setFileInput(baseFile);
        request.setOverlayFiles(new MockMultipartFile[] {overlayFile});
        request.setOverlayMode(overlayMode);
        request.setOverlayPosition(0);
        if ("FixedRepeatOverlay".equals(overlayMode)) {
            request.setCounts(new int[] {5});
        }

        ResponseEntity<byte[]> response = controller.overlayPdfs(request);

        Mockito.verify(pdfDocumentFactory).load(baseFile);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_PDF, response.getHeaders().getContentType());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().length > 0);
        assertEquals(
                "base_overlayed.pdf", response.getHeaders().getContentDisposition().getFilename());
    }

    @Test
    @DisplayName("Throws when overlay mode is unsupported")
    void overlayModeUnsupported() throws Exception {
        MockMultipartFile baseFile =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, createPdf(1));
        MockMultipartFile overlayFile =
                new MockMultipartFile(
                        "overlayFiles",
                        "overlay.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        createPdf(1));

        Mockito.when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenReturn(new PDDocument());

        OverlayPdfsRequest request = new OverlayPdfsRequest();
        request.setFileInput(baseFile);
        request.setOverlayFiles(new MockMultipartFile[] {overlayFile});
        request.setOverlayMode("UnknownMode");
        request.setOverlayPosition(0);

        assertThrows(IllegalArgumentException.class, () -> controller.overlayPdfs(request));
    }

    private byte[] createPdf(int pageCount) throws IOException {
        try (PDDocument document = new PDDocument()) {
            for (int i = 0; i < pageCount; i++) {
                document.addPage(new PDPage());
            }
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            document.save(outputStream);
            return outputStream.toByteArray();
        }
    }
}
