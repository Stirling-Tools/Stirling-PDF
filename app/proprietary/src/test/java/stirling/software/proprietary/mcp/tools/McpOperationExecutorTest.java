package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.InternalApiClient;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class McpOperationExecutorTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void admittedJwtIsForwardedToTheToolApiWithoutApiKeyFallback() throws Exception {
        InternalApiClient api = mock(InternalApiClient.class);
        FileStorage storage = mock(FileStorage.class);
        when(api.post(eq("/api/v1/misc/compress-pdf"), any(), eq("admitted-session")))
                .thenReturn(pdfResponse("RESULT".getBytes(StandardCharsets.UTF_8)));
        when(storage.storeBytes(any(), anyString())).thenReturn("result");
        var jwt =
                Jwt.withTokenValue("admitted-session")
                        .header("alg", "RS256")
                        .subject("company-user")
                        .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new JwtAuthenticationToken(jwt, List.of(), "original-user"));
        var executor = new McpOperationExecutor(mapper, api, storage, new ApplicationProperties());
        var arguments =
                mapper.createObjectNode()
                        .put("file", Base64.getEncoder().encodeToString(new byte[] {1}));
        assertFalse(executor.execute(compressOp(), arguments).path("isError").asBoolean(false));
        verify(api).post(eq("/api/v1/misc/compress-pdf"), any(), eq("admitted-session"));
        verify(api, never()).post(anyString(), any());
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

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
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

        ArgumentCaptor<MultiValueMap> bodyCap = ArgumentCaptor.forClass(MultiValueMap.class);
        verify(api).post(eq("/api/v1/misc/compress-pdf"), bodyCap.capture());
        MultiValueMap captured = bodyCap.getValue();
        assertTrue(captured.containsKey("fileInput"), "must send fileInput");
        assertEquals("2", String.valueOf(captured.getFirst("optimizeLevel")), "must pass params");

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
}
