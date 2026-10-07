package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;

import stirling.software.common.service.InternalApiClient;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;
import stirling.software.proprietary.mcp.files.McpFileUrlFetcher;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class McpOperationExecutorTest {

    private static final String LINK = "https://api.example.com/api/v1/storage/share-links/t";

    private final ObjectMapper mapper = new ObjectMapper();
    private final McpCallContext context = new McpCallContext("alice", Set.of(), false);
    private final User alice = new User();
    private final InternalApiClient api = mock(InternalApiClient.class);
    private final McpFiles files = mock(McpFiles.class);
    private final McpFileUrlFetcher fetcher = mock(McpFileUrlFetcher.class);
    private final McpOperationExecutor executor =
            new McpOperationExecutor(mapper, api, files, fetcher);

    @BeforeEach
    void setUp() throws Exception {
        when(files.user(context)).thenReturn(alice);
        StoredFile stored = new StoredFile();
        stored.setId(7L);
        stored.setOriginalFilename("out.pdf");
        stored.setContentType("application/pdf");
        stored.setSizeBytes(3);
        when(files.store(eq(alice), any(Resource.class), anyString(), anyString(), anyLong()))
                .thenReturn(stored);
        when(files.downloadUrl(alice, stored)).thenReturn(LINK);
        when(api.post(anyString(), any()))
                .thenReturn(pdfResponse("OUT".getBytes(StandardCharsets.UTF_8)));
    }

    private OperationMeta compressOp() {
        return new OperationMeta(
                "compress-pdf",
                OperationCategory.MISC,
                "Compress",
                mapper.createObjectNode(),
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                "/api/v1/misc/compress-pdf",
                null);
    }

    private ResponseEntity<Resource> pdfResponse(byte[] bytes) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        Resource body =
                new ByteArrayResource(bytes) {
                    @Override
                    public String getFilename() {
                        return "out.pdf";
                    }
                };
        return ResponseEntity.ok().headers(headers).body(body);
    }

    private ObjectNode base64Args() {
        ObjectNode args = mapper.createObjectNode();
        args.put("file", Base64.getEncoder().encodeToString("IN".getBytes(StandardCharsets.UTF_8)));
        return args;
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void base64Input_storesResultAndReturnsFileCardWithLink() {
        ObjectNode args = base64Args();
        args.putObject("parameters").put("optimizeLevel", 2);

        ObjectNode result = executor.execute(compressOp(), args, context);

        assertFalse(result.path("isError").asBoolean(false));
        ArgumentCaptor<MultiValueMap> bodyCap = ArgumentCaptor.forClass(MultiValueMap.class);
        verify(api).post(eq("/api/v1/misc/compress-pdf"), bodyCap.capture());
        assertTrue(bodyCap.getValue().containsKey("fileInput"), "must send fileInput");
        assertEquals("2", String.valueOf(bodyCap.getValue().getFirst("optimizeLevel")));

        assertEquals(1, result.get("content").size(), "no inline blob");
        assertTrue(result.get("content").get(0).get("text").asText().contains(LINK));
        ObjectNode card = (ObjectNode) result.get("structuredContent");
        assertEquals("file", card.get("kind").asText());
        assertEquals("7", card.get("fileId").asText());
        assertEquals("out.pdf", card.get("fileName").asText());
        assertEquals(LINK, card.get("downloadUrl").asText());
    }

    @Test
    void publicLinksOff_resultStillHasFileIdButNoLink() throws Exception {
        when(files.downloadUrl(any(), any())).thenReturn(null);

        ObjectNode result = executor.execute(compressOp(), base64Args(), context);

        assertFalse(result.path("isError").asBoolean(false));
        assertEquals("7", result.get("structuredContent").get("fileId").asText());
        assertNull(result.get("structuredContent").get("downloadUrl"));
    }

    @Test
    void missingFile_returnsError() {
        ObjectNode result = executor.execute(compressOp(), mapper.createObjectNode(), context);

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(result.get("content").get(0).get("text").asText().contains("input file"));
    }

    @Test
    void fileIdInput_loadsStoredFile() throws Exception {
        when(files.load(alice, "7")).thenReturn(new McpFiles.Loaded("IN".getBytes(), "a.pdf"));
        ObjectNode args = mapper.createObjectNode();
        args.put("fileId", "7");

        ObjectNode result = executor.execute(compressOp(), args, context);

        assertFalse(result.path("isError").asBoolean(false));
        verify(files).load(alice, "7");
    }

    @Test
    void unknownFileId_isReportedToTheModel() throws Exception {
        when(files.load(alice, "99"))
                .thenThrow(new McpFiles.McpFileException("Unknown or expired fileId '99'."));
        ObjectNode args = mapper.createObjectNode();
        args.put("fileId", "99");

        ObjectNode result = executor.execute(compressOp(), args, context);

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(result.get("content").get(0).get("text").asText().contains("expired"));
    }

    @Test
    void unboundAccount_isRefused() throws Exception {
        when(files.user(context))
                .thenThrow(new McpFiles.McpFileException("Stirling account not found."));

        ObjectNode result = executor.execute(compressOp(), base64Args(), context);

        assertTrue(result.path("isError").asBoolean(false));
    }

    @Test
    void attachmentInput_isFetchedFromDownloadUrl() throws Exception {
        when(fetcher.fetch("https://files.oaiusercontent.com/a"))
                .thenReturn("IN".getBytes(StandardCharsets.UTF_8));
        ObjectNode args = mapper.createObjectNode();
        ObjectNode att = args.putObject("inputFile");
        att.put("download_url", "https://files.oaiusercontent.com/a");
        att.put("file_id", "file-1");
        att.put("file_name", "scan.pdf");

        ObjectNode result = executor.execute(compressOp(), args, context);

        assertFalse(result.path("isError").asBoolean(false));
        verify(fetcher).fetch("https://files.oaiusercontent.com/a");
    }

    @Test
    void attachmentFetchFailure_isReportedToTheModel() throws Exception {
        when(fetcher.fetch(anyString()))
                .thenThrow(
                        new McpFileUrlFetcher.FetchException(
                                "Attachments from 'evil' are not accepted by this server."));
        ObjectNode args = mapper.createObjectNode();
        args.putObject("inputFile").put("download_url", "https://evil/x");

        ObjectNode result = executor.execute(compressOp(), args, context);

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(result.get("content").get(0).get("text").asText().contains("not accepted"));
    }
}
