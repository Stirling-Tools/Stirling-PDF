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
 * Azure AI Content Safety ({@code text:analyze}): paid, with severity levels and enterprise data
 * controls. One request per text; a text is flagged when any category reaches the configured
 * severity (0, 2, 4 or 6; 2 by default).
 */
public class AzureContentSafetyModeration implements StoreModeration {

    private static final String API_VERSION = "2024-09-01";

    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();
    private final URI endpoint;
    private final String apiKey;
    private final int severityThreshold;
    private final Duration timeout;

    public AzureContentSafetyModeration(
            HttpClient http,
            String endpoint,
            String apiKey,
            int severityThreshold,
            Duration timeout) {
        this.http = http;
        this.endpoint =
                URI.create(
                        endpoint.replaceAll("/+$", "")
                                + "/contentsafety/text:analyze?api-version="
                                + API_VERSION);
        this.apiKey = apiKey;
        this.severityThreshold = severityThreshold;
        this.timeout = timeout;
    }

    @Override
    public String name() {
        return "azure";
    }

    @Override
    public List<Verdict> check(List<String> texts) throws UnavailableException {
        List<Verdict> verdicts = new ArrayList<>(texts.size());
        for (String text : texts) {
            verdicts.add(checkOne(text));
        }
        return verdicts;
    }

    private Verdict checkOne(String text) throws UnavailableException {
        String body =
                mapper.writeValueAsString(
                        Map.of(
                                "text",
                                text,
                                "categories",
                                List.of("Hate", "SelfHarm", "Sexual", "Violence"),
                                "outputType",
                                "FourSeverityLevels"));
        HttpRequest request =
                HttpRequest.newBuilder(endpoint)
                        .timeout(timeout)
                        .header("Ocp-Apim-Subscription-Key", apiKey)
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                        .build();
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new UnavailableException("Azure Content Safety unreachable", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new UnavailableException("Azure Content Safety interrupted", e);
        }
        if (response.statusCode() != 200) {
            throw new UnavailableException(
                    "Azure Content Safety answered " + response.statusCode());
        }
        JsonNode analysis = mapper.readTree(response.body()).path("categoriesAnalysis");
        if (!analysis.isArray()) {
            throw new UnavailableException("Azure Content Safety returned an unexpected body");
        }
        String worst = null;
        int worstSeverity = -1;
        for (JsonNode category : analysis) {
            int severity = category.path("severity").asInt(0);
            if (severity >= severityThreshold && severity > worstSeverity) {
                worst = category.path("category").asString("");
                worstSeverity = severity;
            }
        }
        return worst == null
                ? Verdict.CLEAN
                : new Verdict(true, StoreContentCheck.plainCategory(worst));
    }
}
