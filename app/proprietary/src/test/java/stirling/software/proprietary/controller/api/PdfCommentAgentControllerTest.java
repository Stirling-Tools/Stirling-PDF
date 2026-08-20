package stirling.software.proprietary.controller.api;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
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
import stirling.software.proprietary.service.AiFeatureGate;
import stirling.software.proprietary.service.PdfCommentAgentOrchestrator;
import stirling.software.proprietary.service.PdfCommentAgentOrchestrator.AnnotatedPdf;

import tools.jackson.databind.json.JsonMapper;

/**
 * Controller tests for {@link PdfCommentAgentController}. The orchestrator is mocked so the test
 * never hits the engine or real filesystem, and the JAX-RS handler is called directly with a {@link
 * TestFileUploads} stub for the upload.
 *
 * <p>The controller lets validation failures propagate as {@link WebApplicationException}, so the
 * error-path tests assert the thrown status. Missing form params are covered the same way: a
 * missing file binds as {@code null} and the controller fails fast before reaching the
 * orchestrator, while a missing prompt is rejected by the orchestrator with 400.
 */
@ExtendWith(MockitoExtension.class)
class PdfCommentAgentControllerTest {

    @Mock private PdfCommentAgentOrchestrator orchestrator;
    @Mock private AiFeatureGate aiFeatureGate;

    private PdfCommentAgentController controller;

    @BeforeEach
    void setUp() {
        controller = new PdfCommentAgentController();
        controller.orchestrator = orchestrator;
        controller.objectMapper = JsonMapper.builder().build();
        controller.aiFeatureGate = aiFeatureGate;
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
    void returnsServiceUnavailableWhenPdfCommentFeatureDisabled() throws Exception {
        // The gate runs before any upload handling, so its 503 leaves the orchestrator untouched.
        doThrow(new WebApplicationException(Response.Status.SERVICE_UNAVAILABLE))
                .when(aiFeatureGate)
                .requirePdfComment();
        FileUpload pdfFile =
                TestFileUploads.of("%PDF-1.4\n%%EOF".getBytes(), "input.pdf", "application/pdf");

        WebApplicationException ex =
                assertThrows(
                        WebApplicationException.class,
                        () -> controller.pdfCommentAgent(pdfFile, "flag dates"));
        assertEquals(503, ex.getResponse().getStatus());

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
