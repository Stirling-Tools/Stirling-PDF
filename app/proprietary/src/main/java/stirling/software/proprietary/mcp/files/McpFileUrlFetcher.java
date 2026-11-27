package stirling.software.proprietary.mcp.files;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;

/** Fetches chat-app attachments, only from allowlisted HTTPS hosts on public addresses. */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpFileUrlFetcher {

    private static final int MAX_REDIRECTS = 3;

    private final ApplicationProperties.Mcp mcp;
    private final HttpClient client;

    public McpFileUrlFetcher(ApplicationProperties applicationProperties) {
        this.mcp = applicationProperties.getMcp();
        this.client =
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(10))
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build();
    }

    /** A user-facing failure; the message is safe to return to the model. */
    public static class FetchException extends Exception {
        public FetchException(String message) {
            super(message);
        }
    }

    public byte[] fetch(String url) throws FetchException {
        URI uri = requireAllowed(url);
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            HttpResponse<InputStream> response = send(uri);
            int status = response.statusCode();
            if (status >= 300 && status < 400) {
                String location = response.headers().firstValue("Location").orElse(null);
                closeQuietly(response.body());
                if (location == null) {
                    throw new FetchException("The attachment URL redirected without a target.");
                }
                uri = requireAllowed(uri.resolve(location).toString());
                continue;
            }
            if (status != 200) {
                closeQuietly(response.body());
                log.warn(
                        "MCP attachment download from '{}' failed: HTTP {}", uri.getHost(), status);
                throw new FetchException(
                        "Could not download the attachment (HTTP " + status + ").");
            }
            return readCapped(response);
        }
        throw new FetchException("The attachment URL redirected too many times.");
    }

    URI requireAllowed(String url) throws FetchException {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            log.warn("MCP attachment refused: download URL is not a valid URI");
            throw new FetchException("The attachment URL is not valid.");
        }
        String host = uri.getHost();
        // Only scheme and host are logged: download URLs carry signed tokens.
        if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null) {
            log.warn(
                    "MCP attachment refused: scheme '{}' host '{}' is not HTTPS",
                    uri.getScheme(),
                    host);
            throw new FetchException("Attachment URLs must use HTTPS.");
        }
        if (!isAllowedHost(host, mcp.getFileUrlAllowedHosts())) {
            log.warn(
                    "MCP attachment refused: host '{}' is not in mcp.fileUrlAllowedHosts {}",
                    host,
                    mcp.getFileUrlAllowedHosts());
            throw new FetchException(
                    "Attachments from '" + host + "' are not accepted by this server.");
        }
        if (GeneralUtils.isDisallowedNetworkLocation(host)) {
            log.warn("MCP attachment refused: host '{}' resolves to a private address", host);
            throw new FetchException("The attachment host resolves to a private address.");
        }
        return uri;
    }

    static boolean isAllowedHost(String host, List<String> allowed) {
        String h = host.toLowerCase(Locale.ROOT);
        for (String entry : allowed) {
            if (entry == null || entry.isBlank()) {
                continue;
            }
            String a = entry.trim().toLowerCase(Locale.ROOT);
            // A lone "*" opts in to any public host; private addresses stay blocked.
            if ("*".equals(a)) {
                return true;
            }
            if (a.contains("*") ? matchesPattern(h, a) : h.equals(a) || h.endsWith("." + a)) {
                return true;
            }
        }
        return false;
    }

    /** Whole-host match where {@code *} stands for letters, digits or hyphens within one label. */
    private static boolean matchesPattern(String host, String pattern) {
        StringBuilder regex = new StringBuilder();
        for (String part : pattern.split("\\*", -1)) {
            if (!regex.isEmpty()) {
                regex.append("[a-z0-9-]*");
            }
            regex.append(Pattern.quote(part));
        }
        return host.matches(regex.toString());
    }

    private HttpResponse<InputStream> send(URI uri) throws FetchException {
        HttpRequest request =
                HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(60)).GET().build();
        try {
            return client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (IOException e) {
            log.warn("MCP attachment download from '{}' failed: {}", uri.getHost(), e.toString());
            throw new FetchException("Could not download the attachment.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new FetchException("Attachment download was interrupted.");
        }
    }

    private byte[] readCapped(HttpResponse<InputStream> response) throws FetchException {
        long max = mcp.getMaxFileUrlBytes();
        long declared = response.headers().firstValueAsLong("Content-Length").orElse(-1);
        try (InputStream in = response.body()) {
            if (declared > max) {
                throw new FetchException(tooLarge(max));
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            long total = 0;
            int n;
            while ((n = in.read(buf)) != -1) {
                total += n;
                if (total > max) {
                    throw new FetchException(tooLarge(max));
                }
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new FetchException("Could not download the attachment.");
        }
    }

    private static String tooLarge(long max) {
        return "The attachment is larger than this server accepts ("
                + (max / (1024 * 1024))
                + " MB).";
    }

    private static void closeQuietly(InputStream in) {
        try {
            in.close();
        } catch (IOException ignored) {
            // Discarding a redirect body.
        }
    }
}
