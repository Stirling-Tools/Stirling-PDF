package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.io.Resource;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.InternalApiClient;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * MIGRATION (Spring -> Quarkus): {@link InternalApiClient} now returns a {@link Response} (was
 * {@code ResponseEntity<Resource>}) carrying the {@link Resource} shim, and accepts a {@code
 * Map<String,List<Object>>} body (was Spring {@code MultiValueMap}).
 */
class McpOperationExecutorTest {

    private final ObjectMapper mapper = new ObjectMapper();

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

    private Response pdfResponse(byte[] bytes) {
        Resource body = new ByteArrayBackedResource(bytes, "out.pdf");
        return Response.ok(body, MediaType.valueOf("application/pdf")).build();
    }

    @Test
    void inlineBase64Input_runsAndReturnsResultInline() throws Exception {
        InternalApiClient api = mock(InternalApiClient.class);
        FileStorage storage = mock(FileStorage.class);
        ApplicationProperties props = new ApplicationProperties();

        when(api.post(eq("/api/v1/misc/compress-pdf"), any()))
                .thenReturn(pdfResponse("RESULT".getBytes(StandardCharsets.UTF_8)));
        when(storage.storeBytes(any(), anyString())).thenReturn("result-123");

        McpOperationExecutor executor = new McpOperationExecutor(mapper, api, storage, props);

        ObjectNode args = mapper.createObjectNode();
        args.put("operation", "compress-pdf");
        args.put(
                "file",
                Base64.getEncoder().encodeToString("INPUT".getBytes(StandardCharsets.UTF_8)));
        args.putObject("parameters").put("optimizeLevel", 2);

        ObjectNode result = executor.execute(compressOp(), args);

        assertFalse(result.path("isError").asBoolean(false));

        ArgumentCaptor<Map<String, List<Object>>> bodyCap = bodyCaptor();
        verify(api).post(eq("/api/v1/misc/compress-pdf"), bodyCap.capture());
        Map<String, List<Object>> captured = bodyCap.getValue();
        assertTrue(captured.containsKey("fileInput"), "must send fileInput");
        assertEquals("2", String.valueOf(captured.get("optimizeLevel").get(0)), "must pass params");

        String text = result.get("content").get(0).get("text").asText();
        assertTrue(text.contains("result-123"), "must report the result fileId: " + text);
        ObjectNode resBlock = (ObjectNode) result.get("content").get(1);
        assertEquals("resource", resBlock.get("type").asText());
        String blob = resBlock.get("resource").get("blob").asText();
        assertEquals(
                "RESULT", new String(Base64.getDecoder().decode(blob), StandardCharsets.UTF_8));
    }

    @Test
    void missingFile_returnsError() {
        McpOperationExecutor executor =
                new McpOperationExecutor(
                        mapper,
                        mock(InternalApiClient.class),
                        mock(FileStorage.class),
                        new ApplicationProperties());
        ObjectNode args = mapper.createObjectNode();
        args.put("operation", "compress-pdf");

        ObjectNode result = executor.execute(compressOp(), args);

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(
                result.get("content")
                        .get(0)
                        .get("text")
                        .asText()
                        .toLowerCase()
                        .contains("input file"));
    }

    @Test
    void fileIdInput_retrievesStoredBytes() throws Exception {
        InternalApiClient api = mock(InternalApiClient.class);
        FileStorage storage = mock(FileStorage.class);
        when(storage.fileExists("abc")).thenReturn(true);
        when(storage.retrieveBytes("abc")).thenReturn("INPUT".getBytes(StandardCharsets.UTF_8));
        when(api.post(anyString(), any()))
                .thenReturn(pdfResponse("OUT".getBytes(StandardCharsets.UTF_8)));
        when(storage.storeBytes(any(), anyString())).thenReturn("res");

        McpOperationExecutor executor =
                new McpOperationExecutor(mapper, api, storage, new ApplicationProperties());
        ObjectNode args = mapper.createObjectNode();
        args.put("operation", "compress-pdf");
        args.put("fileId", "abc");

        ObjectNode result = executor.execute(compressOp(), args);

        assertFalse(result.path("isError").asBoolean(false));
        verify(storage).retrieveBytes("abc");
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static ArgumentCaptor<Map<String, List<Object>>> bodyCaptor() {
        return (ArgumentCaptor) ArgumentCaptor.forClass(Map.class);
    }

    /**
     * In-memory {@link Resource} with a stable filename, repeatable reads, and a real {@code
     * contentLength()} so the executor's inline-vs-streamed decision works (replaces Spring's
     * {@code ByteArrayResource}).
     */
    private static final class ByteArrayBackedResource implements Resource {
        private final byte[] bytes;
        private final String filename;

        ByteArrayBackedResource(byte[] bytes, String filename) {
            this.bytes = bytes;
            this.filename = filename;
        }

        @Override
        public InputStream getInputStream() {
            return new ByteArrayInputStream(bytes);
        }

        @Override
        public boolean exists() {
            return true;
        }

        @Override
        public String getFilename() {
            return filename;
        }

        @Override
        public long contentLength() {
            return bytes.length;
        }

        @Override
        public File getFile() throws IOException {
            throw new IOException("not file-backed");
        }
    }
}
