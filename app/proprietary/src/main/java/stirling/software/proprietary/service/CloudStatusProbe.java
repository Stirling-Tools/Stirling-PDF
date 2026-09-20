package stirling.software.proprietary.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Is Stirling Cloud itself answering?
 *
 * <p>Separate from every other AI probe because it asks a different question. The gateway probe
 * needs the device credential and tells you whether <em>your</em> server may use cloud AI; this one
 * is unauthenticated, hits the host's ordinary {@code /api/v1/info/status}, and tells you whether
 * the host is up at all. Without it an admin cannot tell a Stirling outage from a broken link, and
 * both look identical from the gateway.
 */
@Slf4j
@Service
public class CloudStatusProbe {

    static final String STATUS_PATH = "/api/v1/info/status";

    private final HttpClient httpClient;

    public CloudStatusProbe() {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
    }

    /** Package-private: lets tests point at a stub host. */
    CloudStatusProbe(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    /**
     * @param baseUrl the Stirling Cloud host, with no path
     * @return whether the host answered, never throwing - an outage is an answer, not a fault
     */
    public boolean isUp(String baseUrl) {
        if (baseUrl == null || baseUrl.isBlank()) {
            return false;
        }
        try {
            HttpRequest request =
                    HttpRequest.newBuilder()
                            .uri(URI.create(baseUrl.strip().replaceAll("/+$", "") + STATUS_PATH))
                            .timeout(Duration.ofSeconds(5))
                            .GET()
                            .build();
            int code = httpClient.send(request, HttpResponse.BodyHandlers.ofString()).statusCode();
            return code < 400;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (IOException | RuntimeException e) {
            log.debug("Stirling Cloud status probe failed for {}", baseUrl, e);
            return false;
        }
    }
}
