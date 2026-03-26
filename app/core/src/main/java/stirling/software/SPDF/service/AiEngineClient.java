package stirling.software.SPDF.service;

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
        this.httpClient = HttpClient.newBuilder().build();
    }

    public String post(String path, String jsonBody) throws IOException, InterruptedException {
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

        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        log.debug("AI engine responded with status {}", response.statusCode());

        if (response.statusCode() >= 500) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "AI engine returned error: " + response.statusCode());
        }

        return response.body();
    }

    public String get(String path) throws IOException, InterruptedException {
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

        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        log.debug("AI engine responded with status {}", response.statusCode());

        if (response.statusCode() >= 500) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "AI engine returned error: " + response.statusCode());
        }

        return response.body();
    }
}
