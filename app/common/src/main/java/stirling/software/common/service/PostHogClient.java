package stirling.software.common.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Fire-and-forget PostHog event sender backed by the JDK HTTP client.
 *
 * <p>Events are queued and flushed in batches by a daemon thread so request threads never block on
 * analytics. Failures are logged at debug level and dropped: analytics must not affect request
 * handling or startup.
 */
@Slf4j
public class PostHogClient {

    private static final ObjectMapper MAPPER = JsonMapper.builder().build();
    private static final int MAX_BATCH_SIZE = 50;
    private static final int QUEUE_CAPACITY = 1024;
    private static final Duration HTTP_TIMEOUT = Duration.ofSeconds(10);

    private final String apiKey;
    private final URI batchEndpoint;
    private final HttpClient httpClient;
    private final BlockingQueue<Event> queue = new LinkedBlockingQueue<>(QUEUE_CAPACITY);
    private final AtomicBoolean running = new AtomicBoolean(true);
    private final Thread worker;

    public PostHogClient(String apiKey, String host) {
        this.apiKey = apiKey;
        this.batchEndpoint = toBatchEndpoint(host);
        this.httpClient = HttpClient.newBuilder().connectTimeout(HTTP_TIMEOUT).build();
        this.worker = new Thread(this::drainLoop, "posthog-client");
        this.worker.setDaemon(true);
        this.worker.start();
    }

    private static URI toBatchEndpoint(String host) {
        if (host == null || host.isBlank()) {
            log.warn("PostHog host is not configured; analytics events will be dropped");
            return null;
        }
        String base = host.endsWith("/") ? host.substring(0, host.length() - 1) : host;
        try {
            return URI.create(base + "/batch/");
        } catch (IllegalArgumentException e) {
            log.warn("PostHog host '{}' is not a valid URI; analytics events will be dropped", host);
            return null;
        }
    }

    /** Queues an event without blocking the caller; drops it if the queue is full. */
    public void capture(String distinctId, String event, Map<String, Object> properties) {
        if (!running.get() || batchEndpoint == null) {
            return;
        }
        Map<String, Object> copy = new LinkedHashMap<>(properties);
        Event queued = new Event(distinctId, event, Collections.unmodifiableMap(copy));
        if (!queue.offer(queued)) {
            log.debug("PostHog queue full, dropping event {}", event);
        }
    }

    /** Stops accepting events, flushes what is queued, and waits briefly for the sender. */
    public void shutdown() {
        running.set(false);
        try {
            worker.join(2_000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void drainLoop() {
        while (running.get() || !queue.isEmpty()) {
            try {
                Event first = queue.poll(1, TimeUnit.SECONDS);
                if (first == null) {
                    continue;
                }
                List<Event> batch = new ArrayList<>(MAX_BATCH_SIZE);
                batch.add(first);
                queue.drainTo(batch, MAX_BATCH_SIZE - 1);
                send(batch);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (RuntimeException e) {
                log.debug("PostHog send failed: {}", e.getMessage());
            }
        }
    }

    private void send(List<Event> events) {
        if (batchEndpoint == null) {
            return;
        }
        List<Map<String, Object>> batch = new ArrayList<>(events.size());
        for (Event event : events) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("event", event.name());
            item.put("distinct_id", event.distinctId());
            item.put("properties", event.properties());
            item.put("timestamp", Instant.now().toString());
            batch.add(item);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("api_key", apiKey);
        payload.put("batch", batch);

        try {
            HttpRequest request =
                    HttpRequest.newBuilder(batchEndpoint)
                            .timeout(HTTP_TIMEOUT)
                            .header("Content-Type", "application/json")
                            .POST(
                                    HttpRequest.BodyPublishers.ofString(
                                            MAPPER.writeValueAsString(payload)))
                            .build();
            HttpResponse<Void> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() >= 300) {
                log.debug("PostHog rejected batch with HTTP {}", response.statusCode());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.debug("Unable to send PostHog batch: {}", e.getMessage());
        }
    }

    private record Event(String distinctId, String name, Map<String, Object> properties) {}
}
