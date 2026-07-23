package stirling.software.proprietary.integration.api;

import java.io.IOException;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.AutomationRunContext;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.service.AiToolResponseHeaders;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Posts the document flowing through a policy to a third-party HTTP API and folds the answer back
 * into the run.
 *
 * <p>This is the generic integration step: rather than a bespoke connector per vendor, an operator
 * defines an {@code API} connection (base URL + credentials) once and any policy can call a path
 * under it. The connection owns the host and the credentials; the step owns only the path and the
 * form fields, so a policy author can never aim the call somewhere else or read the secret.
 *
 * <p>Response handling is explicit rather than inferred, because the two useful behaviours destroy
 * different things when guessed wrong:
 *
 * <ul>
 *   <li>{@code report} (default) - the document continues untouched and the API's answer rides
 *       along in {@link AiToolResponseHeaders#TOOL_REPORT}. For call-outs that inspect or notify. A
 *       {@code requireTrue} field turns the answer into a gate: the named JSON verdict must be true
 *       or the step fails, so a scanner's "not clean" actually stops the run.
 *   <li>{@code replace} - the response body <em>becomes</em> the document. For call-outs that
 *       transform. Fails loudly if the API returns JSON or an empty body, instead of silently
 *       dropping the document from the pipeline.
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/integration")
@RequiredArgsConstructor
@Tag(name = "Integrations", description = "Third-party integration steps.")
public class ExternalApiCallController {

    static final String MODE_REPORT = "report";
    static final String MODE_REPLACE = "replace";

    /**
     * The report travels as an HTTP header, and Jetty caps a response header at 8KB by default. A
     * body larger than this is summarised rather than risking a header the container refuses to
     * write - which would fail the whole step over a merely verbose API.
     */
    static final int MAX_REPORT_BODY_CHARS = 4096;

    static final String BODY_MULTIPART = "multipart";
    static final String BODY_JSON = "json";
    static final String BODY_BINARY = "binary";

    /** Field (multipart) and property (json) the auto-populated context is offered under. */
    static final String CONTEXT_FIELD = "stirlingContext";

    private final ApiConnectionResolver connectionResolver;
    private final ExternalApiCaller caller;
    private final ObjectMapper objectMapper;
    private final TempFileManager tempFileManager;
    private final ApplicationProperties applicationProperties;

    @PostMapping(value = "/external-api-call", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Send the document to an external API",
            description =
                    "Sends the document to a path under a stored API connection's base URL and"
                            + " either records the response as a step report or replaces the"
                            + " document with it. Fields, path and headers may reference"
                            + " {{document.*}}, {{classification.*}}, {{sensitivityLabel.*}} and"
                            + " {{run.*}}. Type:SISO")
    public ResponseEntity<Resource> call(
            @RequestParam("fileInput") MultipartFile fileInput,
            @RequestParam("connectionId") String connectionId,
            @RequestParam(value = "path", required = false) String path,
            @RequestParam(value = "method", defaultValue = "POST") String method,
            @RequestParam(value = "bodyMode", defaultValue = BODY_MULTIPART) String bodyMode,
            @RequestParam(value = "fileFieldName", defaultValue = "file") String fileFieldName,
            @RequestParam(value = "responseMode", defaultValue = MODE_REPORT) String responseMode,
            @RequestParam(value = "resultUrlPath", required = false) String resultUrlPath,
            @RequestParam(value = "resultUrlHeader", required = false) String resultUrlHeader,
            @RequestParam(value = "responseSelect", required = false) String responseSelect,
            @RequestParam(value = "requireTrue", required = false) String requireTrue,
            @RequestParam(value = "fields", required = false) String fields,
            @RequestParam(value = "bodyTemplate", required = false) String bodyTemplate,
            @RequestParam(value = "headers", required = false) String headers,
            @RequestParam(value = "includeContext", defaultValue = "false") boolean includeContext,
            @RequestParam(value = "includeFile", defaultValue = "true") boolean includeFile,
            @RequestHeader(value = InternalApiClient.POLICY_NAME_HEADER, required = false)
                    String policyName,
            @RequestHeader(value = AutomationRunContext.RUN_ID_HEADER, required = false)
                    String runId)
            throws IOException {

        String mode = normalise(responseMode, MODE_REPORT, MODE_REPORT, MODE_REPLACE);
        String body = normalise(bodyMode, BODY_MULTIPART, BODY_MULTIPART, BODY_JSON, BODY_BINARY);
        String verb = parseMethod(method);

        Long id = ApiConnectionResolver.connectionId(connectionId);
        if (id == null) {
            throw new IllegalArgumentException("'connectionId' is required");
        }
        ApiConnectionSettings settings = connectionResolver.resolve(id);

        String filename = safeFileName(fileInput.getOriginalFilename());
        String contentType =
                fileInput.getContentType() == null
                        ? MediaType.APPLICATION_OCTET_STREAM_VALUE
                        : fileInput.getContentType();
        byte[] content = fileInput.getBytes();

        ObjectNode context =
                DocumentContext.build(fileInput, content, policyName, runId, objectMapper);

        ExternalApiCaller.Response response =
                caller.dispatch(
                        settings,
                        verb,
                        Placeholders.resolve(path, context, Placeholders.Escaping.URL_PATH),
                        buildBody(
                                body,
                                bodyTemplate,
                                includeFile,
                                includeContext,
                                context,
                                fileFieldName,
                                filename,
                                contentType,
                                content,
                                resolveAll(parseJsonObject(fields, "fields"), context)),
                        validatedHeaders(resolveAll(parseJsonObject(headers, "headers"), context)));

        if (!response.isSuccess()) {
            // Fail the step: a policy that silently continued past a rejected call-out would
            // deliver documents the external system believes it never approved.
            throw new IOException(
                    "External API returned HTTP " + response.status() + summarise(response));
        }

        enforceVerdict(response, requireTrue);

        return MODE_REPLACE.equals(mode)
                ? replaceDocument(
                        settings,
                        response,
                        filename,
                        resultUrlPath,
                        resultUrlHeader,
                        responseSelect)
                : reportOnly(fileInput, filename, contentType, response);
    }

    /**
     * Assemble the outbound body.
     *
     * <ul>
     *   <li>{@code multipart} - the file plus form fields, what most upload APIs expect.
     *   <li>{@code json} - a JSON object of the fields, with the context merged in and the file
     *       base64'd under {@code content}. For APIs that take a document as JSON, and for
     *       notify-style call-outs (with {@code includeFile=false}) that want the facts only.
     *   <li>{@code binary} - the raw bytes as the body. For APIs that want the file and nothing
     *       else; fields would have nowhere to go, so they are refused rather than dropped.
     * </ul>
     */
    private ExternalApiCaller.Body buildBody(
            String bodyMode,
            String bodyTemplate,
            boolean includeFile,
            boolean includeContext,
            ObjectNode context,
            String fileFieldName,
            String filename,
            String contentType,
            byte[] content,
            Map<String, String> fields)
            throws IOException {

        if (bodyTemplate != null && !bodyTemplate.isBlank()) {
            return templatedBody(bodyTemplate, context, filename, contentType, content);
        }
        switch (bodyMode) {
            case BODY_BINARY -> {
                if (!fields.isEmpty()) {
                    throw new IllegalArgumentException(
                            "bodyMode 'binary' sends only the document, so 'fields' cannot be"
                                    + " sent; use 'headers' instead, or bodyMode 'multipart'.");
                }
                if (!includeFile) {
                    throw new IllegalArgumentException(
                            "bodyMode 'binary' with includeFile=false would send an empty body");
                }
                return ExternalApiCaller.raw(contentType, content);
            }
            case BODY_JSON -> {
                ObjectNode json = objectMapper.createObjectNode();
                fields.forEach(json::put);
                if (includeContext) {
                    json.setAll(context);
                }
                if (includeFile) {
                    json.put("filename", filename);
                    json.put("contentType", contentType);
                    json.put("content", Base64.getEncoder().encodeToString(content));
                }
                return ExternalApiCaller.raw(
                        MediaType.APPLICATION_JSON_VALUE, objectMapper.writeValueAsBytes(json));
            }
            default -> {
                Map<String, String> all = new LinkedHashMap<>(fields);
                if (includeContext) {
                    all.put(CONTEXT_FIELD, objectMapper.writeValueAsString(context));
                }
                if (!includeFile) {
                    // Fields-only multipart: a notify-style call-out that wants the facts, not
                    // the document.
                    MultipartBody body = new MultipartBody();
                    body.addFields(all);
                    return new ExternalApiCaller.Body(body.contentType(), body.build());
                }
                return ExternalApiCaller.multipart(
                        fileFieldName, filename, contentType, content, all);
            }
        }
    }

    /**
     * A caller-shaped JSON body: the template is resolved against the context, so an arbitrary
     * vendor payload can be expressed as config. {@code {{document.base64}}} carries the file
     * itself, which is how APIs that take a document nested inside a JSON document are reached.
     *
     * <p>The base64 is added to a copy of the context rather than the context proper: it is the
     * size of the file, and {@code stirlingContext} must not silently grow by a whole document.
     */
    private ExternalApiCaller.Body templatedBody(
            String bodyTemplate,
            ObjectNode context,
            String filename,
            String contentType,
            byte[] content)
            throws IOException {
        JsonNode template;
        try {
            template = objectMapper.readTree(bodyTemplate);
        } catch (Exception e) {
            throw new IllegalArgumentException("api step 'bodyTemplate' must be valid JSON", e);
        }
        ObjectNode withFile = context.deepCopy();
        ObjectNode document = (ObjectNode) withFile.get("document");
        if (document != null) {
            document.put("base64", Base64.getEncoder().encodeToString(content));
            document.put("safeFilename", filename);
            document.put("resolvedContentType", contentType);
        }
        JsonNode resolved = Placeholders.resolveTree(template, withFile);
        return ExternalApiCaller.raw(
                MediaType.APPLICATION_JSON_VALUE, objectMapper.writeValueAsBytes(resolved));
    }

    /** Resolve every value's placeholders against the context. */
    private Map<String, String> resolveAll(Map<String, String> values, ObjectNode context) {
        Map<String, String> out = new LinkedHashMap<>();
        values.forEach(
                (key, value) ->
                        out.put(
                                key,
                                Placeholders.resolve(value, context, Placeholders.Escaping.NONE)));
        return out;
    }

    /** Per-step headers, held to the same rules as a connection's static headers. */
    private Map<String, String> validatedHeaders(Map<String, String> headers) {
        headers.forEach(
                (name, value) -> {
                    if (!ExternalApiHeaders.isValidName(name)) {
                        throw new IllegalArgumentException(
                                "api step 'headers' has an invalid header name: " + name);
                    }
                    if (ExternalApiHeaders.isReserved(name)) {
                        throw new IllegalArgumentException(
                                "api step 'headers' must not set '"
                                        + name
                                        + "'; it is set by the connection or the client");
                    }
                    if (!ExternalApiHeaders.isValidValue(value)) {
                        // A resolved placeholder could carry a newline out of document metadata.
                        throw new IllegalArgumentException(
                                "api step 'headers' has an invalid value for '" + name + "'");
                    }
                });
        return headers;
    }

    private static String parseMethod(String method) {
        String verb = method == null ? "POST" : method.trim().toUpperCase(Locale.ROOT);
        // Only the verbs that carry a body; GET/DELETE would silently drop the document.
        if (!List.of("POST", "PUT", "PATCH").contains(verb)) {
            throw new IllegalArgumentException(
                    "'method' must be POST, PUT or PATCH; got " + method);
        }
        return verb;
    }

    private static String normalise(String value, String fallback, String... allowed) {
        String out =
                value == null || value.isBlank() ? fallback : value.trim().toLowerCase(Locale.ROOT);
        if (!List.of(allowed).contains(out)) {
            throw new IllegalArgumentException(
                    "must be one of " + String.join(", ", allowed) + "; got " + value);
        }
        return out;
    }

    /**
     * Turn the response into the document that continues down the pipeline.
     *
     * <p>Three shapes of answer are accepted, because real APIs use all three: the document inline,
     * a URL to fetch it from, or an archive to pick it out of. Anything else fails the step rather
     * than putting a non-document into the pipeline for a later step to trip over.
     */
    private ResponseEntity<Resource> replaceDocument(
            ApiConnectionSettings settings,
            ExternalApiCaller.Response response,
            String requestFilename,
            String resultUrlPath,
            String resultUrlHeader,
            String responseSelect)
            throws IOException {

        ExternalApiCaller.Response payload = response;
        boolean followed = false;
        String url = resultUrl(response, resultUrlPath, resultUrlHeader);
        if (url != null) {
            // The URL came out of the response, so ResultUrls decides whether it may be fetched.
            payload =
                    caller.getResult(
                            settings, ResultUrls.validate(settings, url, applicationProperties));
            followed = true;
            if (!payload.isSuccess()) {
                throw new IOException(
                        "Fetching the API's result URL returned HTTP " + payload.status());
            }
        }

        if (payload.body().length == 0) {
            throw new IOException(
                    "External API returned an empty body, so there is no document to replace with;"
                            + " use responseMode=report to keep the original.");
        }
        if (payload.isJson() && !followed) {
            throw new IOException(
                    "External API returned JSON, which cannot replace the document. Use"
                            + " responseMode=report to keep the original and record the answer, or"
                            + " set resultUrlPath if the JSON points at the document.");
        }

        String filename = ResultFiles.nameFor(payload, requestFilename);
        Resource result = ResultFiles.asResource(payload.body(), filename);

        if (ResultFiles.isArchive(result)) {
            if (responseSelect == null || responseSelect.isBlank()) {
                // Handing a .zip to a step that expects a PDF fails later and more obscurely.
                throw new IOException(
                        "External API returned an archive; set 'responseSelect' (e.g. *.pdf, or an"
                                + " index) to say which entry becomes the document.");
            }
            result = ResultFiles.selectFromArchive(result, responseSelect, tempFileManager);
            filename = result.getFilename();
        } else if (responseSelect != null && !responseSelect.isBlank()) {
            throw new IOException(
                    "'responseSelect' was set but the API returned a single file, not an archive");
        }

        MediaType type =
                payload.contentType() == null || ResultFiles.isArchiveName(filename)
                        ? MediaType.APPLICATION_OCTET_STREAM
                        : MediaType.parseMediaType(payload.contentType().split(";")[0].trim());
        return ResponseEntity.ok()
                .contentType(type)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .body(result);
    }

    /** The result URL the API pointed at, from the body or a header; null when neither is set. */
    private String resultUrl(
            ExternalApiCaller.Response response, String resultUrlPath, String resultUrlHeader) {
        if (resultUrlHeader != null && !resultUrlHeader.isBlank()) {
            String value = response.header(resultUrlHeader.trim());
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException(
                        "'resultUrlHeader' names '"
                                + resultUrlHeader
                                + "' but the response had no such header");
            }
            return value;
        }
        if (resultUrlPath == null || resultUrlPath.isBlank()) {
            return null;
        }
        JsonNode node = response.bodyAsJson(objectMapper);
        for (String segment : resultUrlPath.trim().split("\\.")) {
            if (node == null) {
                break;
            }
            node = node.get(segment);
        }
        if (node == null || !node.isValueNode() || node.asString().isBlank()) {
            throw new IllegalArgumentException(
                    "'resultUrlPath' found no URL at '" + resultUrlPath + "' in the response");
        }
        return node.asString();
    }

    /**
     * Gate the run on a boolean verdict in the API's JSON answer (e.g. Cloudmersive's {@code
     * CleanResult}). When {@code requireTrue} names a field - dotted for a nested one - that field
     * must be JSON {@code true}, or the step fails so the document is parked rather than delivered.
     * Fail-closed: a missing field, a non-boolean, a false, or a non-JSON body all stop the run.
     * This is what makes a scanner's "not clean" actually stop the pipeline.
     */
    private void enforceVerdict(ExternalApiCaller.Response response, String requireTrue)
            throws IOException {
        if (requireTrue == null || requireTrue.isBlank()) {
            return;
        }
        JsonNode node = response.isJson() ? response.bodyAsJson(objectMapper) : null;
        for (String segment : requireTrue.trim().split("\\.")) {
            if (node == null) {
                break;
            }
            node = node.get(segment);
        }
        if (node == null || !node.asBoolean(false)) {
            throw new IOException(
                    "External API verdict '"
                            + requireTrue.trim()
                            + "' was not true"
                            + summarise(response)
                            + "; the document was not approved, so the run was stopped.");
        }
    }

    /** The document passes through; the API's answer rides in the report header. */
    private ResponseEntity<Resource> reportOnly(
            MultipartFile fileInput,
            String filename,
            String contentType,
            ExternalApiCaller.Response response)
            throws IOException {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .header(AiToolResponseHeaders.TOOL_REPORT, buildReport(response))
                .body(new ByteArrayResource(fileInput.getBytes()));
    }

    /** A JSON object describing the call, small enough to survive as a header. */
    private String buildReport(ExternalApiCaller.Response response) {
        ObjectNode report = objectMapper.createObjectNode();
        report.put("status", response.status());
        report.put("contentType", response.contentType());
        if (response.isJson()) {
            try {
                JsonNode parsed = objectMapper.readTree(response.bodyAsText());
                String rendered = objectMapper.writeValueAsString(parsed);
                if (rendered.length() <= MAX_REPORT_BODY_CHARS) {
                    report.set("body", parsed);
                } else {
                    report.put("bodyTruncated", true);
                    report.put("body", rendered.substring(0, MAX_REPORT_BODY_CHARS));
                }
            } catch (Exception e) {
                // Content-Type said JSON but the body is not; keep the step alive and say so.
                report.put("bodyParseError", e.getMessage());
                report.put("body", truncate(response.bodyAsText()));
            }
        } else {
            report.put("bodyBytes", response.body().length);
        }
        return objectMapper.writeValueAsString(report);
    }

    /** A JSON object of string values, e.g. {@code {"policy":"strict"}}. */
    private Map<String, String> parseJsonObject(String json, String what) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        Map<String, Object> raw;
        try {
            raw =
                    objectMapper.readValue(
                            json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalArgumentException("api step '" + what + "' must be a JSON object", e);
        }
        Map<String, String> out = new LinkedHashMap<>();
        raw.forEach((key, value) -> out.put(key, value == null ? "" : value.toString()));
        return out;
    }

    private String summarise(ExternalApiCaller.Response response) {
        String text = truncate(response.bodyAsText());
        return text.isBlank() ? "" : ": " + text;
    }

    private static String truncate(String text) {
        if (text == null) {
            return "";
        }
        String oneLine = text.replaceAll("\\s+", " ").trim();
        return oneLine.length() <= MAX_REPORT_BODY_CHARS
                ? oneLine
                : oneLine.substring(0, MAX_REPORT_BODY_CHARS) + "…";
    }

    private static String safeFileName(String originalFilename) {
        String name = Filenames.toSimpleFileName(originalFilename);
        return (name == null || name.isBlank()) ? "document" : name;
    }
}
