package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.ByteArrayMultipartFile;

/**
 * MIGRATION (Spring -> Quarkus): {@link AiToolInputValidator} validates the {@code
 * stirling.software.common.model.MultipartFile} shim (was Spring's {@code
 * org.springframework.web.multipart.MultipartFile}) and signals failures with a JAX-RS {@link
 * WebApplicationException} carrying a {@link Response.Status} (was Spring's {@code
 * ResponseStatusException} / {@code HttpStatus}).
 */
class AiToolInputValidatorTest {

    @Test
    void acceptsValidPdfUpload() {
        ByteArrayMultipartFile file =
                new ByteArrayMultipartFile(
                        "fileInput", "a.pdf", "application/pdf", new byte[] {1, 2});
        assertDoesNotThrow(() -> AiToolInputValidator.validatePdfUpload(file));
    }

    @Test
    void rejectsNullFile() {
        WebApplicationException ex =
                assertThrows(
                        WebApplicationException.class,
                        () -> AiToolInputValidator.validatePdfUpload(null));
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), ex.getResponse().getStatus());
    }

    @Test
    void rejectsEmptyFile() {
        ByteArrayMultipartFile file =
                new ByteArrayMultipartFile("fileInput", "a.pdf", "application/pdf", new byte[0]);
        WebApplicationException ex =
                assertThrows(
                        WebApplicationException.class,
                        () -> AiToolInputValidator.validatePdfUpload(file));
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), ex.getResponse().getStatus());
    }

    @Test
    void rejectsNonPdfContentType() {
        ByteArrayMultipartFile file =
                new ByteArrayMultipartFile("fileInput", "a.txt", "text/plain", new byte[] {1, 2});
        WebApplicationException ex =
                assertThrows(
                        WebApplicationException.class,
                        () -> AiToolInputValidator.validatePdfUpload(file));
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), ex.getResponse().getStatus());
    }

    @Test
    void rejectsMissingContentType() {
        ByteArrayMultipartFile file =
                new ByteArrayMultipartFile("fileInput", "a.pdf", null, new byte[] {1, 2});
        WebApplicationException ex =
                assertThrows(
                        WebApplicationException.class,
                        () -> AiToolInputValidator.validatePdfUpload(file));
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), ex.getResponse().getStatus());
    }

    @Test
    void rejectsOversizedFile() {
        // Mock getSize() to avoid allocating a 50 MB test payload.
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getContentType()).thenReturn("application/pdf");
        when(file.getSize()).thenReturn(AiToolInputValidator.MAX_INPUT_FILE_BYTES + 1);

        WebApplicationException ex =
                assertThrows(
                        WebApplicationException.class,
                        () -> AiToolInputValidator.validatePdfUpload(file));
        assertEquals(
                Response.Status.REQUEST_ENTITY_TOO_LARGE.getStatusCode(),
                ex.getResponse().getStatus());
    }
}
