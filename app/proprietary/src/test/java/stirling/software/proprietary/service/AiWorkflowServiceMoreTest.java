package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.multipart.MultipartFile;

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
import stirling.software.proprietary.policy.engine.PolicyExecutor;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Gap-coverage tests for {@link AiWorkflowService}: terminal outcomes, guard rails (empty/unknown
 * files, retry loops), stream-event handling, downstream entitlement (PAYG) mapping, and HTTP error
 * detail extraction. Complements {@code AiWorkflowServiceTest}.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AiWorkflowService (gaps)")
class AiWorkflowServiceMoreTest {

    private static final String ROTATE_ENDPOINT = "/api/v1/general/rotate-pdf";
    private static final String ORCHESTRATOR = "/api/v1/orchestrator";

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private AiEngineClient aiEngineClient;
    @Mock private PdfContentExtractor pdfContentExtractor;
    @Mock private InternalApiClient internalApiClient;
    @Mock private FileStorage fileStorage;
    @Mock private ToolMetadataService toolMetadataService;
    @Mock private FileIdStrategy fileIdStrategy;
    @Mock private AiEngineEndpointResolver endpointResolver;

    @TempDir Path tempDir;

    private ObjectMapper objectMapper;
    private AiWorkflowService service;

    @BeforeEach
    void setUp() throws IOException {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("ai-more-");
        TempFileManager tempFileManager = new TempFileManager(new TempFileRegistry(), props);
        objectMapper = JsonMapper.builder().build();

        lenient()
                .when(fileIdStrategy.idFor(any(MultipartFile.class)))
                .thenAnswer(inv -> ((MultipartFile) inv.getArgument(0)).getOriginalFilename());
        lenient().when(endpointResolver.getEnabledEndpointUrls()).thenReturn(List.of());

        PolicyExecutor policyExecutor =
                new PolicyExecutor(
                        internalApiClient, toolMetadataService, tempFileManager, objectMapper);
        service =
                new AiWorkflowService(
                        pdfDocumentFactory,
                        aiEngineClient,
                        pdfContentExtractor,
                        objectMapper,
                        fileStorage,
                        tempFileManager,
                        fileIdStrategy,
                        endpointResolver,
                        policyExecutor,
                        null,
                        new ApplicationProperties());
    }

    @Nested
    @DisplayName("request validation")
    class Validation {

        @Test
        @DisplayName("throws when an uploaded file is empty")
        void emptyFileThrows() {
            MockMultipartFile empty =
                    new MockMultipartFile("fileInput", "empty.pdf", "application/pdf", new byte[0]);
            assertThatThrownBy(() -> service.orchestrate(requestFor(empty, "do it")))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("terminal outcomes pass straight through")
    class TerminalOutcomes {

        @Test
        @DisplayName("ANSWER returns the engine response unchanged")
        void answerOutcome() throws IOException {
            stubOrchestrator("{\"outcome\":\"answer\",\"answer\":\"42\"}");
            AiWorkflowResponse result =
                    service.orchestrate(requestFor(pdf("a.pdf", "x"), "question"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.ANSWER);
            assertThat(result.getAnswer()).isEqualTo("42");
        }

        @Test
        @DisplayName("NEED_CLARIFICATION is terminal")
        void needClarificationOutcome() throws IOException {
            stubOrchestrator("{\"outcome\":\"need_clarification\",\"question\":\"which page?\"}");
            AiWorkflowResponse result = service.orchestrate(requestFor(pdf("a.pdf", "x"), "vague"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.NEED_CLARIFICATION);
        }

        @Test
        @DisplayName("CANNOT_DO is terminal")
        void cannotDoOutcome() throws IOException {
            stubOrchestrator("{\"outcome\":\"cannot_do\",\"reason\":\"no\"}");
            AiWorkflowResponse result =
                    service.orchestrate(requestFor(pdf("a.pdf", "x"), "impossible"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.CANNOT_DO);
        }

        @Test
        @DisplayName("NOT_FOUND is terminal")
        void notFoundOutcome() throws IOException {
            stubOrchestrator("{\"outcome\":\"not_found\"}");
            AiWorkflowResponse result =
                    service.orchestrate(requestFor(pdf("a.pdf", "x"), "missing"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.NOT_FOUND);
        }
    }

    @Nested
    @DisplayName("generate_file guards")
    class GenerateFileGuards {

        @Test
        @DisplayName("missing content/filename falls back to CANNOT_CONTINUE")
        void missingContent() throws IOException {
            stubOrchestrator("{\"outcome\":\"generate_file\",\"summary\":\"s\"}");
            AiWorkflowResponse result = service.orchestrate(requestFor(pdf("a.pdf", "x"), "gen"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.CANNOT_CONTINUE);
            verify(internalApiClient, never()).post(anyString(), any());
        }
    }

    @Nested
    @DisplayName("need_content guards")
    class NeedContentGuards {

        @Test
        @DisplayName("unknown requested file id surfaces a clear CANNOT_CONTINUE")
        void unknownFileId() throws IOException {
            stubOrchestrator(
                    """
                    {"outcome":"need_content","files":[{"file":{"id":"ghost","name":"ghost.pdf"}}]}
                    """);
            AiWorkflowResponse result =
                    service.orchestrate(requestFor(pdf("real.pdf", "x"), "extract"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.CANNOT_CONTINUE);
            assertThat(result.getReason()).contains("ghost.pdf");
        }
    }

    @Nested
    @DisplayName("need_ingest guards")
    class NeedIngestGuards {

        @Test
        @DisplayName("empty filesToIngest yields CANNOT_CONTINUE")
        void emptyIngestList() throws IOException {
            stubOrchestrator("{\"outcome\":\"need_ingest\",\"reason\":\"r\",\"filesToIngest\":[]}");
            AiWorkflowResponse result =
                    service.orchestrate(requestFor(pdf("a.pdf", "x"), "ingest"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.CANNOT_CONTINUE);
        }

        @Test
        @DisplayName("ingest for an unknown file id yields CANNOT_CONTINUE")
        void unknownIngestFile() throws IOException {
            stubOrchestrator(
                    """
                    {"outcome":"need_ingest","resumeWith":"q",
                     "filesToIngest":[{"id":"nope","name":"nope.pdf"}]}
                    """);
            AiWorkflowResponse result =
                    service.orchestrate(requestFor(pdf("a.pdf", "x"), "ingest"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.CANNOT_CONTINUE);
            assertThat(result.getReason()).contains("nope.pdf");
        }
    }

    @Nested
    @DisplayName("convert_markdown guards")
    class ConvertMarkdownGuards {

        @Test
        @DisplayName("no files listed yields CANNOT_CONTINUE")
        void noFiles() throws IOException {
            stubOrchestrator("{\"outcome\":\"convert_markdown\",\"filesToIngest\":[]}");
            AiWorkflowResponse result = service.orchestrate(requestFor(pdf("a.pdf", "x"), "to md"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.CANNOT_CONTINUE);
        }

        @Test
        @DisplayName("unknown file id yields CANNOT_CONTINUE")
        void unknownFile() throws IOException {
            when(fileIdStrategy.idFor(any())).thenReturn("real-id");
            stubOrchestrator(
                    """
                    {"outcome":"convert_markdown",
                     "filesToIngest":[{"id":"other-id","name":"other.pdf"}]}
                    """);
            AiWorkflowResponse result =
                    service.orchestrate(requestFor(pdf("real.pdf", "x"), "to md"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.CANNOT_CONTINUE);
            assertThat(result.getReason()).contains("other.pdf");
        }
    }

    @Nested
    @DisplayName("plan guards and errors")
    class PlanGuardsAndErrors {

        @Test
        @DisplayName("empty steps list yields CANNOT_CONTINUE")
        void emptySteps() throws IOException {
            stubOrchestrator("{\"outcome\":\"plan\",\"summary\":\"s\",\"steps\":[]}");
            AiWorkflowResponse result = service.orchestrate(requestFor(pdf("a.pdf", "x"), "plan"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.CANNOT_CONTINUE);
        }

        @Test
        @DisplayName("a step with no tool endpoint yields CANNOT_CONTINUE")
        void stepWithoutTool() throws IOException {
            stubOrchestrator(
                    "{\"outcome\":\"plan\",\"summary\":\"s\",\"steps\":[{\"parameters\":{}}]}");
            AiWorkflowResponse result = service.orchestrate(requestFor(pdf("a.pdf", "x"), "plan"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.CANNOT_CONTINUE);
            assertThat(result.getReason()).contains("step 1");
        }

        @Test
        @DisplayName("HttpServerErrorException detail is surfaced from the JSON body")
        void httpServerErrorDetailSurfaced() throws IOException {
            stubOrchestrator(
                    """
                    {"outcome":"plan","summary":"s",
                     "steps":[{"tool":"%s","parameters":{}}]}
                    """
                            .formatted(ROTATE_ENDPOINT));
            when(toolMetadataService.isMultiInput(ROTATE_ENDPOINT)).thenReturn(false);
            HttpServerErrorException boom =
                    HttpServerErrorException.create(
                            HttpStatus.INTERNAL_SERVER_ERROR,
                            "err",
                            org.springframework.http.HttpHeaders.EMPTY,
                            "{\"detail\":\"Ghostscript is not installed\"}"
                                    .getBytes(StandardCharsets.UTF_8),
                            StandardCharsets.UTF_8);
            when(internalApiClient.post(eq(ROTATE_ENDPOINT), any())).thenThrow(boom);

            AiWorkflowResponse result = service.orchestrate(requestFor(pdf("a.pdf", "x"), "plan"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.CANNOT_CONTINUE);
            assertThat(result.getReason()).isEqualTo("Ghostscript is not installed");
        }
    }

    @Nested
    @DisplayName("downstream entitlement (PAYG) mapping")
    class PaygMapping {

        @Test
        @DisplayName("a 402 PAYG_LIMIT_REACHED tool error becomes a structured CANNOT_CONTINUE")
        void paygLimitMappedFromToolCall() throws IOException {
            stubOrchestrator(
                    """
                    {"outcome":"tool_call","tool":"%s","parameters":{},"rationale":"r"}
                    """
                            .formatted(ROTATE_ENDPOINT));
            when(toolMetadataService.isMultiInput(ROTATE_ENDPOINT)).thenReturn(false);
            HttpClientErrorException payg =
                    HttpClientErrorException.create(
                            HttpStatus.PAYMENT_REQUIRED,
                            "Payment Required",
                            org.springframework.http.HttpHeaders.EMPTY,
                            "{\"error\":\"PAYG_LIMIT_REACHED\",\"subscribed\":false}"
                                    .getBytes(StandardCharsets.UTF_8),
                            StandardCharsets.UTF_8);
            when(internalApiClient.post(eq(ROTATE_ENDPOINT), any())).thenThrow(payg);

            AiWorkflowResponse result =
                    service.orchestrate(requestFor(pdf("a.pdf", "x"), "rotate"));

            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.CANNOT_CONTINUE);
            assertThat(result.getErrorCode()).isEqualTo("PAYG_LIMIT_REACHED");
            assertThat(result.getErrorSubscribed()).isFalse();
        }
    }

    @Nested
    @DisplayName("orchestrator stream handling")
    class StreamHandling {

        @Test
        @DisplayName("an error event surfaces as an IOException")
        void errorEventThrows() throws IOException {
            doAnswer(
                            inv -> {
                                Consumer<String> consumer = inv.getArgument(3);
                                consumer.accept(
                                        "{\"event\":\"error\",\"message\":\"engine exploded\"}");
                                return null;
                            })
                    .when(aiEngineClient)
                    .streamPost(eq(ORCHESTRATOR), anyString(), nullable(String.class), any());

            assertThatThrownBy(() -> service.orchestrate(requestFor(pdf("a.pdf", "x"), "go")))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("engine exploded");
        }

        @Test
        @DisplayName("a stream that ends without a result throws an IOException")
        void noResultThrows() throws IOException {
            doAnswer(inv -> null)
                    .when(aiEngineClient)
                    .streamPost(eq(ORCHESTRATOR), anyString(), nullable(String.class), any());

            assertThatThrownBy(() -> service.orchestrate(requestFor(pdf("a.pdf", "x"), "go")))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("without a result");
        }

        @Test
        @DisplayName("progress and heartbeat events are forwarded then the result is returned")
        void progressAndHeartbeatForwarded() throws IOException {
            List<String> phases = new ArrayList<>();
            int[] heartbeats = {0};
            doAnswer(
                            inv -> {
                                Consumer<String> consumer = inv.getArgument(3);
                                consumer.accept(
                                        "{\"event\":\"progress\",\"phase\":\"whole_doc_read_started\","
                                                + "\"question\":\"q\",\"pages\":3,\"slices\":1}");
                                consumer.accept("{\"event\":\"heartbeat\"}");
                                consumer.accept("{\"event\":\"mystery\"}");
                                consumer.accept(
                                        wrapAsResultEvent(
                                                "{\"outcome\":\"answer\",\"answer\":\"ok\"}"));
                                return null;
                            })
                    .when(aiEngineClient)
                    .streamPost(eq(ORCHESTRATOR), anyString(), nullable(String.class), any());

            AiWorkflowService.ProgressListener listener =
                    new AiWorkflowService.ProgressListener() {
                        @Override
                        public void onProgress(
                                stirling.software.proprietary.model.api.ai.AiWorkflowProgressEvent
                                        event) {
                            phases.add(String.valueOf(event.getPhase()));
                        }

                        @Override
                        public void onHeartbeat() {
                            heartbeats[0]++;
                        }
                    };

            AiWorkflowResponse result =
                    service.orchestrate(requestFor(pdf("a.pdf", "x"), "go"), listener);

            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.ANSWER);
            assertThat(heartbeats[0]).isEqualTo(1);
            assertThat(phases).isNotEmpty();
        }

        @Test
        @DisplayName("a malformed (non-JSON) stream line is skipped without aborting")
        void malformedLineSkipped() throws IOException {
            doAnswer(
                            inv -> {
                                Consumer<String> consumer = inv.getArgument(3);
                                consumer.accept("this is not json {");
                                consumer.accept(
                                        wrapAsResultEvent(
                                                "{\"outcome\":\"answer\",\"answer\":\"ok\"}"));
                                return null;
                            })
                    .when(aiEngineClient)
                    .streamPost(eq(ORCHESTRATOR), anyString(), nullable(String.class), any());

            AiWorkflowResponse result = service.orchestrate(requestFor(pdf("a.pdf", "x"), "go"));
            assertThat(result.getOutcome()).isEqualTo(AiWorkflowOutcome.ANSWER);
        }
    }

    // --- helpers (mirrors AiWorkflowServiceTest) ---

    private void stubOrchestrator(String responseJson) throws IOException {
        doAnswer(
                        inv -> {
                            Consumer<String> consumer = inv.getArgument(3);
                            consumer.accept(wrapAsResultEvent(responseJson));
                            return null;
                        })
                .when(aiEngineClient)
                .streamPost(eq(ORCHESTRATOR), anyString(), nullable(String.class), any());
    }

    private String wrapAsResultEvent(String responseJson) throws IOException {
        return objectMapper
                .createObjectNode()
                .put("event", "result")
                .set("response", objectMapper.readTree(responseJson))
                .toString();
    }

    private static MockMultipartFile pdf(String filename, String content) {
        return new MockMultipartFile("fileInput", filename, "application/pdf", content.getBytes());
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
}
