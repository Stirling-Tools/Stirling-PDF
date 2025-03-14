package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.RotatePDFRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
public class RotationControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private RotationController rotationController;

    @Test
    public void testRotatePDF() throws IOException {
        // Create a mock file
        MockMultipartFile mockFile =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1, 2, 3});
        RotatePDFRequest request = new RotatePDFRequest();
        request.setFileInput(mockFile);
        request.setAngle(90);

        PDDocument mockDocument = mock(PDDocument.class);
        PDPageTree mockPages = mock(PDPageTree.class);
        PDPage mockPage = mock(PDPage.class);

        when(pdfDocumentFactory.load(request)).thenReturn(mockDocument);
        when(mockDocument.getPages()).thenReturn(mockPages);
        when(mockPages.iterator())
                .thenReturn(java.util.Collections.singletonList(mockPage).iterator());
        when(mockPage.getRotation()).thenReturn(0);

        // Act
        ResponseEntity<byte[]> response = rotationController.rotatePDF(request);

        // Assert
        verify(mockPage).setRotation(90);
        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    public void testRotatePDFInvalidAngle() throws IOException {
        // Create a mock file
        MockMultipartFile mockFile =
                new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[] {1, 2, 3});
        RotatePDFRequest request = new RotatePDFRequest();
        request.setFileInput(mockFile);
        request.setAngle(45); // Invalid angle

        // Act & Assert: Controller direkt aufrufen und Exception erwarten
        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> rotationController.rotatePDF(request));
        assertEquals("Angle must be a multiple of 90", exception.getMessage());
    }
}
