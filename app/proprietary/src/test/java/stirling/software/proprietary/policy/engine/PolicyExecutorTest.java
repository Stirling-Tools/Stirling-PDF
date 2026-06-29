package stirling.software.proprietary.policy.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.InternalApiTimeoutException;
import stirling.software.common.service.ToolMetadataService;
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

    private TempFileManager tempFileManager;
    private PolicyExecutor executor;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("policy-test-");
        tempFileManager = new TempFileManager(new TempFileRegistry(), props);
        ObjectMapper objectMapper = JsonMapper.builder().build();
        executor =
                new PolicyExecutor(
                        internalApiClient, toolMetadataService, tempFileManager, objectMapper);
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
                                                "htmlContent",
                                                "<p>hi</p>",
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
        String editText = "/api/v1/general/edit-text";
        when(toolMetadataService.isMultiInput(editText)).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(editText)).thenReturn(false);
        stubEndpoint(editText, pdf("edited", "edited.pdf"));

        // LinkedHashMap so the serialized key order is deterministic for the assertion below.
        Map<String, Object> edit = new LinkedHashMap<>();
        edit.put("find", "foo");
        edit.put("replace", "bar");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("edits", List.of(edit));
        params.put("useRegex", false);

        executor.execute(
                definition(new PipelineStep(editText, params)),
                PolicyInputs.of(List.of(pdf("in", "in.pdf"))),
                PolicyProgressListener.NOOP);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<MultiValueMap<String, Object>> bodyCaptor =
                ArgumentCaptor.forClass(MultiValueMap.class);
        verify(internalApiClient).post(eq(editText), bodyCaptor.capture());
        MultiValueMap<String, Object> body = bodyCaptor.getValue();

        List<Object> edits = body.get("edits");
        assertNotNull(edits);
        assertEquals(1, edits.size());
        assertEquals("[{\"find\":\"foo\",\"replace\":\"bar\"}]", edits.get(0));
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
        assertTrue(ex.getMessage().contains("image.png"));
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
    void emptyPipelineIsRejected() {
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        executor.execute(
                                new PipelineDefinition("empty", List.of(), OutputSpec.inline()),
                                PolicyInputs.of(List.of(pdf("in", "in.pdf"))),
                                PolicyProgressListener.NOOP));
    }

    // --- helpers ---

    private static PipelineDefinition definition(PipelineStep... steps) {
        return new PipelineDefinition("test", List.of(steps), OutputSpec.inline());
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
