package stirling.software.proprietary.service.chatbot;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.Supplier;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.chatbot.ChatbotHistoryEntry;

import redis.clients.jedis.JedisPooled;

/**
 * Lightweight Redis-backed conversation store that keeps a short rolling window and summary for
 * each chatbot session. This lays the groundwork for richer memory handling without yet impacting
 * the main conversation flow.
 */
@Component
@Slf4j
public class ChatbotConversationStore {

    private static final String HISTORY_KEY = "chatbot:sessions:%s:history";
    private static final String SUMMARY_KEY = "chatbot:sessions:%s:summary";
    private static final Duration DEFAULT_TTL = Duration.ofHours(24);
    private static final int DEFAULT_WINDOW = 10;
    private static final int RETENTION_MULTIPLIER = 5;
    private static final int RETENTION_WINDOW = DEFAULT_WINDOW * RETENTION_MULTIPLIER;

    private final JedisPooled jedis;
    private final ObjectMapper objectMapper;

    public ChatbotConversationStore(
            ObjectProvider<JedisPooled> jedisProvider, ObjectMapper objectMapper) {
        this.jedis = jedisProvider.getIfAvailable();
        this.objectMapper = objectMapper;
    }

    public void appendTurn(String sessionId, ChatbotHistoryEntry entry) {
        if (!redisReady() || !StringUtils.hasText(sessionId) || entry == null) {
            return;
        }
        execute(
                () -> {
                    try {
                        String payload = objectMapper.writeValueAsString(entry);
                        String key = historyKey(sessionId);
                        jedis.rpush(key, payload);
                        jedis.expire(key, (int) DEFAULT_TTL.getSeconds());
                        jedis.expire(summaryKey(sessionId), (int) DEFAULT_TTL.getSeconds());
                    } catch (JsonProcessingException ex) {
                        log.debug("Failed to serialise chatbot turn", ex);
                    }
                });
    }

    public List<ChatbotHistoryEntry> getRecentTurns(String sessionId, int limit) {
        if (!redisReady() || !StringUtils.hasText(sessionId)) {
            return Collections.emptyList();
        }
        return execute(
                () -> {
                    String key = historyKey(sessionId);
                    long size = jedis.llen(key);
                    if (size <= 0) {
                        return Collections.emptyList();
                    }
                    long start = Math.max(0, size - Math.max(limit, 1));
                    List<String> raw = jedis.lrange(key, start, size);
                    if (CollectionUtils.isEmpty(raw)) {
                        return Collections.emptyList();
                    }
                    List<ChatbotHistoryEntry> entries = new ArrayList<>(raw.size());
                    for (String chunk : raw) {
                        try {
                            entries.add(objectMapper.readValue(chunk, ChatbotHistoryEntry.class));
                        } catch (JsonProcessingException ex) {
                            log.debug("Ignoring malformed chatbot history payload", ex);
                        }
                    }
                    return entries;
                },
                Collections.emptyList());
    }

    public void trimHistory(String sessionId, int retainEntries) {
        if (!redisReady() || !StringUtils.hasText(sessionId) || retainEntries <= 0) {
            return;
        }
        execute(
                () -> {
                    String key = historyKey(sessionId);
                    jedis.ltrim(key, -retainEntries, -1);
                });
    }

    public void storeSummary(String sessionId, String summary) {
        if (!redisReady() || !StringUtils.hasText(sessionId)) {
            return;
        }
        execute(() -> jedis.setex(summaryKey(sessionId), (int) DEFAULT_TTL.getSeconds(), summary));
    }

    public String loadSummary(String sessionId) {
        if (!redisReady() || !StringUtils.hasText(sessionId)) {
            return "";
        }
        return execute(() -> jedis.get(summaryKey(sessionId)), "");
    }

    public void clear(String sessionId) {
        if (!redisReady() || !StringUtils.hasText(sessionId)) {
            return;
        }
        execute(
                () -> {
                    jedis.del(historyKey(sessionId));
                    jedis.del(summaryKey(sessionId));
                });
    }

    public int defaultWindow() {
        return DEFAULT_WINDOW;
    }

    public int retentionWindow() {
        return RETENTION_WINDOW;
    }

    public long historyLength(String sessionId) {
        if (!redisReady() || !StringUtils.hasText(sessionId)) {
            return 0L;
        }
        return execute(() -> jedis.llen(historyKey(sessionId)), 0L);
    }

    private boolean redisReady() {
        return jedis != null;
    }

    private String historyKey(String sessionId) {
        return HISTORY_KEY.formatted(sessionId);
    }

    private String summaryKey(String sessionId) {
        return SUMMARY_KEY.formatted(sessionId);
    }

    private void execute(Runnable action) {
        if (!redisReady()) {
            return;
        }
        try {
            action.run();
        } catch (RuntimeException ex) {
            log.warn("Redis conversation store unavailable: {}", ex.getMessage());
        }
    }

    private <T> T execute(Supplier<T> supplier, T fallback) {
        if (!redisReady()) {
            return fallback;
        }
        try {
            return supplier.get();
        } catch (RuntimeException ex) {
            log.warn("Redis conversation store unavailable: {}", ex.getMessage());
            return fallback;
        }
    }

    /** Convenience factory to create entries for manual tests. */
    public ChatbotHistoryEntry createEntry(
            String role, String content, String documentId, String documentName) {
        return new ChatbotHistoryEntry(role, content, documentId, documentName, Instant.now());
    }
}
