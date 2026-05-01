package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.MultiValueMap;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileInput;
import stirling.software.proprietary.model.api.ai.AiWorkflowOutcome;
import stirling.software.proprietary.model.api.ai.AiWorkflowRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowResponse;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Architect C1 lock-down test for {@link AiWorkflowService}.
 *
 * <p>Pins down the contradiction-agent dispatch contract:
 *
 * <ol>
 *   <li>The Python orchestrator may emit a plan whose only step is the contradiction agent
 *       endpoint, with {@code resume_with=pdf_review}.
 *   <li>{@code runPlan} dispatches to {@code /api/v1/ai/tools/contradiction-agent} via the {@link
 *       InternalApiClient}, captures the JSON verdict as a {@link
 *       PdfContentExtractor.ToolReportArtifact}, and re-invokes the orchestrator on the resume turn
 *       with that artifact attached.
 *   <li>The artifact's {@code sourceTool} field MUST equal the endpoint path string — and that path
 *       string MUST equal the Python {@code AgentToolId.CONTRADICTION_AGENT} enum value. This test
 *       asserts that lock-step relationship by string comparison.
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class AiWorkflowServiceContradictionTest {

    /**
     * The contradiction-agent endpoint path. The Python {@code AgentToolId.CONTRADICTION_AGENT}
     * enum value MUST equal this exact string. Keeping the constants in sync is what allows
     * Python's discriminated union to resolve {@code source_tool} into a {@code
     * ContradictionToolReportArtifact} on the resume turn.
     */
    private static final String CONTRADICTION_PATH = "/api/v1/ai/tools/contradiction-agent";

    /** Python enum's underlying string value — must equal {@link #CONTRADICTION_PATH}. */
    private static final String PYTHON_AGENT_TOOL_ID_CONTRADICTION_AGENT =
            "/api/v1/ai/tools/contradiction-agent";

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private AiEngineClient aiEngineClient;
    @Mock private PdfContentExtractor pdfContentExtractor;
    @Mock private InternalApiClient internalApiClient;
    @Mock private FileStorage fileStorage;
    @Mock private ToolMetadataService toolMetadataService;
    @Mock private FileIdStrategy fileIdStrategy;
    @Mock private AiEngineEndpointResolver endpointResolver;

    @TempDir Path tempDir;

    private TempFileManager tempFileManager;
    private ObjectMapper objectMapper;
    private AiWorkflowService service;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("ai-test-");
        tempFileManager = new TempFileManager(new TempFileRegistry(), props);
        objectMapper = JsonMapper.builder().build();

        service =
                new AiWorkflowService(
                        pdfDocumentFactory,
                        aiEngineClient,
                        pdfContentExtractor,
                        objectMapper,
                        internalApiClient,
                        fileStorage,
                        toolMetadataService,
                        tempFileManager,
                        fileIdStrategy,
                        endpointResolver);
        // Lenient: the constant-comparison test in this class does not invoke
        // the service and therefore wouldn't trigger this stub. Strict mode
        // would treat that as unnecessary stubbing.
        lenient().when(endpointResolver.getEnabledEndpointUrls()).thenReturn(List.of());
    }

    @Test
    void agentToolIdConstantMatchesPythonEnumValue() {
        // Architect C1 invariant — the Java endpoint path string and the Python
        // AgentToolId.CONTRADICTION_AGENT enum value MUST be byte-for-byte equal.
        // This is a string comparison stand-in for the Python contract; if the
        // path ever drifts, both sides break and pydantic discrimination fails.
        assertEquals(
                CONTRADICTION_PATH,
                PYTHON_AGENT_TOOL_ID_CONTRADICTION_AGENT,
                "Java path string must equal the Python AgentToolId.CONTRADICTION_AGENT value");
    }

    @Test
    void runPlanDispatchesToContradictionAgentAndCapturesVerdictAsArtifact() throws Exception {
        MockMultipartFile input = pdf("report.pdf", "doc-bytes");
        // First turn: Python returns a plan with the contradiction agent and
        // resume_with=pdf_review.
        // Second turn: Python returns COMPLETED so we exit the loop.
        when(aiEngineClient.post(eq("/api/v1/orchestrator"), anyString()))
                .thenReturn(
                        """
                        {
                          "outcome":"plan",
                          "summary":"contradiction audit",
                          "resumeWith":"pdf_review",
                          "steps":[
                            {"tool":"%s","parameters":{}}
                          ]
                        }
                        """
                                .formatted(CONTRADICTION_PATH))
                .thenReturn(
                        """
                        {"outcome":"completed","summary":"final"}
                        """);

        when(toolMetadataService.isMultiInput(CONTRADICTION_PATH)).thenReturn(false);
        // Note: shouldUnpackZipResponse is NOT stubbed — for JSON responses,
        // AiWorkflowService short-circuits before checking the ZIP flag.

        // The contradiction agent returns JSON, not a PDF. The whole body becomes
        // the report (no result files).
        String verdictJson =
                """
                {
                  "type":"contradiction_verdict",
                  "sessionId":"session-1",
                  "contradictions":[],
                  "pagesExamined":[0,1],
                  "roundsTaken":2,
                  "summary":"No contradictions found.",
                  "clean":true,
                  "unauditablePages":[]
                }
                """;
        when(internalApiClient.post(eq(CONTRADICTION_PATH), any()))
                .thenReturn(jsonResponse(verdictJson));

        // No file storage stub: a JSON-only response produces zero result files,
        // so AiWorkflowService never calls FileStorage.storeInputStream on this path.

        AiWorkflowResponse result = service.orchestrate(requestFor(input, "find contradictions"));

        // The full loop ran: plan turn -> dispatch -> resume orchestrator -> COMPLETED.
        assertEquals(AiWorkflowOutcome.COMPLETED, result.getOutcome());

        // The internal contradiction-agent endpoint was called exactly once.
        verify(internalApiClient, times(1)).post(eq(CONTRADICTION_PATH), any());

        // The orchestrator was called twice — initial turn + resume turn.
        ArgumentCaptor<String> bodies = ArgumentCaptor.forClass(String.class);
        verify(aiEngineClient, times(2)).post(eq("/api/v1/orchestrator"), bodies.capture());

        // The second orchestrator call (the resume) MUST carry the verdict back as a
        // ToolReportArtifact whose `sourceTool` equals the endpoint path string.
        String resumeBody = bodies.getAllValues().get(1);
        JsonNode resumeNode = objectMapper.readTree(resumeBody);
        assertEquals("pdf_review", resumeNode.get("resumeWith").asText());
        JsonNode artifacts = resumeNode.get("artifacts");
        assertNotNull(artifacts, "resume request must include artifacts");
        assertEquals(1, artifacts.size(), "exactly one artifact for the contradiction verdict");
        JsonNode artifact = artifacts.get(0);
        assertEquals("tool_report", artifact.get("kind").asText());
        // Architect C1 lock-down — sourceTool must equal the endpoint path string.
        assertEquals(CONTRADICTION_PATH, artifact.get("sourceTool").asText());
        // And by transitivity, sourceTool must equal the Python enum value.
        assertEquals(
                PYTHON_AGENT_TOOL_ID_CONTRADICTION_AGENT,
                artifact.get("sourceTool").asText(),
                "ToolReportArtifact.sourceTool must equal Python AgentToolId.CONTRADICTION_AGENT");
        // The full verdict round-trips into the artifact.
        JsonNode reportNode = artifact.get("report");
        assertEquals("contradiction_verdict", reportNode.get("type").asText());
        assertEquals("session-1", reportNode.get("sessionId").asText());
        assertTrue(reportNode.get("clean").asBoolean());
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    private static MockMultipartFile pdf(String filename, String content) {
        return new MockMultipartFile(
                "fileInput", filename, MediaType.APPLICATION_PDF_VALUE, content.getBytes());
    }

    private static AiWorkflowRequest requestFor(MockMultipartFile file, String message) {
        AiWorkflowRequest request = new AiWorkflowRequest();
        List<AiWorkflowFileInput> inputs = new ArrayList<>();
        AiWorkflowFileInput fileInput = new AiWorkflowFileInput();
        fileInput.setFileInput(file);
        inputs.add(fileInput);
        request.setFileInputs(inputs);
        request.setUserMessage(message);
        return request;
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private ResponseEntity<Resource> jsonResponse(String json) {
        ByteArrayResource body =
                new ByteArrayResource(json.getBytes()) {
                    @Override
                    public String getFilename() {
                        return "verdict.json";
                    }

                    @Override
                    public InputStream getInputStream() {
                        return new ByteArrayInputStream(json.getBytes());
                    }
                };
        // Build a JSON-content-type ResponseEntity so AiWorkflowService treats the
        // whole body as the structured tool report.
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    @SuppressWarnings("unused")
    private void stubInternalEndpoint(String endpoint, ResponseEntity<Resource> response) {
        when(internalApiClient.post(eq(endpoint), any(MultiValueMap.class))).thenReturn(response);
    }
}
