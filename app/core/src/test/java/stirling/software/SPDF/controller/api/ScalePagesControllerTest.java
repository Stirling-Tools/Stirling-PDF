package stirling.software.SPDF.controller.api;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.ScalePagesRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class ScalePagesControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private ScalePagesController controller;

    private MockMultipartFile fileWithExtension;

    @BeforeEach
    void setUp() {
        fileWithExtension =
                new MockMultipartFile(
                        "fileInput", "sample.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Test
    @DisplayName("Scales PDF to requested target size and returns PDF response")
    void scalePagesWithTargetSizeProducesPdf() throws Exception {
        PDDocument sourceDocument = new PDDocument();
        sourceDocument.addPage(new PDPage(PDRectangle.A5));
        PDDocument outputDocument = new PDDocument();

        Mockito.when(pdfDocumentFactory.load(fileWithExtension)).thenReturn(sourceDocument);
        Mockito.when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument))
                .thenReturn(outputDocument);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(fileWithExtension);
        request.setPageSize("A4");
        request.setScaleFactor(1.0f);

        ResponseEntity<byte[]> response = controller.scalePages(request);

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        Assertions.assertEquals(MediaType.APPLICATION_PDF, response.getHeaders().getContentType());
        Assertions.assertEquals(
                "sample_scaled.pdf", response.getHeaders().getContentDisposition().getFilename());
        Assertions.assertNotNull(response.getBody());
        Assertions.assertTrue(response.getBody().length > 0);
    }

    @Test
    @DisplayName("Uses KEEP page size to mirror original first page dimensions")
    void scalePagesKeepUsesFirstPageSize() throws Exception {
        PDRectangle originalRectangle = new PDRectangle(420, 620);
        PDDocument sourceDocument = new PDDocument();
        sourceDocument.addPage(new PDPage(originalRectangle));
        PDDocument outputDocument = new PDDocument();

        Mockito.when(pdfDocumentFactory.load(fileWithExtension)).thenReturn(sourceDocument);
        Mockito.when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument))
                .thenReturn(outputDocument);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(fileWithExtension);
        request.setPageSize("KEEP");
        request.setScaleFactor(1.0f);

        ResponseEntity<byte[]> response = controller.scalePages(request);

        try (PDDocument resultDocument = Loader.loadPDF(response.getBody())) {
            PDRectangle resultRectangle = resultDocument.getPage(0).getMediaBox();
            Assertions.assertEquals(originalRectangle.getWidth(), resultRectangle.getWidth(), 0.01);
            Assertions.assertEquals(
                    originalRectangle.getHeight(), resultRectangle.getHeight(), 0.01);
        }
    }

    @Test
    @DisplayName("Rejects unknown page size values")
    void scalePagesWithUnknownSizeThrows() throws Exception {
        PDDocument sourceDocument = new PDDocument();
        sourceDocument.addPage(new PDPage(PDRectangle.A4));
        PDDocument outputDocument = new PDDocument();

        Mockito.when(pdfDocumentFactory.load(fileWithExtension)).thenReturn(sourceDocument);
        Mockito.when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument))
                .thenReturn(outputDocument);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(fileWithExtension);
        request.setPageSize("UNKNOWN_SIZE");
        request.setScaleFactor(1.0f);

        try {
            Assertions.assertThrows(
                    IllegalArgumentException.class, () -> controller.scalePages(request));
        } finally {
            sourceDocument.close();
            outputDocument.close();
        }
    }
}
