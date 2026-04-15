package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.SPDF.model.api.general.RotatePDFRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
public class RotationControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private RotationController rotationController;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    @Test
    public void testRotatePDF() throws IOException {
        // Create a mock file
        MockMultipartFile mockFile =
                new MockMultipartFile(
                        "file", "test.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[] {1, 2, 3});
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
        ResponseEntity<StreamingResponseBody> response = rotationController.rotatePDF(request);

        // Assert
        verify(mockPage).setRotation(90);
        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    public void testRotatePDFInvalidAngle() {
        // Create a mock file
        MockMultipartFile mockFile =
                new MockMultipartFile(
                        "file", "test.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[] {1, 2, 3});
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
