package stirling.software.proprietary.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Whether the Stirling Cloud host is up at all, via its unauthenticated status endpoint. Tells a
 * Stirling outage apart from a broken link, which look the same from the gateway.
 */
@Slf4j
@Service
public class CloudStatusProbe {

    static final String STATUS_PATH = "/api/v1/info/status";

    private final HttpClient httpClient;
    private final AiEngineRouter router;

    @Autowired
    public CloudStatusProbe(AiEngineRouter router) {
        this(
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(5))
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build(),
                router);
    }

    /** Package-private: lets tests point at a stub host. */
    CloudStatusProbe(HttpClient httpClient, AiEngineRouter router) {
        this.httpClient = httpClient;
        this.router = router;
    }

    /** Probes only the validated configured host, without following redirects. Never throws. */
    public boolean isUp() {
        try {
            String baseUrl = router.cloudHost();
            if (baseUrl.isEmpty()) {
                return false;
            }
            HttpRequest request =
                    HttpRequest.newBuilder()
                            .uri(URI.create(baseUrl + STATUS_PATH))
                            .timeout(Duration.ofSeconds(5))
                            .GET()
                            .build();
            int code =
                    httpClient.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
            return code >= 200 && code < 300;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (IOException | RuntimeException e) {
            log.debug("Stirling Cloud status probe failed", e);
            return false;
        }
    }
}
