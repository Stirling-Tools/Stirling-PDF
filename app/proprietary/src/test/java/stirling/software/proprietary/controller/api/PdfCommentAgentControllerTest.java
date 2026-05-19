package stirling.software.proprietary.controller.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.annotation.ResponseStatusExceptionResolver;
import org.springframework.web.servlet.mvc.support.DefaultHandlerExceptionResolver;

import stirling.software.proprietary.service.PdfCommentAgentOrchestrator;
import stirling.software.proprietary.service.PdfCommentAgentOrchestrator.AnnotatedPdf;

import tools.jackson.databind.json.JsonMapper;

/**
 * Controller tests for {@link PdfCommentAgentController}. The orchestrator is mocked so the test
 * never hits the engine or real filesystem.
 */
@ExtendWith(MockitoExtension.class)
class PdfCommentAgentControllerTest {

    @Mock private PdfCommentAgentOrchestrator orchestrator;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        PdfCommentAgentController controller =
                new PdfCommentAgentController(orchestrator, JsonMapper.builder().build());
        mockMvc =
                MockMvcBuilders.standaloneSetup(controller)
                        // standaloneSetup's defaults don't handle ResponseStatusException; wire up
                        // both the ResponseStatusException resolver (for orchestrator 400s) and
                        // DefaultHandlerExceptionResolver (so missing @RequestParam still 400s).
                        .setHandlerExceptionResolvers(
                                new ResponseStatusExceptionResolver(),
                                new DefaultHandlerExceptionResolver())
                        .build();
    }

    @Test
    void acceptsValidPdfAndReturnsAnnotatedBytes() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput",
                        "input.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "%PDF-1.4\n%%EOF".getBytes());

        byte[] annotatedBytes = "%PDF-1.4\n<annotated>\n%%EOF".getBytes();
        AnnotatedPdf stub = new AnnotatedPdf(annotatedBytes, "input-commented.pdf", 2, 2, "ok");
        when(orchestrator.applyComments(any(MultipartFile.class), eq("flag dates")))
                .thenReturn(stub);

        mockMvc.perform(
                        multipart("/api/v1/ai/tools/pdf-comment-agent")
                                .file(pdfFile)
                                .param("prompt", "flag dates"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(
                        header().string(
                                        "Content-Disposition",
                                        org.hamcrest.Matchers.containsString(
                                                "input-commented.pdf")))
                .andExpect(content().bytes(annotatedBytes));

        verify(orchestrator).applyComments(any(MultipartFile.class), eq("flag dates"));
    }

    @Test
    void propagatesOrchestratorBadRequestForNonPdfUpload() throws Exception {
        // The controller delegates validation to the orchestrator; a ResponseStatusException
        // thrown by the orchestrator should propagate to Spring as a 400.
        MockMultipartFile notPdf =
                new MockMultipartFile(
                        "fileInput", "input.txt", MediaType.TEXT_PLAIN_VALUE, "hello".getBytes());
        when(orchestrator.applyComments(any(MultipartFile.class), eq("whatever")))
                .thenThrow(
                        new ResponseStatusException(
                                HttpStatus.BAD_REQUEST,
                                "Only application/pdf uploads are supported"));

        mockMvc.perform(
                        multipart("/api/v1/ai/tools/pdf-comment-agent")
                                .file(notPdf)
                                .param("prompt", "whatever"))
                .andExpect(status().isBadRequest());

        verify(orchestrator).applyComments(any(MultipartFile.class), eq("whatever"));
    }

    @Test
    void rejectsMissingFileInput() throws Exception {
        mockMvc.perform(multipart("/api/v1/ai/tools/pdf-comment-agent").param("prompt", "test"))
                .andExpect(status().is4xxClientError());

        verify(orchestrator, never()).applyComments(any(), anyString());
    }

    @Test
    void rejectsMissingPromptParameter() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput",
                        "input.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "%PDF-1.4\n%%EOF".getBytes());

        mockMvc.perform(multipart("/api/v1/ai/tools/pdf-comment-agent").file(pdfFile))
                .andExpect(status().is4xxClientError());

        verify(orchestrator, never()).applyComments(any(), anyString());
    }
}
