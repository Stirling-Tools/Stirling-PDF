package stirling.software.proprietary.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Slf4j
@Service
public class AiEngineClient {

    private final ApplicationProperties applicationProperties;
    private final HttpClient httpClient;

    @Autowired
    public AiEngineClient(ApplicationProperties applicationProperties) {
        this(
                applicationProperties,
                HttpClient.newBuilder()
                        .connectTimeout(
                                Duration.ofSeconds(
                                        applicationProperties.getAiEngine().getTimeoutSeconds()))
                        .build());
    }

    /** Package-private constructor that accepts an HttpClient directly; intended for tests. */
    AiEngineClient(ApplicationProperties applicationProperties, HttpClient httpClient) {
        this.applicationProperties = applicationProperties;
        this.httpClient = httpClient;
    }

    public String post(String path, String jsonBody) throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        if (!config.isEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine is not enabled");
        }

        String url = config.getUrl().stripTrailing() + path;
        log.debug("Proxying AI engine request to {}", url);

        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .timeout(Duration.ofSeconds(config.getTimeoutSeconds()))
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                        .build();

        HttpResponse<String> response = sendRequest(request);

        log.debug("AI engine responded with status {}", response.statusCode());
        checkResponseStatus(response);
        return response.body();
    }

    public String get(String path) throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        if (!config.isEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine is not enabled");
        }

        String url = config.getUrl().stripTrailing() + path;
        log.debug("Proxying AI engine GET request to {}", url);

        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Accept", "application/json")
                        .timeout(Duration.ofSeconds(config.getTimeoutSeconds()))
                        .GET()
                        .build();

        HttpResponse<String> response = sendRequest(request);

        log.debug("AI engine responded with status {}", response.statusCode());
        checkResponseStatus(response);
        return response.body();
    }

    private HttpResponse<String> sendRequest(HttpRequest request) throws IOException {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (HttpTimeoutException e) {
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "AI engine timed out", e);
        } catch (IOException e) {
            // Connection refused, DNS failure, socket reset, etc. — surface as
            // SERVICE_UNAVAILABLE so every caller of this client sees a structured
            // status rather than a raw 500 from an unhandled IOException.
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine unreachable: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine request was interrupted");
        }
    }

    private void checkResponseStatus(HttpResponse<String> response) {
        int status = response.statusCode();
        if (status >= 500) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "AI engine returned error: " + status);
        }
        if (status >= 400) {
            throw new ResponseStatusException(
                    HttpStatus.valueOf(status),
                    "AI engine returned client error: " + response.body());
        }
    }
}
