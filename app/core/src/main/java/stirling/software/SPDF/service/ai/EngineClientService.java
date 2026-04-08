package stirling.software.SPDF.service.ai;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import stirling.software.SPDF.model.ai.AgentInfo;
import stirling.software.SPDF.model.ai.ChatRequest;

import tools.jackson.databind.ObjectMapper;

/**
 * Client for communicating with the Python AI engine. Uses java.net.http.HttpClient (built into
 * Java 21) — no extra dependencies.
 */
@Service
public class EngineClientService {

    private static final Logger log = LoggerFactory.getLogger(EngineClientService.class);

    private final String engineBaseUrl;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public EngineClientService(
            @Value("${stirling.ai.engine.url:http://localhost:5001}") String engineBaseUrl,
            ObjectMapper objectMapper) {
        this.engineBaseUrl = engineBaseUrl;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    /**
     * Open an SSE stream to the Python engine's chat endpoint. Returns the raw InputStream of SSE
     * events.
     */
    public InputStream streamChat(ChatRequest request) throws Exception {
        String json = objectMapper.writeValueAsString(request);
        log.debug("Streaming chat to engine: {}", json);

        HttpRequest httpRequest =
                HttpRequest.newBuilder()
                        .uri(URI.create(engineBaseUrl + "/api/v1/chat/stream"))
                        .header("Content-Type", "application/json")
                        .header("Accept", "text/event-stream")
                        .POST(HttpRequest.BodyPublishers.ofString(json))
                        .timeout(Duration.ofMinutes(5))
                        .build();

        HttpResponse<InputStream> response =
                httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofInputStream());

        if (response.statusCode() != 200) {
            // Drain and close the body to avoid leaking the HTTP connection.
            try (InputStream body = response.body()) {
                body.readAllBytes();
            } catch (Exception ignored) {
                // Best-effort drain.
            }
            throw new RuntimeException("Engine returned status " + response.statusCode());
        }

        return response.body();
    }

    /** Fetch the list of available agents from the Python engine. */
    public List<AgentInfo> listAgents() throws Exception {
        HttpRequest httpRequest =
                HttpRequest.newBuilder()
                        .uri(URI.create(engineBaseUrl + "/api/v1/chat/agents"))
                        .header("Accept", "application/json")
                        .GET()
                        .timeout(Duration.ofSeconds(10))
                        .build();

        HttpResponse<String> response =
                httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() != 200) {
            throw new RuntimeException("Engine returned status " + response.statusCode());
        }

        return Arrays.asList(objectMapper.readValue(response.body(), AgentInfo[].class));
    }
}
