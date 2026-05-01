package stirling.software.proprietary.controller.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.annotation.ResponseStatusExceptionResolver;
import org.springframework.web.servlet.mvc.support.DefaultHandlerExceptionResolver;

import stirling.software.proprietary.model.api.ai.contradiction.Claim;
import stirling.software.proprietary.model.api.ai.contradiction.ClaimPolarity;
import stirling.software.proprietary.model.api.ai.contradiction.Contradiction;
import stirling.software.proprietary.model.api.ai.contradiction.ContradictionSeverity;
import stirling.software.proprietary.model.api.ai.contradiction.ContradictionVerdict;
import stirling.software.proprietary.service.ContradictionAgentOrchestrator;

/**
 * Controller tests for {@link ContradictionAgentController}. The orchestrator is mocked so the test
 * never hits the engine or real filesystem; we verify HTTP wiring, file validation, and JSON
 * serialisation only.
 */
@ExtendWith(MockitoExtension.class)
class ContradictionAgentControllerTest {

    @Mock private ContradictionAgentOrchestrator orchestrator;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ContradictionAgentController controller = new ContradictionAgentController(orchestrator);
        mockMvc =
                MockMvcBuilders.standaloneSetup(controller)
                        // standaloneSetup's defaults don't handle ResponseStatusException; wire up
                        // both the ResponseStatusException resolver (for validator 400s) and
                        // DefaultHandlerExceptionResolver (so missing @RequestParam still 400s).
                        .setHandlerExceptionResolvers(
                                new ResponseStatusExceptionResolver(),
                                new DefaultHandlerExceptionResolver())
                        .build();
    }

    @Test
    void acceptsValidPdfAndReturnsVerdictJson() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput",
                        "input.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "%PDF-1.4\n%%EOF".getBytes());

        Claim claim1 =
                new Claim(
                        0,
                        "page 1 says Friday",
                        "deadline",
                        ClaimPolarity.ASSERT,
                        "deadline is Friday");
        Claim claim2 =
                new Claim(
                        2,
                        "page 3 says next month",
                        "deadline",
                        ClaimPolarity.DENY,
                        "moved to next month");
        Contradiction contradiction =
                new Contradiction(
                        "deadline",
                        claim1,
                        claim2,
                        "page 1 says Friday, page 3 says next month",
                        ContradictionSeverity.ERROR);
        ContradictionVerdict verdict =
                new ContradictionVerdict(
                        "contradiction_verdict",
                        "session-1",
                        List.of(contradiction),
                        List.of(0, 2),
                        2,
                        "Found 1 contradiction.",
                        false,
                        List.of());
        when(orchestrator.audit(any(MultipartFile.class))).thenReturn(verdict);

        mockMvc.perform(multipart("/api/v1/ai/tools/contradiction-agent").file(pdfFile))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.sessionId").value("session-1"))
                .andExpect(jsonPath("$.contradictions[0].severity").value("error"))
                .andExpect(jsonPath("$.contradictions[0].claim1.page").value(0))
                .andExpect(jsonPath("$.contradictions[0].claim2.page").value(2))
                .andExpect(jsonPath("$.clean").value(false));

        verify(orchestrator).audit(any(MultipartFile.class));
    }

    @Test
    void rejectsMissingFileInput() throws Exception {
        mockMvc.perform(multipart("/api/v1/ai/tools/contradiction-agent"))
                .andExpect(status().is4xxClientError());

        verify(orchestrator, never()).audit(any());
    }

    @Test
    void rejectsNonPdfUploadViaValidator() throws Exception {
        MockMultipartFile notPdf =
                new MockMultipartFile(
                        "fileInput", "input.txt", MediaType.TEXT_PLAIN_VALUE, "hello".getBytes());

        // The controller calls AiToolInputValidator.validatePdfUpload before it ever
        // reaches the orchestrator; a non-PDF must therefore 400 without invoking the
        // orchestrator at all.
        mockMvc.perform(multipart("/api/v1/ai/tools/contradiction-agent").file(notPdf))
                .andExpect(status().isBadRequest());

        verify(orchestrator, never()).audit(any());
    }

    @Test
    void rejectsEmptyFileInputViaValidator() throws Exception {
        // Empty content triggers the validator's "fileInput is required" branch before
        // anything else.
        MockMultipartFile emptyPdf =
                new MockMultipartFile(
                        "fileInput", "empty.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[0]);

        mockMvc.perform(multipart("/api/v1/ai/tools/contradiction-agent").file(emptyPdf))
                .andExpect(status().isBadRequest());

        verify(orchestrator, never()).audit(any());
    }

    @Test
    void returns500WhenOrchestratorThrowsIOException() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput",
                        "input.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "%PDF-1.4\n%%EOF".getBytes());
        when(orchestrator.audit(any(MultipartFile.class)))
                .thenThrow(new IOException("engine offline"));

        mockMvc.perform(multipart("/api/v1/ai/tools/contradiction-agent").file(pdfFile))
                .andExpect(status().isInternalServerError());

        verify(orchestrator).audit(any(MultipartFile.class));
    }
}
