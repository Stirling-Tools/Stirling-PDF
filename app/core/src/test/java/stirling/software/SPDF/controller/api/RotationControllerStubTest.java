package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.RotatePDFRequest;

public class RotationControllerStubTest {

    @Test
    void testRotatePDF_UsesSubclassStubInsteadOfRealLoad() throws IOException {
        MockMultipartFile mockFile =
                new MockMultipartFile(
                        "file", "test.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[] {1, 2, 3});

        RotatePDFRequest request = new RotatePDFRequest();
        request.setFileInput(mockFile);
        request.setAngle(90);

        PDDocument fakeDocument = new PDDocument();
        fakeDocument.addPage(new PDPage());

        RotationController controller =
                new RotationController(null) {

                    @Override
                    protected PDDocument loadDocument(RotatePDFRequest request) {
                        return fakeDocument; // stubbed loading
                    }

                    @Override
                    protected ResponseEntity<byte[]> respondPdf(
                            PDDocument document, String filename) {
                        // stubbed response (avoid WebResponseUtils)
                        return ResponseEntity.ok(new byte[] {1});
                    }
                };

        ResponseEntity<byte[]> response = controller.rotatePDF(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
        assertArrayEquals(new byte[] {1}, response.getBody());
    }
}
