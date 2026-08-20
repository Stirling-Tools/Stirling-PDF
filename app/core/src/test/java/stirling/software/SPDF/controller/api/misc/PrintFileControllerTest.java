package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Paths;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.common.testsupport.TestFileUploads;

@ExtendWith(MockitoExtension.class)
class PrintFileControllerTest {

    private final PrintFileController controller = new PrintFileController();

    @Test
    void printFile_pathTraversal_throwsException() {
        FileUpload file =
                TestFileUploads.of("data".getBytes(), "../../../etc/passwd", "application/pdf");

        assertThrows(Exception.class, () -> controller.printFile(file, "test-printer"));
    }

    @Test
    void printFile_absolutePath_throwsException() {
        String absPath = Paths.get("/etc/passwd").toString();
        // Only test on systems where /etc/passwd is absolute
        if (Paths.get(absPath).isAbsolute()) {
            FileUpload file = TestFileUploads.of("data".getBytes(), absPath, "application/pdf");

            assertThrows(Exception.class, () -> controller.printFile(file, "test-printer"));
        }
    }

    @Test
    void printFile_normalFilename_doesNotThrowPathValidation() throws IOException {
        FileUpload file = TestFileUploads.of("data".getBytes(), "document.pdf", "application/pdf");

        // The controller catches exceptions internally and returns BAD_REQUEST,
        // so no exception is thrown. The response should indicate a printer error, not path error.
        Response response = controller.printFile(file, "nonexistent-printer");
        assertEquals(400, response.getStatus());
        String body = String.valueOf(response.getEntity());
        assertTrue(
                body.contains("No matching printer") || body.contains("printer"),
                "Should fail on printer lookup, not path validation: " + body);
    }

    @Test
    void printFile_nullFilename_doesNotThrowPathValidation() throws IOException {
        FileUpload file = TestFileUploads.of("data".getBytes(), null, "application/pdf");

        // Should not throw path validation error (null filename skips path check)
        // Will likely throw about no matching printer
        try {
            controller.printFile(file, "nonexistent-printer");
        } catch (Exception e) {
            assertFalse(e.getMessage().contains("Invalid file path"));
        }
    }

    @Test
    void printFile_dotDotInFilename_throwsException() {
        FileUpload file =
                TestFileUploads.of("data".getBytes(), "some..file.pdf", "application/pdf");

        // ".." in the middle should trigger path validation
        assertThrows(Exception.class, () -> controller.printFile(file, "test-printer"));
    }
}
