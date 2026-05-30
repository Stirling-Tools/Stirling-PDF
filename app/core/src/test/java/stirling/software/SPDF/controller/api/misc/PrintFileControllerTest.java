package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Paths;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.misc.PrintFileRequest;

@ExtendWith(MockitoExtension.class)
class PrintFileControllerTest {

    private final PrintFileController controller = new PrintFileController();

    @Test
    void printFile_pathTraversal_throwsException() {
        PrintFileRequest request = new PrintFileRequest();
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "../../../etc/passwd", "application/pdf", "data".getBytes());
        request.setFileInput(file);
        request.setPrinterName("test-printer");

        assertThrows(Exception.class, () -> controller.printFile(request));
    }

    @Test
    void printFile_absolutePath_throwsException() {
        PrintFileRequest request = new PrintFileRequest();
        String absPath = Paths.get("/etc/passwd").toString();
        // Only test on systems where /etc/passwd is absolute
        if (Paths.get(absPath).isAbsolute()) {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", absPath, "application/pdf", "data".getBytes());
            request.setFileInput(file);
            request.setPrinterName("test-printer");

            assertThrows(Exception.class, () -> controller.printFile(request));
        }
    }

    @Test
    void printFile_normalFilename_doesNotThrowPathValidation() throws IOException {
        PrintFileRequest request = new PrintFileRequest();
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "document.pdf", "application/pdf", "data".getBytes());
        request.setFileInput(file);
        request.setPrinterName("nonexistent-printer");

        // The controller catches exceptions internally and returns BAD_REQUEST,
        // so no exception is thrown. The response should indicate a printer error, not path error.
        ResponseEntity<String> response = controller.printFile(request);
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(
                response.getBody().contains("No matching printer")
                        || response.getBody().contains("printer"),
                "Should fail on printer lookup, not path validation: " + response.getBody());
    }

    @Test
    void printFile_nullFilename_doesNotThrowPathValidation() throws IOException {
        PrintFileRequest request = new PrintFileRequest();
        MockMultipartFile file =
                new MockMultipartFile("fileInput", null, "application/pdf", "data".getBytes());
        request.setFileInput(file);
        request.setPrinterName("nonexistent-printer");

        // Should not throw path validation error (null filename skips path check)
        // Will likely throw about no matching printer
        try {
            controller.printFile(request);
        } catch (Exception e) {
            assertFalse(e.getMessage().contains("Invalid file path"));
        }
    }

    @Test
    void printFile_dotDotInFilename_throwsException() {
        PrintFileRequest request = new PrintFileRequest();
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "some..file.pdf", "application/pdf", "data".getBytes());
        request.setFileInput(file);
        request.setPrinterName("test-printer");

        // ".." in the middle should trigger path validation
        assertThrows(Exception.class, () -> controller.printFile(request));
    }
}
