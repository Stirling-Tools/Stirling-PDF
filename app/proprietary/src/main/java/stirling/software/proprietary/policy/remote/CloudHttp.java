package stirling.software.proprietary.policy.remote;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import java.util.Set;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

public final class CloudHttp {

    private static final int MAX_ATTEMPTS = 4;
    private static final Set<String> IDEMPOTENT = Set.of("GET", "HEAD", "PUT", "DELETE", "OPTIONS");
    private static final long MAX_RETRY_WAIT_SECONDS = 60;
    private static final ObjectMapper JSON = new ObjectMapper();

    private CloudHttp() {}

    public static HttpClient newClient() {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(20))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public static <T> HttpResponse<T> send(
            HttpClient http,
            HttpRequest request,
            HttpResponse.BodyHandler<T> handler,
            String service)
            throws IOException {
        for (int attempt = 1; ; attempt++) {
            HttpResponse<T> response;
            try {
                response = http.send(request, handler);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("Interrupted calling " + service, e);
            } catch (IOException e) {
                throw new IOException(
                        "Could not reach "
                                + service
                                + " ("
                                + (e.getMessage() == null
                                        ? e.getClass().getSimpleName()
                                        : e.getMessage())
                                + ")",
                        e);
            }
            int status = response.statusCode();
            boolean serverError = status == 500 || status == 502 || status == 503 || status == 504;
            boolean retry = status == 429 || (serverError && IDEMPOTENT.contains(request.method()));
            if (!retry || attempt >= MAX_ATTEMPTS) {
                return response;
            }
            if (response.body() instanceof InputStream stream) {
                stream.close();
            }
            long wait =
                    response.headers()
                            .firstValue("Retry-After")
                            .map(CloudHttp::seconds)
                            .orElse((long) attempt * 2);
            try {
                Thread.sleep(Duration.ofSeconds(Math.min(wait, MAX_RETRY_WAIT_SECONDS)));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("Interrupted waiting out " + service + " throttling", e);
            }
        }
    }

    public static InputStream download(
            HttpClient http, HttpResponse<InputStream> response, String what, String service)
            throws IOException {
        if (response.statusCode() == 200) {
            return response.body();
        }
        response.body().close();
        Optional<String> location = response.headers().firstValue("Location");
        if (response.statusCode() / 100 == 3 && location.isPresent()) {
            HttpResponse<InputStream> redirected =
                    send(
                            http,
                            HttpRequest.newBuilder(URI.create(location.get()))
                                    .timeout(Duration.ofMinutes(30))
                                    .GET()
                                    .build(),
                            HttpResponse.BodyHandlers.ofInputStream(),
                            service);
            if (redirected.statusCode() == 200) {
                return redirected.body();
            }
            redirected.body().close();
            throw new IOException(
                    "Could not download " + what + ": HTTP " + redirected.statusCode());
        }
        throw new IOException("Could not download " + what + ": HTTP " + response.statusCode());
    }

    public static JsonNode parse(String body) {
        try {
            return JSON.readTree(body == null || body.isBlank() ? "{}" : body);
        } catch (RuntimeException e) {
            return JSON.createObjectNode();
        }
    }

    public static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }

    static long seconds(String value) {
        try {
            return Math.max(0, Long.parseLong(value.trim()));
        } catch (NumberFormatException e) {
            return 5;
        }
    }
}
