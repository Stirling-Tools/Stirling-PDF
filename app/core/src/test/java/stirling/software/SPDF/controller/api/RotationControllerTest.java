package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.RotatePDFRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
@DisplayName("RotationController Tests")
class RotationControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private RotationController rotationController;

    @Nested
    @DisplayName("Successful Rotation Tests")
    class SuccessfulRotationTests {

        @Test
        @DisplayName("Rotates PDF successfully with valid angle and returns OK response")
        void testRotatePDF() throws IOException {
            // Arrange
            MockMultipartFile mockFile =
                    new MockMultipartFile(
                            "file", "test.pdf", "application/pdf", new byte[] {1, 2, 3});
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
            assertNotNull(response, "Response should not be null");
            assertEquals(HttpStatus.OK, response.getStatusCode(), "Status code should be OK");
        }
    }

    @Nested
    @DisplayName("Invalid Input Tests")
    class InvalidInputTests {

        @Test
        @DisplayName("Throws IllegalArgumentException for invalid rotation angle")
        void testRotatePDFInvalidAngle() throws IOException {
            // Arrange
            MockMultipartFile mockFile =
                    new MockMultipartFile(
                            "file", "test.pdf", "application/pdf", new byte[] {1, 2, 3});
            RotatePDFRequest request = new RotatePDFRequest();
            request.setFileInput(mockFile);
            request.setAngle(45); // Invalid angle

            // Act & Assert
            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> rotationController.rotatePDF(request));
            assertEquals("Angle must be a multiple of 90", exception.getMessage());
        }
    }
}
