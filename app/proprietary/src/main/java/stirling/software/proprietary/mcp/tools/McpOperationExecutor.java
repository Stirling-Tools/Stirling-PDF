package stirling.software.proprietary.mcp.tools;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientResponseException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.InternalApiTimeoutException;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.catalog.OperationMeta;
import stirling.software.proprietary.mcp.files.McpFileUrlFetcher;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Runs an operation over the loopback and stores the result as a temporary file. */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpOperationExecutor {

    private final ObjectMapper mapper;
    private final InternalApiClient internalApiClient;
    private final McpFiles files;
    private final McpFileUrlFetcher fileUrlFetcher;

    public McpOperationExecutor(
            ObjectMapper mapper,
            InternalApiClient internalApiClient,
            McpFiles files,
            McpFileUrlFetcher fileUrlFetcher) {
        this.mapper = mapper;
        this.internalApiClient = internalApiClient;
        this.files = files;
        this.fileUrlFetcher = fileUrlFetcher;
    }

    public ObjectNode execute(OperationMeta meta, JsonNode arguments, McpCallContext context) {
        User user;
        try {
            user = files.user(context);
        } catch (McpFiles.McpFileException e) {
            return McpResponses.error(mapper, e.getMessage());
        }
        McpInputFiles.Input input =
                McpInputFiles.resolve(arguments, files, user, fileUrlFetcher, "input.pdf");
        if (input.error() != null) {
            return McpResponses.error(mapper, input.error());
        }
        byte[] inputBytes = input.bytes();
        String inputName = input.name();

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("fileInput", bytesResource(inputBytes, inputName));
        addParameters(body, arguments == null ? null : arguments.get("parameters"));

        ResponseEntity<Resource> response;
        try {
            response = internalApiClient.post(meta.endpointPath(), body);
        } catch (InternalApiTimeoutException e) {
            return McpResponses.error(
                    mapper,
                    meta.id()
                            + " timed out after "
                            + e.getReadTimeout().toSeconds()
                            + "s. Try a smaller file or a different approach.");
        } catch (RestClientResponseException e) {
            log.warn(
                    "MCP {} upstream error: HTTP {} - {}",
                    meta.id(),
                    e.getStatusCode().value(),
                    snippet(e.getResponseBodyAsString()));
            return McpResponses.error(
                    mapper, meta.id() + " failed: HTTP " + e.getStatusCode().value() + ".");
        } catch (SecurityException e) {
            return McpResponses.error(
                    mapper, meta.id() + " endpoint is not permitted for MCP dispatch.");
        } catch (RuntimeException e) {
            log.warn("MCP execution of {} failed", meta.id(), e);
            return McpResponses.error(
                    mapper, meta.id() + " failed unexpectedly. See server logs for details.");
        }
        return buildResult(meta, response, user);
    }

    private ObjectNode buildResult(
            OperationMeta meta, ResponseEntity<Resource> response, User user) {
        Resource body = response.getBody();
        if (body == null) {
            return McpResponses.error(mapper, meta.id() + " returned an empty response.");
        }
        MediaType contentType = response.getHeaders().getContentType();

        // A JSON body is a structured report (e.g. get-info), not a file.
        if (contentType != null && MediaType.APPLICATION_JSON.isCompatibleWith(contentType)) {
            try (InputStream is = body.getInputStream()) {
                return McpResponses.text(
                        mapper, new String(is.readAllBytes(), StandardCharsets.UTF_8));
            } catch (IOException e) {
                return McpResponses.error(mapper, "Failed to read " + meta.id() + " result.");
            }
        }

        String filename =
                body.getFilename() == null || body.getFilename().isBlank()
                        ? meta.id()
                        : body.getFilename();
        String mimeType =
                contentType != null
                        ? contentType.toString()
                        : MediaType.APPLICATION_OCTET_STREAM_VALUE;
        try {
            StoredFile stored = files.store(user, body, filename, mimeType, contentLength(body));
            return McpResponses.storedFile(
                    mapper, meta.id(), stored, files.downloadUrl(user, stored));
        } catch (McpFiles.McpFileException e) {
            return McpResponses.error(mapper, meta.id() + " succeeded but " + e.getMessage());
        }
    }

    private static long contentLength(Resource body) {
        try {
            return body.contentLength();
        } catch (IOException e) {
            return -1;
        }
    }

    private void addParameters(MultiValueMap<String, Object> body, JsonNode params) {
        if (params == null || !params.isObject()) {
            return;
        }
        Map<String, Object> map =
                mapper.convertValue(params, new TypeReference<Map<String, Object>>() {});
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            Object value = entry.getValue();
            if (value == null) {
                continue;
            }
            if (value instanceof List<?> list) {
                if (containsStructured(list)) {
                    body.add(entry.getKey(), mapper.writeValueAsString(list));
                } else {
                    list.forEach(item -> body.add(entry.getKey(), item));
                }
            } else if (value instanceof Map<?, ?>) {
                body.add(entry.getKey(), mapper.writeValueAsString(value));
            } else {
                body.add(entry.getKey(), value);
            }
        }
    }

    private static boolean containsStructured(List<?> list) {
        return list.stream().anyMatch(item -> item instanceof Map<?, ?> || item instanceof List<?>);
    }

    private static Resource bytesResource(byte[] bytes, String filename) {
        return new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    private static String snippet(String body) {
        if (body == null || body.isBlank()) {
            return "(no body)";
        }
        String trimmed = body.strip();
        return trimmed.length() > 300 ? trimmed.substring(0, 300) + "..." : trimmed;
    }
}
