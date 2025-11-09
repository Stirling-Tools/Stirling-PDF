package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.service.PdfImageRemovalService;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class PdfImageRemovalControllerTest {

    @Mock private PdfImageRemovalService pdfImageRemovalService;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private PdfImageRemovalController controller;

    @Test
    void removeImagesShouldReturnProcessedDocumentWithUpdatedFilename() throws Exception {
        MockMultipartFile multipartFile =
                new MockMultipartFile(
                        "fileInput",
                        "sample.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        new byte[] {1, 2, 3});

        PDFFile pdfFile = new PDFFile();
        pdfFile.setFileInput(multipartFile);

        PDDocument originalDocument = new PDDocument();
        PDDocument modifiedDocument = new PDDocument();
        modifiedDocument.addPage(new PDPage());

        try {
            when(pdfDocumentFactory.load(pdfFile)).thenReturn(originalDocument);
            when(pdfImageRemovalService.removeImagesFromPdf(originalDocument))
                    .thenReturn(modifiedDocument);

            ResponseEntity<byte[]> response = controller.removeImages(pdfFile);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().length > 0, "Modified PDF should contain data");
            assertEquals(MediaType.APPLICATION_PDF, response.getHeaders().getContentType());
            assertEquals(
                    "sample_images_removed.pdf",
                    response.getHeaders().getContentDisposition().getFilename());

            try (PDDocument resultingDocument = Loader.loadPDF(response.getBody())) {
                assertEquals(1, resultingDocument.getNumberOfPages());
            }

            verify(pdfDocumentFactory).load(pdfFile);
            verify(pdfImageRemovalService).removeImagesFromPdf(originalDocument);
            verifyNoMoreInteractions(pdfDocumentFactory, pdfImageRemovalService);
        } finally {
            originalDocument.close();
            try {
                modifiedDocument.close();
            } catch (IOException ignored) {
                // already closed by the controller
            }
        }
    }
}
