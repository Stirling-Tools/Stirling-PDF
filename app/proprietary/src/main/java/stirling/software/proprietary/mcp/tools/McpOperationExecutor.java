package stirling.software.proprietary.mcp.tools;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
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

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.InternalApiTimeoutException;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Runs a JAVA_ENDPOINT operation: resolves the input file (inline base64 or a fileId), dispatches
 * to the Stirling endpoint over the loopback via {@link InternalApiClient}, and stores the result.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpOperationExecutor {

    private final ObjectMapper mapper;
    private final InternalApiClient internalApiClient;
    private final FileStorage fileStorage;
    private final ApplicationProperties applicationProperties;

    public McpOperationExecutor(
            ObjectMapper mapper,
            InternalApiClient internalApiClient,
            FileStorage fileStorage,
            ApplicationProperties applicationProperties) {
        this.mapper = mapper;
        this.internalApiClient = internalApiClient;
        this.fileStorage = fileStorage;
        this.applicationProperties = applicationProperties;
    }

    public ObjectNode execute(OperationMeta meta, JsonNode arguments) {
        String fileName = McpToolSupport.textArg(arguments, "fileName");
        String fileId = McpToolSupport.textArg(arguments, "fileId");
        byte[] inputBytes;
        String inputName;
        if (fileId != null) {
            try {
                if (!fileStorage.fileExists(fileId)) {
                    return McpResponses.error(
                            mapper,
                            "Unknown or inaccessible fileId '"
                                    + fileId
                                    + "'. Re-upload with stirling_upload.");
                }
                inputBytes = fileStorage.retrieveBytes(fileId);
            } catch (SecurityException e) {
                return McpResponses.error(
                        mapper,
                        "Unknown or inaccessible fileId '"
                                + fileId
                                + "'. Re-upload with stirling_upload.");
            } catch (IOException e) {
                return McpResponses.error(mapper, "Could not read fileId '" + fileId + "'.");
            }
            inputName = fileName != null ? fileName : fileId;
        } else {
            String base64 = McpToolSupport.textArg(arguments, "file");
            if (base64 == null) {
                return McpResponses.error(
                        mapper,
                        "This operation needs an input file. Pass 'file' as base64 (recommended for"
                                + " most files), or 'fileId' from stirling_upload for large files.");
            }
            inputBytes = McpToolSupport.decodeBase64OrNull(base64);
            if (inputBytes == null) {
                return McpResponses.error(mapper, "The 'file' argument is not valid base64.");
            }
            inputName = fileName != null ? fileName : "input.pdf";
        }

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
        return buildResult(meta, response);
    }

    private ObjectNode buildResult(OperationMeta meta, ResponseEntity<Resource> response) {
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
        long maxInline = applicationProperties.getMcp().getMaxInlineResponseBytes();
        try {
            long size = body.contentLength();
            byte[] inline = null;
            if (size >= 0 && size <= maxInline) {
                try (InputStream is = body.getInputStream()) {
                    inline = is.readAllBytes();
                }
            }
            String fileId =
                    inline != null
                            ? fileStorage.storeBytes(inline, filename)
                            : storeStreamed(body, filename);
            String summary =
                    meta.id()
                            + " succeeded. Result: "
                            + filename
                            + " ("
                            + size
                            + " bytes), fileId="
                            + fileId
                            + ". ";
            if (inline != null) {
                return McpResponses.result(
                        mapper,
                        false,
                        McpResponses.textBlock(
                                mapper, summary + "The file is included inline below."),
                        McpResponses.resourceBlock(
                                mapper,
                                "stirling://file/" + fileId,
                                mimeType,
                                Base64.getEncoder().encodeToString(inline)));
            }
            return McpResponses.result(
                    mapper,
                    false,
                    McpResponses.textBlock(
                            mapper,
                            summary
                                    + "Large result - fetch it with stirling_download {\"fileId\":\""
                                    + fileId
                                    + "\"}, or pass this fileId to another operation."));
        } catch (IOException e) {
            return McpResponses.error(mapper, "Failed to store " + meta.id() + " result.");
        }
    }

    private String storeStreamed(Resource body, String filename) throws IOException {
        try (InputStream is = body.getInputStream()) {
            return fileStorage.storeInputStream(is, filename).fileId();
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
