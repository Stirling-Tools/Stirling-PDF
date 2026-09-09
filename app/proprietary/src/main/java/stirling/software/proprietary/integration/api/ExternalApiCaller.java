package stirling.software.proprietary.integration.api;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Performs the outbound call for an {@code API} connection.
 *
 * <p>Follows the established self-hosted outbound pattern (JDK {@link HttpClient}; see {@code
 * AccountLinkClient}): the client is injectable so tests can drive a real local server without
 * reaching the network.
 */
@Slf4j
@Service
public class ExternalApiCaller {

    /**
     * Cap on a response we will read into memory. An external API returning something enormous is a
     * misconfiguration, and without a cap it would be a trivial way to OOM the server.
     */
    static final int MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);

    private final HttpClient httpClient;
    private final ApplicationProperties applicationProperties;
    private final ApiTokenCache tokenCache;

    @Autowired
    public ExternalApiCaller(
            ApplicationProperties applicationProperties, ObjectMapper objectMapper) {
        this(
                HttpClient.newBuilder()
                        .connectTimeout(CONNECT_TIMEOUT)
                        // Following a redirect would re-target the request at a host the base URL
                        // never authorised, undoing ExternalApiPaths. Let the caller see the 3xx.
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build(),
                applicationProperties,
                objectMapper);
    }

    ExternalApiCaller(
            HttpClient httpClient,
            ApplicationProperties applicationProperties,
            ObjectMapper objectMapper) {
        this.httpClient = httpClient;
        this.applicationProperties = applicationProperties;
        this.tokenCache = new ApiTokenCache(httpClient, objectMapper);
    }

    /** What the external API sent back, before the step decides what to do with it. */
    public record Response(
            int status, String contentType, byte[] body, Map<String, String> headers) {

        public Response {
            headers = headers == null ? Map.of() : Map.copyOf(headers);
        }

        /** A response header by name, case-insensitively; null when absent. */
        public String header(String name) {
            for (Map.Entry<String, String> entry : headers.entrySet()) {
                if (entry.getKey().equalsIgnoreCase(name)) {
                    return entry.getValue();
                }
            }
            return null;
        }

        JsonNode bodyAsJson(ObjectMapper objectMapper) {
            try {
                return objectMapper.readTree(bodyAsText());
            } catch (RuntimeException e) {
                return null;
            }
        }

        public boolean isSuccess() {
            return status >= 200 && status < 300;
        }

        public boolean isJson() {
            return contentType != null && contentType.toLowerCase().contains("json");
        }

        public String bodyAsText() {
            return new String(body, StandardCharsets.UTF_8);
        }
    }

    /**
     * POST a document to {@code path} under the connection's base URL as multipart/form-data.
     *
     * @throws IOException on transport failure or an oversized response
     */
    public Response postFile(
            ApiConnectionSettings settings,
            String path,
            String fileFieldName,
            String filename,
            String fileContentType,
            byte[] content,
            Map<String, String> fields)
            throws IOException {
        return dispatch(
                settings,
                "POST",
                path,
                multipart(fileFieldName, filename, fileContentType, content, fields),
                Map.of());
    }

    /** A request body plus the Content-Type that describes it. */
    record Body(String contentType, HttpRequest.BodyPublisher publisher) {}

    static Body multipart(
            String fileFieldName,
            String filename,
            String fileContentType,
            byte[] content,
            Map<String, String> fields)
            throws IOException {
        MultipartBody body = new MultipartBody();
        body.addFields(fields);
        body.addFile(fileFieldName, filename, fileContentType, content);
        return new Body(body.contentType(), body.build());
    }

    /** A body of caller-built bytes, e.g. a JSON document or the raw file. */
    static Body raw(String contentType, byte[] content) {
        return new Body(contentType, HttpRequest.BodyPublishers.ofByteArray(content));
    }

    /**
     * Send {@code body} to {@code path} under the connection's base URL.
     *
     * @param method POST, PUT or PATCH - the verbs that carry a body
     * @param extraHeaders per-step headers, already validated by the caller
     */
    public Response dispatch(
            ApiConnectionSettings settings,
            String method,
            String path,
            Body body,
            Map<String, String> extraHeaders)
            throws IOException {

        URI target = ExternalApiPaths.resolve(settings.baseUri(), path);
        // Re-check at dispatch: save-time validation cannot see a DNS record re-pointed at a
        // private address afterwards.
        ApiIntegrationValidator.requirePublicHost(
                settings, applicationProperties, "API connection base URL");

        Response response = attempt(settings, method, target, body, extraHeaders);
        if (response.status() == 401 && settings.authType() == ApiAuthType.TOKEN_LOGIN) {
            // The cached token was rejected - expired early, or revoked. One fresh login and
            // one retry; if that also 401s the credentials are wrong and the step says so.
            log.debug("[external-api] token rejected by {}; re-authenticating", target.getHost());
            tokenCache.invalidate(settings);
            response = attempt(settings, method, target, body, extraHeaders);
        }
        return response;
    }

    private Response attempt(
            ApiConnectionSettings settings,
            String method,
            URI target,
            Body body,
            Map<String, String> extraHeaders)
            throws IOException {
        HttpRequest.Builder request =
                HttpRequest.newBuilder(target)
                        .timeout(Duration.ofSeconds(settings.timeoutSeconds()))
                        .header("Content-Type", body.contentType())
                        .method(method, body.publisher());
        applyHeaders(request, settings);
        // Step headers last so a step can override a connection default, but never the auth
        // header: ExternalApiHeaders rejects reserved names before we get here.
        extraHeaders.forEach(request::header);
        return send(httpClient, request.build(), target);
    }

    /**
     * GET an absolute result URL the API pointed us at.
     *
     * <p>Takes a {@link URI} rather than a string so it cannot be called with something unchecked:
     * the only way to obtain one is {@link ResultUrls#validate}, which is where the host allowlist
     * lives. Credentials are deliberately not sent - the URL is usually a presigned link on another
     * host, and forwarding the connection's token there would leak it to a third party.
     */
    public Response getResult(ApiConnectionSettings settings, URI target) throws IOException {
        HttpRequest request =
                HttpRequest.newBuilder(target)
                        .timeout(Duration.ofSeconds(settings.timeoutSeconds()))
                        .GET()
                        .build();
        return send(httpClient, request, target);
    }

    /** GET {@code path} under the connection's base URL. */
    public Response get(ApiConnectionSettings settings, String path) throws IOException {
        URI target = ExternalApiPaths.resolve(settings.baseUri(), path);
        ApiIntegrationValidator.requirePublicHost(
                settings, applicationProperties, "API connection base URL");

        HttpRequest.Builder request =
                HttpRequest.newBuilder(target)
                        .timeout(Duration.ofSeconds(settings.timeoutSeconds()))
                        .GET();
        applyHeaders(request, settings);
        return send(httpClient, request.build(), target);
    }

    static Response send(HttpClient httpClient, HttpRequest request, URI target)
            throws IOException {
        HttpResponse<byte[]> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted calling " + safeTarget(target), e);
        } catch (IOException e) {
            // The message can carry the host but never the credentials, which live in headers.
            throw new IOException(
                    "Failed to call " + safeTarget(target) + ": " + e.getMessage(), e);
        }
        byte[] body = response.body() == null ? new byte[0] : response.body();
        if (body.length > MAX_RESPONSE_BYTES) {
            throw new IOException(
                    "Response from "
                            + safeTarget(target)
                            + " exceeds the "
                            + MAX_RESPONSE_BYTES
                            + " byte limit");
        }
        String contentType = response.headers().firstValue("content-type").orElse(null);
        Map<String, String> headers = new LinkedHashMap<>();
        response.headers()
                .map()
                .forEach((name, values) -> headers.put(name, String.join(", ", values)));
        log.debug("[external-api] {} -> HTTP {}", safeTarget(target), response.statusCode());
        return new Response(response.statusCode(), contentType, body, headers);
    }

    private void applyHeaders(HttpRequest.Builder request, ApiConnectionSettings settings)
            throws IOException {
        settings.headers().forEach(request::header);
        switch (settings.authType()) {
            case BEARER -> request.header("Authorization", "Bearer " + settings.token());
            case HEADER ->
                    request.header(
                            settings.headerName(),
                            settings.headerPrefix() == null
                                    ? settings.token()
                                    : settings.headerPrefix() + " " + settings.token());
            case BASIC ->
                    request.header(
                            "Authorization",
                            "Basic "
                                    + Base64.getEncoder()
                                            .encodeToString(
                                                    (settings.username()
                                                                    + ":"
                                                                    + settings.password())
                                                            .getBytes(StandardCharsets.UTF_8)));
            case TOKEN_LOGIN -> {
                Map.Entry<String, String> auth = tokenCache.authHeader(settings);
                request.header(auth.getKey(), auth.getValue());
            }
            case NONE -> {
                /* no credentials */
            }
        }
    }

    /** Scheme, host and path only: a query string could carry a token an operator put there. */
    private static String safeTarget(URI target) {
        return target.getScheme() + "://" + target.getAuthority() + target.getPath();
    }
}
