package stirling.software.proprietary.policy.remote;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;

public final class ExpiringTokenCache {

    public record Token(String value, long expiresInSeconds) {}

    @FunctionalInterface
    public interface Fetch {
        Token fetch() throws IOException;
    }

    private record Entry(String value, Instant refreshAfter) {}

    private final Duration margin;
    private final Map<String, Entry> entries = new ConcurrentHashMap<>();

    public ExpiringTokenCache(Duration margin) {
        this.margin = margin;
    }

    public String get(String key, Fetch fetch) throws IOException {
        String cached = peek(key);
        if (cached != null) {
            return cached;
        }
        return put(key, fetch.fetch());
    }

    public String peek(String key) {
        Entry entry = entries.get(key);
        return entry != null && Instant.now().isBefore(entry.refreshAfter()) ? entry.value() : null;
    }

    public String put(String key, Token token) {
        entries.put(
                key,
                new Entry(
                        token.value(),
                        Instant.now().plusSeconds(token.expiresInSeconds()).minus(margin)));
        return token.value();
    }

    public void evictIf(Predicate<String> keyMatches) {
        entries.keySet().removeIf(keyMatches);
    }
}
