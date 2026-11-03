package stirling.software.proprietary.policy.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.AutomationRunContext;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.InternalApiTimeoutException;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.PipelineLimits;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link PolicyExecutor}, the shared pipeline step loop. Covers file chaining across
 * steps, multi-input vs per-file dispatch, ZIP unpacking, structured-list parameter encoding,
 * progress callbacks, and timeout propagation. External collaborators are mocked; {@link
 * TempFileManager} is real so ZIP extraction exercises real code.
 */
@ExtendWith(MockitoExtension.class)
class PolicyExecutorTest {

    private static final String ROTATE = "/api/v1/general/rotate-pdf";
    private static final String COMPRESS = "/api/v1/misc/compress-pdf";
    private static final String SPLIT = "/api/v1/general/split-pages";
    private static final String MERGE = "/api/v1/general/merge-pdfs";

    @Mock private InternalApiClient internalApiClient;
    @Mock private ToolMetadataService toolMetadataService;

    @TempDir Path tempDir;

    private final ApplicationProperties props = new ApplicationProperties();
    private TempFileManager tempFileManager;
    private PolicyExecutor executor;

    @BeforeEach
    void setUp() {
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("policy-test-");
        tempFileManager = new TempFileManager(new TempFileRegistry(), props);
        ObjectMapper objectMapper = JsonMapper.builder().build();
        executor =
                new PolicyExecutor(
                        internalApiClient,
                        toolMetadataService,
                        tempFileManager,
                        objectMapper,
                        props);
    }

    @Test
    void executesStepsSequentiallyChainingOutputToInput() throws IOException {
        when(toolMetadataService.isMultiInput(anyString())).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(anyString())).thenReturn(false);
        stubEndpoint(ROTATE, pdf("rotated", "rotated.pdf"));
        stubEndpoint(COMPRESS, pdf("compressed", "compressed.pdf"));

        List<Integer> steps = new ArrayList<>();
        PolicyProgressListener listener =
                new PolicyProgressListener() {
                    @Override
                    public void onStepStart(int stepIndex, int stepCount, String operation) {
                        steps.add(stepIndex);
                    }
                };

        PolicyExecutionResult result =
                executor.execute(
                        definition(
                                new PipelineStep(ROTATE, Map.of()),
                                new PipelineStep(COMPRESS, Map.of())),
                        PolicyInputs.of(List.of(pdf("input", "input.pdf"))),
                        listener);

        assertEquals(1, result.files().size());
        assertEquals("compressed.pdf", result.files().get(0).getFilename());
        verify(internalApiClient, times(1)).post(eq(ROTATE), any());
        verify(internalApiClient, times(1)).post(eq(COMPRESS), any());
        // Progress fired once per step, in order.
        assertEquals(List.of(1, 2), steps);
    }

    @Test
    void multiInputEndpointIsCalledOnceWithAllFiles() throws IOException {
        when(toolMetadataService.isMultiInput(MERGE)).thenReturn(true);
        when(toolMetadataService.shouldUnpackZipResponse(MERGE)).thenReturn(false);
        stubEndpoint(MERGE, pdf("merged", "merged.pdf"));

        PolicyExecutionResult result =
                executor.execute(
                        definition(new PipelineStep(MERGE, Map.of())),
                        PolicyInputs.of(List.of(pdf("a", "a.pdf"), pdf("b", "b.pdf"))),
                        PolicyProgressListener.NOOP);

        assertEquals(1, result.files().size());
        verify(internalApiClient, times(1)).post(eq(MERGE), any());
    }

    @Test
    void singleInputEndpointIsCalledOncePerFile() throws IOException {
        when(toolMetadataService.isMultiInput(ROTATE)).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(ROTATE)).thenReturn(false);
        stubEndpoint(ROTATE, pdf("rotated", "rotated.pdf"));

        PolicyExecutionResult result =
                executor.execute(
                        definition(new PipelineStep(ROTATE, Map.of())),
                        PolicyInputs.of(List.of(pdf("a", "a.pdf"), pdf("b", "b.pdf"))),
                        PolicyProgressListener.NOOP);

        assertEquals(2, result.files().size());
        verify(internalApiClient, times(2)).post(eq(ROTATE), any());
    }

    @Test
    void noInputGeneratorEndpointIsCalledOnceWithNoFile() throws IOException {
        // A "create" workflow has no source documents: a generator tool (e.g.
        // create-pdf-from-html-agent) produces its output purely from parameters. Per-file
        // dispatch would skip it entirely (zero files = zero calls), so it must still run once.
        String createPdf = "/api/v1/ai/tools/create-pdf-from-html-agent";
        when(toolMetadataService.isMultiInput(createPdf)).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(createPdf)).thenReturn(false);
        stubEndpoint(createPdf, pdf("generated", "purchase-order.pdf"));

        PolicyExecutionResult result =
                executor.execute(
                        definition(
                                new PipelineStep(
                                        createPdf,
                                        Map.of(
                                                "document",
                                                "{\"title\":\"PO\",\"sections\":[]}",
                                                "filename",
                                                "purchase-order.pdf"))),
                        PolicyInputs.of(List.of()),
                        PolicyProgressListener.NOOP);

        assertEquals(1, result.files().size());
        assertEquals("purchase-order.pdf", result.files().get(0).getFilename());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<MultiValueMap<String, Object>> bodyCaptor =
                ArgumentCaptor.forClass(MultiValueMap.class);
        verify(internalApiClient, times(1)).post(eq(createPdf), bodyCaptor.capture());
        // No document stream: the body carries only the generator's parameters, no fileInput.
        assertNull(bodyCaptor.getValue().get("fileInput"));
    }

    @Test
    void zipResponseIsUnpackedIntoIndividualFiles() throws IOException {
        when(toolMetadataService.isMultiInput(SPLIT)).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(SPLIT)).thenReturn(true);
        stubEndpoint(
                SPLIT,
                zip(
                        "doc.zip",
                        List.of(new Entry("page-1.pdf", "one"), new Entry("page-2.pdf", "two"))));

        PolicyExecutionResult result =
                executor.execute(
                        definition(new PipelineStep(SPLIT, Map.of())),
                        PolicyInputs.of(List.of(pdf("doc", "doc.pdf"))),
                        PolicyProgressListener.NOOP);

        assertEquals(2, result.files().size());
        assertEquals("page-1.pdf", result.files().get(0).getFilename());
        assertEquals("page-2.pdf", result.files().get(1).getFilename());
    }

    @Test
    void structuredListParameterIsJsonEncodedAsSingleField() throws IOException {
        String redact = "/api/v1/security/redact";
        when(toolMetadataService.isMultiInput(redact)).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(redact)).thenReturn(false);
        stubEndpoint(redact, pdf("edited", "edited.pdf"));

        // LinkedHashMap so the serialized key order is deterministic for the assertion below.
        Map<String, Object> redaction = new LinkedHashMap<>();
        redaction.put("page", 1);
        redaction.put("x", 10);
        redaction.put("y", 20);
        redaction.put("width", 100);
        redaction.put("height", 50);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("redactions", List.of(redaction));
        params.put("convertPDFToImage", false);

        executor.execute(
                definition(new PipelineStep(redact, params)),
                PolicyInputs.of(List.of(pdf("in", "in.pdf"))),
                PolicyProgressListener.NOOP);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<MultiValueMap<String, Object>> bodyCaptor =
                ArgumentCaptor.forClass(MultiValueMap.class);
        verify(internalApiClient).post(eq(redact), bodyCaptor.capture());
        MultiValueMap<String, Object> body = bodyCaptor.getValue();

        List<Object> redactions = body.get("redactions");
        assertNotNull(redactions);
        assertEquals(1, redactions.size());
        assertEquals(
                "[{\"page\":1,\"x\":10,\"y\":20,\"width\":100,\"height\":50}]", redactions.get(0));
    }

    @Test
    void supportingFilesAreBoundToTheirNamedFields() throws IOException {
        String addStamp = "/api/v1/misc/add-stamp-to-pdf";
        when(toolMetadataService.isMultiInput(addStamp)).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(addStamp)).thenReturn(false);
        stubEndpoint(addStamp, pdf("stamped", "stamped.pdf"));

        PipelineStep step =
                new PipelineStep(addStamp, Map.of("opacity", 0.5), Map.of("stampImage", "logo"));
        PolicyInputs inputs =
                new PolicyInputs(
                        List.of(pdf("doc", "doc.pdf")),
                        Map.of("logo", List.of(pdf("logo-bytes", "logo.png"))));

        executor.execute(
                new PipelineDefinition("stamp", List.of(step), OutputSpec.inline()),
                inputs,
                PolicyProgressListener.NOOP);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<MultiValueMap<String, Object>> bodyCaptor =
                ArgumentCaptor.forClass(MultiValueMap.class);
        verify(internalApiClient).post(eq(addStamp), bodyCaptor.capture());
        MultiValueMap<String, Object> body = bodyCaptor.getValue();
        // The document goes to fileInput; the supporting image is bound to its named field and is
        // not part of the document stream.
        assertEquals(1, body.get("fileInput").size());
        assertNotNull(body.get("stampImage"));
        assertEquals(1, body.get("stampImage").size());
    }

    @Test
    void missingSupportingFileFailsTheStep() {
        String addStamp = "/api/v1/misc/add-stamp-to-pdf";
        when(toolMetadataService.isMultiInput(addStamp)).thenReturn(false);
        PipelineStep step = new PipelineStep(addStamp, Map.of(), Map.of("stampImage", "logo"));

        IOException ex =
                assertThrows(
                        IOException.class,
                        () ->
                                executor.execute(
                                        new PipelineDefinition(
                                                "stamp", List.of(step), OutputSpec.inline()),
                                        PolicyInputs.of(List.of(pdf("doc", "doc.pdf"))),
                                        PolicyProgressListener.NOOP));
        assertTrue(ex.getMessage().contains("logo"));
    }

    @Test
    void documentOfAnUnacceptedTypeFailsTheStep() {
        String compress = "/api/v1/misc/compress-pdf";
        when(toolMetadataService.getExtensionTypes(false, compress)).thenReturn(List.of("pdf"));

        IOException ex =
                assertThrows(
                        IOException.class,
                        () ->
                                executor.execute(
                                        definition(new PipelineStep(compress, Map.of())),
                                        PolicyInputs.of(List.of(pdf("img", "image.png"))),
                                        PolicyProgressListener.NOOP));
        // Names the rejected extension, never the document. This message becomes the run's error
        // and
        // is persisted on the failure record, which holds no document name.
        assertTrue(ex.getMessage().contains("png"));
        assertFalse(ex.getMessage().contains("image.png"));
        // Type check happens before any dispatch.
        verify(internalApiClient, never()).post(anyString(), any());
    }

    @Test
    void documentOfAnAcceptedTypeProceeds() throws IOException {
        String compress = "/api/v1/misc/compress-pdf";
        when(toolMetadataService.getExtensionTypes(false, compress)).thenReturn(List.of("pdf"));
        when(toolMetadataService.isMultiInput(compress)).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(compress)).thenReturn(false);
        stubEndpoint(compress, pdf("compressed", "compressed.pdf"));

        PolicyExecutionResult result =
                executor.execute(
                        definition(new PipelineStep(compress, Map.of())),
                        PolicyInputs.of(List.of(pdf("doc", "doc.pdf"))),
                        PolicyProgressListener.NOOP);

        assertEquals(1, result.files().size());
        verify(internalApiClient, times(1)).post(eq(compress), any());
    }

    @Test
    void filterOperationWithEmptyResultDropsTheFile() throws IOException {
        String filter = "/api/v1/filter/filter-page-count";
        when(toolMetadataService.isMultiInput(filter)).thenReturn(false);
        stubEndpoint(filter, pdf("", "filtered.pdf")); // empty body => filtered out

        PolicyExecutionResult result =
                executor.execute(
                        definition(new PipelineStep(filter, Map.of())),
                        PolicyInputs.of(List.of(pdf("doc", "doc.pdf"))),
                        PolicyProgressListener.NOOP);

        assertEquals(0, result.files().size());
    }

    @Test
    void timeoutFromAStepPropagates() {
        when(toolMetadataService.isMultiInput(ROTATE)).thenReturn(false);
        when(internalApiClient.post(eq(ROTATE), any()))
                .thenThrow(
                        new InternalApiTimeoutException(
                                ROTATE,
                                java.time.Duration.ofSeconds(300),
                                new IOException("Read timed out")));

        assertThrows(
                InternalApiTimeoutException.class,
                () ->
                        executor.execute(
                                definition(new PipelineStep(ROTATE, Map.of())),
                                PolicyInputs.of(List.of(pdf("in", "in.pdf"))),
                                PolicyProgressListener.NOOP));
    }

    @Test
    void eachStepsOutputsGoOnceTheNextStepHasRunAndTheLastOnClose() throws IOException {
        when(toolMetadataService.isMultiInput(anyString())).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(anyString())).thenReturn(false);
        TempFile rotated = tempFileManager.createManagedTempFile("internal-api");
        TempFile compressed = tempFileManager.createManagedTempFile("internal-api");
        stubEndpoint(ROTATE, new InternalApiClient.TempFileResource(rotated, "rotated.pdf"));
        stubEndpoint(COMPRESS, new InternalApiClient.TempFileResource(compressed, "small.pdf"));

        try (PolicyExecutionResult result =
                executor.execute(
                        definition(
                                new PipelineStep(ROTATE, Map.of()),
                                new PipelineStep(COMPRESS, Map.of())),
                        PolicyInputs.of(List.of(pdf("in", "in.pdf"))),
                        PolicyProgressListener.NOOP)) {
            assertFalse(rotated.exists());
            assertTrue(result.files().get(0).exists());
        }

        assertFalse(compressed.exists());
    }

    @Test
    void failingStepReleasesEarlierStepOutputs() throws IOException {
        when(toolMetadataService.isMultiInput(anyString())).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(ROTATE)).thenReturn(false);
        TempFile rotated = tempFileManager.createManagedTempFile("internal-api");
        stubEndpoint(ROTATE, new InternalApiClient.TempFileResource(rotated, "rotated.pdf"));
        when(internalApiClient.post(eq(COMPRESS), any()))
                .thenThrow(new IllegalStateException("step failed"));

        assertThrows(
                IllegalStateException.class,
                () ->
                        executor.execute(
                                definition(
                                        new PipelineStep(ROTATE, Map.of()),
                                        new PipelineStep(COMPRESS, Map.of())),
                                PolicyInputs.of(List.of(pdf("in", "in.pdf"))),
                                PolicyProgressListener.NOOP));

        assertFalse(rotated.exists());
    }

    @Test
    void emptyStepsPassInputsThroughUnchanged() throws Exception {
        // A pure routing policy has no steps: inputs are delivered to the
        // destinations untouched, so execute returns them as-is.
        Resource input = pdf("in", "in.pdf");
        PolicyExecutionResult result =
                executor.execute(
                        new PipelineDefinition("empty", List.of(), OutputSpec.inline()),
                        PolicyInputs.of(List.of(input)),
                        PolicyProgressListener.NOOP);

        assertEquals(1, result.files().size());
        assertEquals("in.pdf", result.files().get(0).getFilename());
    }

    // --- helpers ---

    private static PipelineDefinition definition(PipelineStep... steps) {
        return new PipelineDefinition("test", List.of(steps), OutputSpec.inline());
    }

    @Test
    void perFileStepScopesADistinctDocumentIdForEachFile() throws IOException {
        // Within a run over several documents, each file's dispatch carries a distinct, run-scoped
        // document id so a linked instance bills each source document once - not the whole run
        // once.
        when(toolMetadataService.isMultiInput(ROTATE)).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(ROTATE)).thenReturn(false);
        List<String> docIds = new ArrayList<>();
        when(internalApiClient.post(eq(ROTATE), any()))
                .thenAnswer(
                        inv -> {
                            docIds.add(AutomationRunContext.currentDocument());
                            return ResponseEntity.ok(pdf("rotated", "rotated.pdf"));
                        });

        try (AutomationRunContext.Scope run = AutomationRunContext.open("run-x")) {
            executor.execute(
                    definition(new PipelineStep(ROTATE, Map.of())),
                    PolicyInputs.of(List.of(pdf("a", "a.pdf"), pdf("b", "b.pdf"))),
                    PolicyProgressListener.NOOP);
        }

        assertEquals(2, docIds.size());
        assertNotNull(docIds.get(0));
        assertNotNull(docIds.get(1));
        assertNotEquals(docIds.get(0), docIds.get(1)); // distinct per source document
        assertTrue(docIds.get(0).startsWith("run-x:")); // run-scoped
    }

    @Test
    void definitionWithMoreStepsThanTheLimitIsRefused() {
        props.getPolicies().setMaxSteps(2);

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        executor.execute(
                                definition(
                                        new PipelineStep(ROTATE, Map.of()),
                                        new PipelineStep(ROTATE, Map.of()),
                                        new PipelineStep(ROTATE, Map.of())),
                                PolicyInputs.of(List.of(pdf("in", "in.pdf"))),
                                PolicyProgressListener.NOOP));

        verifyNoInteractions(internalApiClient);
    }

    @Test
    void stepProducingMoreFilesThanTheLimitAbortsTheRunAndReleasesItsFiles() throws IOException {
        props.getPolicies().setMaxFilesPerStep(5);
        when(toolMetadataService.isMultiInput(SPLIT)).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(SPLIT)).thenReturn(true);
        List<Entry> pages =
                List.of(
                        new Entry("p1.pdf", "1"),
                        new Entry("p2.pdf", "2"),
                        new Entry("p3.pdf", "3"));
        when(internalApiClient.post(eq(SPLIT), any()))
                .thenAnswer(inv -> ResponseEntity.ok(zip("split.zip", pages)));

        PipelineLimits.LimitExceededException failure =
                assertThrows(
                        PipelineLimits.LimitExceededException.class,
                        () ->
                                executor.execute(
                                        definition(new PipelineStep(SPLIT, Map.of())),
                                        PolicyInputs.of(
                                                List.of(
                                                        pdf("a", "a.pdf"),
                                                        pdf("b", "b.pdf"),
                                                        pdf("c", "c.pdf"))),
                                        PolicyProgressListener.NOOP));

        assertTrue(failure.getMessage().contains("policies.maxFilesPerStep"));
        // Stopped at the second input's call, when 6 files passed the limit of 5.
        verify(internalApiClient, times(2)).post(eq(SPLIT), any());
        try (Stream<Path> left = Files.list(tempDir)) {
            assertEquals(0, left.count());
        }
    }

    private void stubEndpoint(String endpoint, Resource body) {
        when(internalApiClient.post(eq(endpoint), any())).thenReturn(ResponseEntity.ok(body));
    }

    private static ByteArrayResource pdf(String content, String filename) {
        return new ByteArrayResource(content.getBytes()) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    private static ByteArrayResource zip(String filename, List<Entry> entries) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            for (Entry entry : entries) {
                zos.putNextEntry(new ZipEntry(entry.name()));
                zos.write(entry.content().getBytes());
                zos.closeEntry();
            }
        }
        byte[] zipBytes = baos.toByteArray();
        return new ByteArrayResource(zipBytes) {
            @Override
            public String getFilename() {
                return filename;
            }

            @Override
            public InputStream getInputStream() {
                return new ByteArrayInputStream(zipBytes);
            }
        };
    }

    private record Entry(String name, String content) {}
}
