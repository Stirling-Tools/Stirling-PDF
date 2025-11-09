package stirling.software.SPDF.controller.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class ToSinglePageControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private ToSinglePageController controller;

    @Test
    @DisplayName("Stacks all PDF pages into a single tall page and returns PDF response")
    void pdfToSinglePageCombinesAllPages() throws Exception {
        PDDocument sourceDocument = new PDDocument();
        PDPage firstPage = new PDPage(new PDRectangle(200, 500));
        PDPage secondPage = new PDPage(new PDRectangle(300, 600));
        sourceDocument.addPage(firstPage);
        sourceDocument.addPage(secondPage);

        PDDocument newDocument = new PDDocument();

        PDFFile request = new PDFFile();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput",
                        "sample.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        new byte[] {1, 2, 3}));

        when(pdfDocumentFactory.load(any(PDFFile.class))).thenReturn(sourceDocument);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument))
                .thenReturn(newDocument);

        ResponseEntity<byte[]> response = controller.pdfToSinglePage(request);

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        Assertions.assertEquals(MediaType.APPLICATION_PDF, response.getHeaders().getContentType());
        Assertions.assertEquals(
                "sample_singlePage.pdf",
                response.getHeaders().getContentDisposition().getFilename());
        Assertions.assertNotNull(response.getBody());
        Assertions.assertTrue(response.getBody().length > 0);

        try (PDDocument result = Loader.loadPDF(response.getBody())) {
            Assertions.assertEquals(1, result.getNumberOfPages());
            PDRectangle mediaBox = result.getPage(0).getMediaBox();
            Assertions.assertEquals(300f, mediaBox.getWidth(), 0.1f);
            Assertions.assertEquals(1100f, mediaBox.getHeight(), 0.1f);
        }

        verify(pdfDocumentFactory).load(request);
        verify(pdfDocumentFactory).createNewDocumentBasedOnOldDocument(sourceDocument);
    }
}
