package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RequestCallback;
import org.springframework.web.client.ResponseExtractor;
import org.springframework.web.client.RestTemplate;

import jakarta.servlet.ServletContext;

import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class InternalApiClientTest {

    @Mock ServletContext servletContext;
    @Mock UserServiceInterface userService;
    @Mock TempFileManager tempFileManager;

    InternalApiClient client;

    @BeforeEach
    void setUp() {
        lenient().when(servletContext.getContextPath()).thenReturn("");
        MockEnvironment environment = new MockEnvironment().withProperty("server.port", "8080");
        client = new InternalApiClient(servletContext, userService, tempFileManager, environment);
    }

    @Test
    void postDoesNotForceContentType() throws Exception {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("fileInput", namedResource("input.pdf", "data"));

        Path tempPath = Files.createTempFile("internal-api-test", ".tmp");
        TempFile tempFile = mock(TempFile.class);
        when(tempFile.getPath()).thenReturn(tempPath);
        when(tempFile.getFile()).thenReturn(tempPath.toFile());
        when(tempFileManager.createManagedTempFile("internal-api")).thenReturn(tempFile);

        HttpHeaders[] captured = {null};

        try (var ignored =
                mockConstruction(
                        RestTemplate.class,
                        (rt, ctx) -> {
                            when(rt.httpEntityCallback(any(), eq(Resource.class)))
                                    .thenAnswer(
                                            inv -> {
                                                HttpEntity<?> entity = inv.getArgument(0);
                                                captured[0] = entity.getHeaders();
                                                return (RequestCallback) req -> {};
                                            });

                            when(rt.execute(anyString(), eq(HttpMethod.POST), any(), any()))
                                    .thenAnswer(inv -> fakeOkResponse(inv.getArgument(3)));
                        })) {

            ResponseEntity<Resource> response = client.post("/api/v1/general/merge-pdfs", body);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertNull(captured[0].getContentType(), "Content-Type should not be forced");
        } finally {
            Files.deleteIfExists(tempPath);
        }
    }

    @Test
    void postRejectsDisallowedPath() {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        assertThrows(SecurityException.class, () -> client.post("/api/v1/admin/settings", body));
    }

    @Test
    void postRejectsAiEndpointsOutsideToolsSubnamespace() {
        // /api/v1/ai/orchestrate and other non-tool AI endpoints are not internally
        // dispatchable. Only /api/v1/ai/tools/* and the general/misc/security/convert/filter
        // namespaces are on the allowlist — letting a plan step re-enter /orchestrate would
        // introduce recursion risk.
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        assertThrows(SecurityException.class, () -> client.post("/api/v1/ai/orchestrate", body));
    }

    @Test
    void postAcceptsAiToolsSubnamespace() throws Exception {
        // Agent tool paths like /api/v1/ai/tools/pdf-comment-agent are on the allowlist and
        // should be dispatchable by the orchestrator's plan executor.
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("fileInput", namedResource("input.pdf", "data"));

        Path tempPath = Files.createTempFile("internal-api-ai-tools-test", ".tmp");
        TempFile tempFile = mock(TempFile.class);
        when(tempFile.getPath()).thenReturn(tempPath);
        when(tempFile.getFile()).thenReturn(tempPath.toFile());
        when(tempFileManager.createManagedTempFile("internal-api")).thenReturn(tempFile);

        try (var ignored =
                mockConstruction(
                        RestTemplate.class,
                        (rt, ctx) -> {
                            when(rt.httpEntityCallback(any(), eq(Resource.class)))
                                    .thenReturn((RequestCallback) req -> {});
                            when(rt.execute(anyString(), eq(HttpMethod.POST), any(), any()))
                                    .thenAnswer(inv -> fakeOkResponse(inv.getArgument(3)));
                        })) {

            ResponseEntity<Resource> response =
                    client.post("/api/v1/ai/tools/pdf-comment-agent", body);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        } finally {
            Files.deleteIfExists(tempPath);
        }
    }

    @Test
    void postRejectsPathTraversal() {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        assertThrows(
                SecurityException.class,
                () -> client.post("/api/v1/misc/../../actuator/env", body));
    }

    @Test
    void postRejectsUrlEncodedCharacters() {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        assertThrows(
                SecurityException.class, () -> client.post("/api/v1/misc/%2e%2e/actuator", body));
    }

    @Test
    void postRejectsQueryString() {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        assertThrows(
                SecurityException.class,
                () -> client.post("/api/v1/misc/compress-pdf?redirect=evil", body));
    }

    @Test
    void postRejectsEmptySegment() {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        assertThrows(SecurityException.class, () -> client.post("/api/v1/misc//foo", body));
    }

    @Test
    void postRejectsTrailingSlash() {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        assertThrows(SecurityException.class, () -> client.post("/api/v1/misc/foo/", body));
    }

    @Test
    void postRejectsNullPath() {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        assertThrows(SecurityException.class, () -> client.post(null, body));
    }

    /** Create a ByteArrayResource with a filename (required for multipart). */
    private static Resource namedResource(String filename, String content) {
        return new ByteArrayResource(content.getBytes(StandardCharsets.UTF_8)) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    /** Simulate a successful HTTP response through a RestTemplate ResponseExtractor. */
    @SuppressWarnings("unchecked")
    private static ResponseEntity<Resource> fakeOkResponse(Object extractorArg) throws Exception {
        var extractor = (ResponseExtractor<ResponseEntity<Resource>>) extractorArg;
        ClientHttpResponse response = mock(ClientHttpResponse.class);
        when(response.getBody())
                .thenReturn(new ByteArrayInputStream("ok".getBytes(StandardCharsets.UTF_8)));
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"out.pdf\"");
        when(response.getHeaders()).thenReturn(headers);
        lenient().when(response.getStatusCode()).thenReturn(HttpStatus.OK);
        return extractor.extractData(response);
    }
}
