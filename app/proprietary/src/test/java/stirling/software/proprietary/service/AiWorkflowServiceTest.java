package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
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
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.MultiValueMap;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.FileStorage.StoredFile;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileInput;
import stirling.software.proprietary.model.api.ai.AiWorkflowOutcome;
import stirling.software.proprietary.model.api.ai.AiWorkflowRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowResponse;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Smoke tests for {@link AiWorkflowService}. Covers the TOOL_CALL and PLAN execution paths,
 * ZIP-response unpacking (split endpoints), multi-input dispatch (merge endpoints), and the 1:1
 * input-to-output filename preservation rule.
 *
 * <p>External collaborators (engine client, internal API client, tool metadata, file storage) are
 * mocked. {@link TempFileManager} is constructed with a real in-test registry so the service's
 * temp-file handling exercises real code.
 */
@ExtendWith(MockitoExtension.class)
class AiWorkflowServiceTest {

    private static final String ROTATE_ENDPOINT = "/api/v1/general/rotate-pdf";
    private static final String SPLIT_ENDPOINT = "/api/v1/general/split-pages";
    private static final String MERGE_ENDPOINT = "/api/v1/general/merge-pdfs";
    private static final String COMPRESS_ENDPOINT = "/api/v1/misc/compress-pdf";

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
    void setUp() throws IOException {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("ai-test-");
        tempFileManager = new TempFileManager(new TempFileRegistry(), props);
        objectMapper = JsonMapper.builder().build();

        // Mock strategy yields the filename as id so each MockMultipartFile in a test gets a
        // distinct collection key. Real strategy (ByteHashFileIdStrategy) hashes bytes.
        lenient()
                .when(fileIdStrategy.idFor(any(MultipartFile.class)))
                .thenAnswer(inv -> ((MultipartFile) inv.getArgument(0)).getOriginalFilename());

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
        when(endpointResolver.getEnabledEndpointUrls()).thenReturn(List.of());
    }

    @Test
    void toolCallSingleFilePreservesInputFilename() throws IOException {
        MockMultipartFile input = pdf("input.pdf", "original-pdf-bytes");
        stubOrchestrator(
                """
                {"outcome":"tool_call","tool":"%s","parameters":{"angle":90},"rationale":"Rotating"}
                """
                        .formatted(ROTATE_ENDPOINT));
        when(toolMetadataService.isMultiInput(ROTATE_ENDPOINT)).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(ROTATE_ENDPOINT)).thenReturn(false);
        stubEndpoint(ROTATE_ENDPOINT, pdfResource("rotated-bytes", "rotated.pdf"));
        AtomicInteger ids = stubFileStorage();

        AiWorkflowResponse result = service.orchestrate(requestFor(input, "rotate 90"));

        assertEquals(AiWorkflowOutcome.COMPLETED, result.getOutcome());
        assertEquals(1, result.getResultFiles().size());
        // 1:1 mapping — the single output should inherit the single input's filename.
        assertEquals("input.pdf", result.getResultFiles().get(0).getFileName());
        assertEquals("file-1", result.getResultFiles().get(0).getFileId());
        assertEquals(1, ids.get());
        verify(internalApiClient, times(1)).post(eq(ROTATE_ENDPOINT), any());
    }

    @Test
    void toolCallZipResponseUnpacksIntoMultipleResults() throws IOException {
        MockMultipartFile input = pdf("doc.pdf", "original");
        stubOrchestrator(
                """
                {"outcome":"tool_call","tool":"%s","parameters":{},"rationale":"Splitting"}
                """
                        .formatted(SPLIT_ENDPOINT));
        when(toolMetadataService.isMultiInput(SPLIT_ENDPOINT)).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(SPLIT_ENDPOINT)).thenReturn(true);
        stubEndpoint(
                SPLIT_ENDPOINT,
                zipResource(
                        "doc.zip",
                        List.of(
                                new ZipEntryBytes("page-1.pdf", "page-one"),
                                new ZipEntryBytes("page-2.pdf", "page-two"),
                                new ZipEntryBytes("page-3.pdf", "page-three"))));
        stubFileStorage();

        AiWorkflowResponse result = service.orchestrate(requestFor(input, "split"));

        assertEquals(AiWorkflowOutcome.COMPLETED, result.getOutcome());
        assertEquals(3, result.getResultFiles().size());
        // Input count (1) != output count (3) so the per-entry filename is kept.
        assertEquals("page-1.pdf", result.getResultFiles().get(0).getFileName());
        assertEquals("page-2.pdf", result.getResultFiles().get(1).getFileName());
        assertEquals("page-3.pdf", result.getResultFiles().get(2).getFileName());
    }

    @Test
    void multiInputEndpointIsCalledOnceWithAllFiles() throws IOException {
        MockMultipartFile a = pdf("a.pdf", "a-bytes");
        MockMultipartFile b = pdf("b.pdf", "b-bytes");
        stubOrchestrator(
                """
                {"outcome":"tool_call","tool":"%s","parameters":{},"rationale":"Merging"}
                """
                        .formatted(MERGE_ENDPOINT));
        when(toolMetadataService.isMultiInput(MERGE_ENDPOINT)).thenReturn(true);
        when(toolMetadataService.shouldUnpackZipResponse(MERGE_ENDPOINT)).thenReturn(false);
        stubEndpoint(MERGE_ENDPOINT, pdfResource("merged-bytes", "merged.pdf"));
        stubFileStorage();

        AiWorkflowResponse result =
                service.orchestrate(requestFor(new MockMultipartFile[] {a, b}, "merge these"));

        assertEquals(AiWorkflowOutcome.COMPLETED, result.getOutcome());
        assertEquals(1, result.getResultFiles().size());
        // Two inputs but only one output → filename is not preserved from either input.
        assertEquals("merged.pdf", result.getResultFiles().get(0).getFileName());
        verify(internalApiClient, times(1)).post(eq(MERGE_ENDPOINT), any());
    }

    @Test
    void singleInputEndpointIsCalledOncePerFile() throws IOException {
        MockMultipartFile a = pdf("a.pdf", "a-bytes");
        MockMultipartFile b = pdf("b.pdf", "b-bytes");
        stubOrchestrator(
                """
                {"outcome":"tool_call","tool":"%s","parameters":{"angle":90},"rationale":"Rotating"}
                """
                        .formatted(ROTATE_ENDPOINT));
        when(toolMetadataService.isMultiInput(ROTATE_ENDPOINT)).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(ROTATE_ENDPOINT)).thenReturn(false);
        stubEndpoint(ROTATE_ENDPOINT, pdfResource("rotated", "rotated.pdf"));
        stubFileStorage();

        AiWorkflowResponse result =
                service.orchestrate(requestFor(new MockMultipartFile[] {a, b}, "rotate both"));

        assertEquals(AiWorkflowOutcome.COMPLETED, result.getOutcome());
        assertEquals(2, result.getResultFiles().size());
        // Per-file loop dispatches one call per input file.
        verify(internalApiClient, times(2)).post(eq(ROTATE_ENDPOINT), any());
        // 1:1 mapping preserves each input's filename.
        assertEquals("a.pdf", result.getResultFiles().get(0).getFileName());
        assertEquals("b.pdf", result.getResultFiles().get(1).getFileName());
    }

    @Test
    void planExecutesStepsSequentially() throws IOException {
        MockMultipartFile input = pdf("input.pdf", "bytes");
        stubOrchestrator(
                """
                {
                  "outcome":"plan",
                  "summary":"Rotate then compress",
                  "steps":[
                    {"tool":"%s","parameters":{"angle":90}},
                    {"tool":"%s","parameters":{}}
                  ]
                }
                """
                        .formatted(ROTATE_ENDPOINT, COMPRESS_ENDPOINT));
        when(toolMetadataService.isMultiInput(anyString())).thenReturn(false);
        when(toolMetadataService.shouldUnpackZipResponse(anyString())).thenReturn(false);
        stubEndpoint(ROTATE_ENDPOINT, pdfResource("rotated", "rotated.pdf"));
        stubEndpoint(COMPRESS_ENDPOINT, pdfResource("compressed", "compressed.pdf"));
        stubFileStorage();

        AiWorkflowResponse result = service.orchestrate(requestFor(input, "rotate and compress"));

        assertEquals(AiWorkflowOutcome.COMPLETED, result.getOutcome());
        assertEquals(1, result.getResultFiles().size());
        // 1:1 input → output mapping at the plan level preserves the input's filename.
        assertEquals("input.pdf", result.getResultFiles().get(0).getFileName());
        verify(internalApiClient, times(1)).post(eq(ROTATE_ENDPOINT), any());
        verify(internalApiClient, times(1)).post(eq(COMPRESS_ENDPOINT), any());
    }

    @Test
    void toolCallWithoutEndpointFallsBackToCannotContinue() throws IOException {
        MockMultipartFile input = pdf("input.pdf", "bytes");
        stubOrchestrator("{\"outcome\":\"tool_call\",\"parameters\":{}}");

        AiWorkflowResponse result = service.orchestrate(requestFor(input, "do something"));

        assertEquals(AiWorkflowOutcome.CANNOT_CONTINUE, result.getOutcome());
        assertNotNull(result.getReason());
        verify(internalApiClient, never()).post(anyString(), any());
    }

    @Test
    void needIngestExtractsPageTextAndPostsToRagThenRetries() throws IOException {
        MockMultipartFile input = pdf("report.pdf", "bytes");
        when(fileIdStrategy.idFor(any())).thenReturn("report-id");

        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        document.addPage(new PDPage());
        when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean())).thenReturn(document);
        when(pdfContentExtractor.extractPageTextRaw(eq(document), anyInt()))
                .thenReturn("page content");

        int[] orchestratorCalls = {0};
        when(aiEngineClient.post(eq("/api/v1/orchestrator"), anyString()))
                .thenAnswer(
                        inv -> {
                            orchestratorCalls[0]++;
                            if (orchestratorCalls[0] == 1) {
                                return """
                                       {
                                         "outcome":"need_ingest",
                                         "resumeWith":"pdf_question",
                                         "reason":"ingest first",
                                         "filesToIngest":[{"id":"report-id","name":"report.pdf"}],
                                         "contentTypes":["page_text"]
                                       }
                                       """;
                            }
                            return """
                                   {"outcome":"answer","answer":"done","evidence":[]}
                                   """;
                        });

        AiWorkflowResponse result = service.orchestrate(requestFor(input, "summarise this"));

        assertEquals(AiWorkflowOutcome.ANSWER, result.getOutcome());
        verify(aiEngineClient, times(1)).postLongRunning(eq("/api/v1/rag/documents"), anyString());
        verify(aiEngineClient, times(2)).post(eq("/api/v1/orchestrator"), anyString());
    }

    // --- helpers ---

    private void stubOrchestrator(String responseJson) throws IOException {
        when(aiEngineClient.post(eq("/api/v1/orchestrator"), anyString())).thenReturn(responseJson);
    }

    private void stubEndpoint(String endpoint, Resource body) {
        when(internalApiClient.post(eq(endpoint), any(MultiValueMap.class)))
                .thenReturn(ResponseEntity.ok(body));
    }

    /**
     * Stub {@link FileStorage#storeInputStream} with sequential file IDs and an accurate byte
     * count. Returns the counter so tests can assert how many stores happened.
     */
    private AtomicInteger stubFileStorage() throws IOException {
        AtomicInteger counter = new AtomicInteger();
        when(fileStorage.storeInputStream(any(InputStream.class), anyString()))
                .thenAnswer(
                        inv -> {
                            InputStream is = inv.getArgument(0);
                            long size = is.readAllBytes().length;
                            return new StoredFile("file-" + counter.incrementAndGet(), size);
                        });
        return counter;
    }

    private static MockMultipartFile pdf(String filename, String content) {
        return new MockMultipartFile("fileInput", filename, "application/pdf", content.getBytes());
    }

    private static AiWorkflowRequest requestFor(MockMultipartFile file, String message) {
        return requestFor(new MockMultipartFile[] {file}, message);
    }

    private static AiWorkflowRequest requestFor(MockMultipartFile[] files, String message) {
        AiWorkflowRequest request = new AiWorkflowRequest();
        List<AiWorkflowFileInput> inputs = new ArrayList<>();
        for (MockMultipartFile file : files) {
            AiWorkflowFileInput fileInput = new AiWorkflowFileInput();
            fileInput.setFileInput(file);
            inputs.add(fileInput);
        }
        request.setFileInputs(inputs);
        request.setUserMessage(message);
        return request;
    }

    private static ByteArrayResource pdfResource(String content, String filename) {
        return new ByteArrayResource(content.getBytes()) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    private static ByteArrayResource zipResource(String filename, List<ZipEntryBytes> entries)
            throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            for (ZipEntryBytes entry : entries) {
                zos.putNextEntry(new ZipEntry(entry.name()));
                zos.write(entry.bytes());
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

    private record ZipEntryBytes(String name, byte[] bytes) {
        ZipEntryBytes(String name, String content) {
            this(name, content.getBytes());
        }
    }
}
