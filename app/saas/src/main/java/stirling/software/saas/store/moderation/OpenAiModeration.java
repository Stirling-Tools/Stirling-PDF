package stirling.software.saas.store.moderation;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * OpenAI's Moderation API ({@code POST /moderations}), free to call, multilingual (40 languages
 * evaluated for {@code omni-moderation-latest}). All of a listing's texts go in one request.
 */
public class OpenAiModeration implements StoreModeration {

    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();
    private final URI endpoint;
    private final String apiKey;
    private final String model;
    private final Duration timeout;

    public OpenAiModeration(
            HttpClient http, String baseUrl, String apiKey, String model, Duration timeout) {
        this.http = http;
        this.endpoint = URI.create(baseUrl.replaceAll("/+$", "") + "/moderations");
        this.apiKey = apiKey;
        this.model = model;
        this.timeout = timeout;
    }

    @Override
    public String name() {
        return "openai";
    }

    @Override
    public List<Verdict> check(List<String> texts) throws UnavailableException {
        if (texts.isEmpty()) {
            return List.of();
        }
        String body = mapper.writeValueAsString(Map.of("model", model, "input", texts));
        HttpRequest request =
                HttpRequest.newBuilder(endpoint)
                        .timeout(timeout)
                        .header("Authorization", "Bearer " + apiKey)
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                        .build();
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new UnavailableException("OpenAI moderation unreachable", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new UnavailableException("OpenAI moderation interrupted", e);
        }
        if (response.statusCode() != 200) {
            throw new UnavailableException("OpenAI moderation answered " + response.statusCode());
        }
        JsonNode results = mapper.readTree(response.body()).path("results");
        if (!results.isArray() || results.size() != texts.size()) {
            throw new UnavailableException("OpenAI moderation returned an unexpected body");
        }
        List<Verdict> verdicts = new ArrayList<>(texts.size());
        for (JsonNode result : results) {
            verdicts.add(
                    result.path("flagged").asBoolean(false)
                            ? new Verdict(true, topCategory(result))
                            : Verdict.CLEAN);
        }
        return verdicts;
    }

    /**
     * The flagged category with the highest score, as plain words: "self-harm/intent" -> "self
     * harm".
     */
    private static String topCategory(JsonNode result) {
        JsonNode categories = result.path("categories");
        JsonNode scores = result.path("category_scores");
        String best = null;
        double bestScore = -1;
        for (Map.Entry<String, JsonNode> entry : categories.properties()) {
            if (!entry.getValue().asBoolean(false)) {
                continue;
            }
            double score = scores.path(entry.getKey()).asDouble(0);
            if (score > bestScore) {
                best = entry.getKey();
                bestScore = score;
            }
        }
        return best == null ? null : StoreContentCheck.plainCategory(best.split("/")[0]);
    }
}
