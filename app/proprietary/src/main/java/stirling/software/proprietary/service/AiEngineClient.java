package stirling.software.proprietary.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

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

    public AiEngineClient(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
        this.httpClient =
                HttpClient.newBuilder()
                        .connectTimeout(
                                Duration.ofSeconds(
                                        applicationProperties.getAiEngine().getTimeoutSeconds()))
                        .build();
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
