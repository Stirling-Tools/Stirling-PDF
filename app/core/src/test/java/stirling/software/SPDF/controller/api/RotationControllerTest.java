package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
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
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.model.api.general.RotatePDFRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
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
        // The controller binds @RestForm FileUpload and rebuilds the RotatePDFRequest internally.
        FileUpload fileUpload = TestFileUploads.pdf(new byte[] {1, 2, 3});

        PDDocument mockDocument = mock(PDDocument.class);
        PDPageTree mockPages = mock(PDPageTree.class);
        PDPage mockPage = mock(PDPage.class);

        when(pdfDocumentFactory.load(any(RotatePDFRequest.class))).thenReturn(mockDocument);
        when(mockDocument.getPages()).thenReturn(mockPages);
        when(mockPages.iterator())
                .thenReturn(java.util.Collections.singletonList(mockPage).iterator());
        when(mockPage.getRotation()).thenReturn(0);

        // Act
        Response response = rotationController.rotatePDF(fileUpload, null, 90);

        // Assert
        verify(mockPage).setRotation(90);
        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    public void testRotatePDFInvalidAngle() {
        FileUpload fileUpload = TestFileUploads.pdf(new byte[] {1, 2, 3});

        // Act & Assert: call the controller directly and expect the validation exception.
        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> rotationController.rotatePDF(fileUpload, null, 45));
        assertEquals("Angle must be a multiple of 90", exception.getMessage());
    }
}
