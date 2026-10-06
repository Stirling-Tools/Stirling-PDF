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

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;

/**
 * Downloads a file a chat app attached to a tool call (ChatGPT {@code openai/fileParams}). Only
 * HTTPS URLs on {@code mcp.fileUrlAllowedHosts} that resolve to public addresses are fetched.
 */
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
            throw new FetchException("The attachment URL is not valid.");
        }
        String host = uri.getHost();
        if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null) {
            throw new FetchException("Attachment URLs must use HTTPS.");
        }
        if (!isAllowedHost(host, mcp.getFileUrlAllowedHosts())) {
            throw new FetchException(
                    "Attachments from '" + host + "' are not accepted by this server.");
        }
        if (GeneralUtils.isDisallowedNetworkLocation(host)) {
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
            if (h.equals(a) || h.endsWith("." + a)) {
                return true;
            }
        }
        return false;
    }

    private HttpResponse<InputStream> send(URI uri) throws FetchException {
        HttpRequest request =
                HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(60)).GET().build();
        try {
            return client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (IOException e) {
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
