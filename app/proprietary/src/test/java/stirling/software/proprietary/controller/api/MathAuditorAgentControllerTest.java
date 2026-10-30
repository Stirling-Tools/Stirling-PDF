package stirling.software.proprietary.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.proprietary.service.AiFeatureGate;
import stirling.software.proprietary.service.MathAuditorOrchestrator;

class MathAuditorAgentControllerTest {

    private MathAuditorOrchestrator orchestrator;
    private MathAuditorAgentController controller;
    private final MockMultipartFile pdf =
            new MockMultipartFile(
                    "fileInput", "a.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[] {1});

    @BeforeEach
    void setUp() {
        orchestrator = mock(MathAuditorOrchestrator.class);
        controller = new MathAuditorAgentController(orchestrator, mock(AiFeatureGate.class));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "-0.01",
                "+0.01",
                "1E+500000000",
                "1E-500000000",
                "0E+500000000",
                "1E+2147483648",
                "0.01 ",
                ""
            })
    void rejectsNegativeOrExtremeTolerance(String tolerance) throws Exception {
        var response = controller.mathAuditorAgent(pdf, tolerance);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verify(orchestrator, never()).audit(any(), any());
    }

    @Test
    void rejectsToleranceWithExcessiveDigits() throws Exception {
        var response = controller.mathAuditorAgent(pdf, "1".repeat(1_000_000));

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verify(orchestrator, never()).audit(any(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "0.01", "0.000001", "1000", ".5", "5."})
    void acceptsOrdinaryTolerance(String tolerance) throws Exception {
        var response = controller.mathAuditorAgent(pdf, tolerance);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(orchestrator).audit(any(), any());
    }
}
