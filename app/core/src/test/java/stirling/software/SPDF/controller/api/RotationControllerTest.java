package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.RotatePDFRequest;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
@DisplayName("RotationController")
class RotationControllerTest {

    @TempDir Path tempDir;
    @Mock private TempFileManager tempFileManager;

    private RotationController rotationController;

    @BeforeEach
    void setUp() throws Exception {
        rotationController = new RotationController(tempFileManager);
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        invocation -> {
                            Path path =
                                    Files.createTempFile(
                                            tempDir, "rotate-", invocation.<String>getArgument(0));
                            TempFile tempFile = mock(TempFile.class);
                            lenient().when(tempFile.getFile()).thenReturn(path.toFile());
                            lenient().when(tempFile.getPath()).thenReturn(path);
                            return tempFile;
                        });
    }

    @Test
    @DisplayName("rotates every page and returns the rotated document")
    void testRotatePDF() throws IOException {
        RotatePDFRequest request = request(pdfWithPageRotations(0, 0), 90);

        ResponseEntity<Resource> response = rotationController.rotatePDF(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getHeaders().getContentDisposition().getFilename())
                .endsWith("_rotated.pdf");
        try (PDDocument rotated =
                Loader.loadPDF(response.getBody().getInputStream().readAllBytes())) {
            assertThat(rotated.getNumberOfPages()).isEqualTo(2);
            assertThat(rotated.getPage(0).getRotation()).isEqualTo(90);
            assertThat(rotated.getPage(1).getRotation()).isEqualTo(90);
        }
    }

    @Test
    @DisplayName("adds the angle to an existing page rotation")
    void testRotatePDFAddsToExistingRotation() throws IOException {
        RotatePDFRequest request = request(pdfWithPageRotations(270, 90), 180);

        ResponseEntity<Resource> response = rotationController.rotatePDF(request);

        try (PDDocument rotated =
                Loader.loadPDF(response.getBody().getInputStream().readAllBytes())) {
            assertThat(rotated.getPage(0).getRotation()).isEqualTo(90);
            assertThat(rotated.getPage(1).getRotation()).isEqualTo(270);
        }
    }

    @Test
    @DisplayName("rejects an angle that is not a multiple of 90")
    void testRotatePDFInvalidAngle() throws IOException {
        RotatePDFRequest request = request(pdfWithPageRotations(0), 45);

        assertThatThrownBy(() -> rotationController.rotatePDF(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Angle must be a multiple of 90");
    }

    private static RotatePDFRequest request(MockMultipartFile file, int angle) {
        RotatePDFRequest request = new RotatePDFRequest();
        request.setFileInput(file);
        request.setAngle(angle);
        return request;
    }

    private static MockMultipartFile pdfWithPageRotations(int... rotations) throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            for (int rotation : rotations) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                page.setRotation(rotation);
                document.addPage(page);
            }
            document.save(output);
            return new MockMultipartFile(
                    "fileInput",
                    "rotations.pdf",
                    MediaType.APPLICATION_PDF_VALUE,
                    output.toByteArray());
        }
    }
}
