package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

class AiToolInputValidatorTest {

    @Test
    void acceptsValidPdfUpload() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "a.pdf", "application/pdf", new byte[] {1, 2});
        assertDoesNotThrow(() -> AiToolInputValidator.validatePdfUpload(file));
    }

    @Test
    void rejectsNullFile() {
        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () -> AiToolInputValidator.validatePdfUpload(null));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void rejectsEmptyFile() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "a.pdf", "application/pdf", new byte[0]);
        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () -> AiToolInputValidator.validatePdfUpload(file));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void rejectsNonPdfContentType() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "a.txt", "text/plain", new byte[] {1, 2});
        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () -> AiToolInputValidator.validatePdfUpload(file));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void rejectsMissingContentType() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "a.pdf", null, new byte[] {1, 2});
        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () -> AiToolInputValidator.validatePdfUpload(file));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void rejectsOversizedFile() {
        // Mock getSize() to avoid allocating a 50 MB test payload.
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getContentType()).thenReturn("application/pdf");
        when(file.getSize()).thenReturn(AiToolInputValidator.MAX_INPUT_FILE_BYTES + 1);

        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () -> AiToolInputValidator.validatePdfUpload(file));
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, ex.getStatusCode());
    }
}
