package stirling.software.proprietary.service.chatbot;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Premium;
import stirling.software.common.model.ApplicationProperties.Premium.ProFeatures;
import stirling.software.common.model.ApplicationProperties.Premium.ProFeatures.Chatbot;
import stirling.software.proprietary.model.chatbot.ChatbotDocumentCacheEntry;
import stirling.software.proprietary.model.chatbot.ChatbotTextChunk;
import stirling.software.proprietary.service.chatbot.exception.ChatbotException;

@Service
@ConditionalOnProperty(value = "premium.proFeatures.chatbot.enabled", havingValue = "true")
@Slf4j
public class ChatbotCacheService {

    private final Cache<String, ChatbotDocumentCacheEntry> documentCache;
    private final long maxDocumentCharacters;
    private final Map<String, String> sessionToCacheKey = new ConcurrentHashMap<>();

    public ChatbotCacheService(ApplicationProperties applicationProperties) {
        Chatbot chatbotConfig = resolveChatbot(applicationProperties);
        ApplicationProperties.Premium.ProFeatures.Chatbot.Cache cacheSettings =
                chatbotConfig.getCache();
        this.maxDocumentCharacters = cacheSettings.getMaxDocumentCharacters();
        long ttlMinutes = Math.max(cacheSettings.getTtlMinutes(), 1);
        long maxEntries = Math.max(cacheSettings.getMaxEntries(), 1);

        this.documentCache =
                Caffeine.newBuilder()
                        .maximumSize(maxEntries)
                        .expireAfterWrite(Duration.ofMinutes(ttlMinutes))
                        .recordStats()
                        .build();
        log.info(
                "Initialised chatbot document cache with maxEntries={} ttlMinutes={} maxChars={}",
                maxEntries,
                ttlMinutes,
                maxDocumentCharacters);
    }

    public long getMaxDocumentCharacters() {
        return maxDocumentCharacters;
    }

    public String register(
            String sessionId,
            String documentId,
            String rawText,
            Map<String, String> metadata,
            boolean ocrApplied,
            boolean imageContentDetected,
            long textCharacters) {
        Objects.requireNonNull(sessionId, "sessionId must not be null");
        Objects.requireNonNull(documentId, "documentId must not be null");
        Objects.requireNonNull(rawText, "rawText must not be null");
        if (rawText.length() > maxDocumentCharacters) {
            throw new ChatbotException(
                    "Document text exceeds maximum allowed characters: " + maxDocumentCharacters);
        }
        String cacheKey =
                sessionToCacheKey.computeIfAbsent(sessionId, k -> UUID.randomUUID().toString());
        ChatbotDocumentCacheEntry entry =
                ChatbotDocumentCacheEntry.builder()
                        .cacheKey(cacheKey)
                        .sessionId(sessionId)
                        .documentId(documentId)
                        .metadata(metadata)
                        .text(rawText)
                        .ocrApplied(ocrApplied)
                        .imageContentDetected(imageContentDetected)
                        .textCharacters(textCharacters)
                        .storedAt(Instant.now())
                        .build();
        documentCache.put(cacheKey, entry);
        return cacheKey;
    }

    public void attachChunks(String cacheKey, List<ChatbotTextChunk> chunks) {
        documentCache
                .asMap()
                .computeIfPresent(
                        cacheKey,
                        (key, existing) -> {
                            existing.setChunks(chunks);
                            return existing;
                        });
    }

    public Optional<ChatbotDocumentCacheEntry> resolveByCacheKey(String cacheKey) {
        return Optional.ofNullable(documentCache.getIfPresent(cacheKey));
    }

    public Optional<ChatbotDocumentCacheEntry> resolveBySessionId(String sessionId) {
        return Optional.ofNullable(sessionToCacheKey.get(sessionId))
                .flatMap(this::resolveByCacheKey);
    }

    public void invalidateSession(String sessionId) {
        Optional.ofNullable(sessionToCacheKey.remove(sessionId))
                .ifPresent(documentCache::invalidate);
    }

    public void invalidateCacheKey(String cacheKey) {
        documentCache.invalidate(cacheKey);
        sessionToCacheKey.values().removeIf(value -> value.equals(cacheKey));
    }

    public Map<String, ChatbotDocumentCacheEntry> snapshot() {
        return Map.copyOf(documentCache.asMap());
    }

    private Chatbot resolveChatbot(ApplicationProperties properties) {
        if (properties == null) {
            return new Chatbot();
        }
        Premium premium = properties.getPremium();
        if (premium == null) {
            return new Chatbot();
        }
        ProFeatures pro = premium.getProFeatures();
        if (pro == null) {
            return new Chatbot();
        }
        Chatbot chatbot = pro.getChatbot();
        return chatbot == null ? new Chatbot() : chatbot;
    }
}
