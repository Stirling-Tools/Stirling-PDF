package stirling.software.proprietary.mcp.oauth;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.GeneralUtils;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Resolves Client ID Metadata Documents: an https client_id URL whose JSON describes the client.
 * Fetches are SSRF-guarded (https, public addresses only, capped size, revalidated redirects).
 */
@Slf4j
@Component
@Conditional(McpBuiltinModeCondition.class)
public class McpClientMetadataFetcher {

    /** The client as described by its metadata document. */
    public record ClientMetadata(String clientId, String clientName, List<String> redirectUris) {}

    static final int MAX_BYTES = 64 * 1024;
    private static final int MAX_REDIRECTS = 3;
    private static final long BODY_TIMEOUT_SECONDS = 10;
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Set<String> SECRET_AUTH_METHODS =
            Set.of("client_secret_basic", "client_secret_post", "client_secret_jwt");

    private final HttpClient client;
    private final Cache<String, ClientMetadata> cache =
            Caffeine.newBuilder().maximumSize(1_000).expireAfterWrite(15, TimeUnit.MINUTES).build();

    public McpClientMetadataFetcher() {
        this.client =
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(5))
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build();
    }

    /** True when the client_id has the shape of a metadata document URL. */
    public static boolean isMetadataClientId(String clientId) {
        return clientId != null && clientId.regionMatches(true, 0, "https://", 0, 8);
    }

    public ClientMetadata fetch(String clientId) {
        ClientMetadata cached = cache.getIfPresent(clientId);
        if (cached != null) {
            return cached;
        }
        URI uri = validateClientIdUrl(clientId);
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            requirePublicHost(uri);
            HttpResponse<InputStream> response = send(uri);
            int status = response.statusCode();
            if (status >= 300 && status < 400) {
                String location = response.headers().firstValue("Location").orElse(null);
                closeQuietly(response.body());
                if (location == null) {
                    throw invalidClient("The client metadata URL redirected without a target.");
                }
                uri = uri.resolve(location);
                if (!"https".equalsIgnoreCase(uri.getScheme())) {
                    throw invalidClient("The client metadata URL redirected off https.");
                }
                continue;
            }
            if (status != 200) {
                closeQuietly(response.body());
                throw invalidClient("Could not fetch the client metadata (HTTP " + status + ").");
            }
            ClientMetadata metadata = parse(clientId, readWithDeadline(response.body()));
            cache.put(clientId, metadata);
            return metadata;
        }
        throw invalidClient("The client metadata URL redirected too many times.");
    }

    /** Shape rules from the CIMD draft: https, a path, no fragment, credentials or dot segments. */
    static URI validateClientIdUrl(String clientId) {
        URI uri;
        try {
            uri = new URI(clientId);
        } catch (Exception e) {
            throw invalidClient("client_id is not a valid URL.");
        }
        String path = uri.getRawPath();
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || uri.getHost() == null
                || uri.getRawUserInfo() != null
                || uri.getRawFragment() != null
                || path == null
                || path.isEmpty()
                || "/".equals(path)) {
            throw invalidClient("client_id URL must be https with a path and no fragment.");
        }
        for (String segment : path.split("/")) {
            if (".".equals(segment) || "..".equals(segment)) {
                throw invalidClient("client_id URL must not contain dot segments.");
            }
        }
        return uri;
    }

    static ClientMetadata parse(String clientId, byte[] body) {
        JsonNode doc;
        try {
            doc = MAPPER.readTree(body);
        } catch (Exception e) {
            throw invalidClient("Client metadata is not valid JSON.");
        }
        if (doc == null || !doc.isObject()) {
            throw invalidClient("Client metadata must be a JSON object.");
        }
        // The document must name itself, or any host could claim another client's identity.
        if (!clientId.equals(text(doc, "client_id"))) {
            throw invalidClient("Client metadata client_id does not match its URL.");
        }
        if (doc.has("client_secret") || doc.has("client_secret_expires_at")) {
            throw invalidClient("Client metadata must not contain a client secret.");
        }
        String authMethod = text(doc, "token_endpoint_auth_method");
        if (authMethod != null
                && SECRET_AUTH_METHODS.contains(authMethod.toLowerCase(Locale.ROOT))) {
            throw invalidClient("Client metadata must use a public token_endpoint_auth_method.");
        }
        List<String> redirectUris = new ArrayList<>();
        JsonNode uris = doc.get("redirect_uris");
        if (uris != null && uris.isArray()) {
            uris.forEach(u -> redirectUris.add(u.asString()));
        }
        if (redirectUris.isEmpty()) {
            throw invalidClient("Client metadata lists no redirect_uris.");
        }
        return new ClientMetadata(clientId, text(doc, "client_name"), redirectUris);
    }

    private void requirePublicHost(URI uri) {
        if (!isPublicHost(uri.getHost())) {
            log.warn(
                    "MCP client metadata refused: '{}' resolves to a private address",
                    uri.getHost());
            throw invalidClient("The client metadata host resolves to a private address.");
        }
    }

    boolean isPublicHost(String host) {
        return host != null && !GeneralUtils.isDisallowedNetworkLocation(host);
    }

    HttpResponse<InputStream> send(URI uri) {
        HttpRequest request =
                HttpRequest.newBuilder(uri)
                        .timeout(Duration.ofSeconds(10))
                        .header("Accept", "application/json")
                        .GET()
                        .build();
        try {
            return client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (IOException e) {
            log.warn("MCP client metadata fetch from '{}' failed: {}", uri.getHost(), e.toString());
            throw invalidClient("Could not fetch the client metadata.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw invalidClient("Client metadata fetch was interrupted.");
        }
    }

    /** The request timeout only covers headers, so a trickled body needs its own deadline. */
    private static byte[] readWithDeadline(InputStream in) {
        CompletableFuture<byte[]> read = CompletableFuture.supplyAsync(() -> readCapped(in));
        try {
            return read.get(BODY_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            closeQuietly(in);
            throw invalidClient("Client metadata download timed out.");
        } catch (ExecutionException e) {
            if (e.getCause() instanceof McpOAuthException oauth) {
                throw oauth;
            }
            throw invalidClient("Could not read the client metadata.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            closeQuietly(in);
            throw invalidClient("Client metadata fetch was interrupted.");
        }
    }

    static byte[] readCapped(InputStream in) {
        try (in) {
            byte[] body = in.readNBytes(MAX_BYTES + 1);
            if (body.length > MAX_BYTES) {
                throw invalidClient("Client metadata is larger than " + MAX_BYTES + " bytes.");
            }
            return body;
        } catch (IOException e) {
            throw invalidClient("Could not read the client metadata.");
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isString()) {
            return null;
        }
        String s = value.asString().trim();
        return s.isEmpty() ? null : s;
    }

    private static McpOAuthException invalidClient(String description) {
        return new McpOAuthException("invalid_client", description, 400);
    }

    private static void closeQuietly(InputStream in) {
        try {
            in.close();
        } catch (IOException ignored) {
            // Discarding a body we no longer need.
        }
    }
}
