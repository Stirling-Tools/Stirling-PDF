package stirling.software.proprietary.controller.api;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.proprietary.service.PdfCommentAgentOrchestrator;
import stirling.software.proprietary.service.PdfCommentAgentOrchestrator.AnnotatedPdf;

import tools.jackson.databind.json.JsonMapper;

/**
 * MIGRATION (Spring -> Quarkus): {@code PdfCommentAgentController} is a JAX-RS resource taking a
 * RESTEasy Reactive {@code FileUpload} + form {@code prompt} and returning {@link Response}. Tests
 * call the handler directly with a {@link TestFileUploads} stub for the upload.
 *
 * <p>The orchestrator is mocked so the test never hits the engine or real filesystem. Validation
 * errors are now signalled by {@code WebApplicationException} (was Spring {@code
 * ResponseStatusException}); the controller lets them propagate, so the error-path tests assert the
 * thrown status rather than a MockMvc {@code status()} matcher. The former "missing required form
 * param" tests (previously enforced by Spring's {@code DefaultHandlerExceptionResolver}) are kept
 * as direct-call equivalents: a missing file arrives as {@code null} and the controller fails fast
 * before reaching the orchestrator; a missing prompt is rejected by the orchestrator with 400.
 */
@ExtendWith(MockitoExtension.class)
class PdfCommentAgentControllerTest {

    @Mock private PdfCommentAgentOrchestrator orchestrator;

    private PdfCommentAgentController controller;

    @BeforeEach
    void setUp() {
        controller = new PdfCommentAgentController();
        controller.orchestrator = orchestrator;
        controller.objectMapper = JsonMapper.builder().build();
    }

    @Test
    void acceptsValidPdfAndReturnsAnnotatedBytes() throws Exception {
        FileUpload pdfFile =
                TestFileUploads.of("%PDF-1.4\n%%EOF".getBytes(), "input.pdf", "application/pdf");

        byte[] annotatedBytes = "%PDF-1.4\n<annotated>\n%%EOF".getBytes();
        AnnotatedPdf stub = new AnnotatedPdf(annotatedBytes, "input-commented.pdf", 2, 2, "ok");
        when(orchestrator.applyComments(any(MultipartFile.class), eq("flag dates")))
                .thenReturn(stub);

        Response resp = controller.pdfCommentAgent(pdfFile, "flag dates");

        assertEquals(200, resp.getStatus());
        assertEquals("application/pdf", resp.getMediaType().toString());
        assertTrue(resp.getHeaderString("Content-Disposition").contains("input-commented.pdf"));
        assertArrayEquals(annotatedBytes, (byte[]) resp.getEntity());

        verify(orchestrator).applyComments(any(MultipartFile.class), eq("flag dates"));
    }

    @Test
    void propagatesOrchestratorBadRequestForNonPdfUpload() throws Exception {
        // The controller delegates validation to the orchestrator; a WebApplicationException
        // thrown by the orchestrator should propagate as a 400.
        FileUpload notPdf = TestFileUploads.of("hello".getBytes(), "input.txt", "text/plain");
        when(orchestrator.applyComments(any(MultipartFile.class), eq("whatever")))
                .thenThrow(
                        new WebApplicationException(
                                "Only application/pdf uploads are supported",
                                Response.Status.BAD_REQUEST));

        WebApplicationException ex =
                assertThrows(
                        WebApplicationException.class,
                        () -> controller.pdfCommentAgent(notPdf, "whatever"));
        assertEquals(400, ex.getResponse().getStatus());

        verify(orchestrator).applyComments(any(MultipartFile.class), eq("whatever"));
    }

    @Test
    void rejectsMissingFileInput() throws Exception {
        // A missing @RestForm FileUpload binds as null; the controller dereferences it before
        // reaching the orchestrator, so it fails fast and never invokes applyComments.
        assertThrows(NullPointerException.class, () -> controller.pdfCommentAgent(null, "test"));

        verify(orchestrator, never()).applyComments(any(), any());
    }

    @Test
    void rejectsMissingPromptParameter() throws Exception {
        // Prompt validation now lives in the orchestrator (throws 400 "Prompt is required").
        FileUpload pdfFile =
                TestFileUploads.of("%PDF-1.4\n%%EOF".getBytes(), "input.pdf", "application/pdf");
        when(orchestrator.applyComments(any(MultipartFile.class), eq(null)))
                .thenThrow(
                        new WebApplicationException(
                                "Prompt is required", Response.Status.BAD_REQUEST));

        WebApplicationException ex =
                assertThrows(
                        WebApplicationException.class,
                        () -> controller.pdfCommentAgent(pdfFile, null));
        assertEquals(400, ex.getResponse().getStatus());
    }
}
