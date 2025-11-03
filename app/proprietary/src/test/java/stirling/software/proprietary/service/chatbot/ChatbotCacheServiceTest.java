package stirling.software.proprietary.service.chatbot;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.chatbot.ChatbotDocumentCacheEntry;
import stirling.software.proprietary.service.chatbot.exception.ChatbotException;

class ChatbotCacheServiceTest {

    private ApplicationProperties properties;

    @BeforeEach
    void setup() {
        properties = new ApplicationProperties();
        ApplicationProperties.Premium premium = new ApplicationProperties.Premium();
        ApplicationProperties.Premium.ProFeatures pro =
                new ApplicationProperties.Premium.ProFeatures();
        ApplicationProperties.Premium.ProFeatures.Chatbot chatbot =
                new ApplicationProperties.Premium.ProFeatures.Chatbot();
        chatbot.setEnabled(true);
        chatbot.getCache().setMaxDocumentCharacters(50);
        chatbot.getCache().setMaxEntries(10);
        chatbot.getCache().setTtlMinutes(60);
        pro.setChatbot(chatbot);
        premium.setProFeatures(pro);
        properties.setPremium(premium);
    }

    @Test
    void registerRejectsOversizedText() {
        ChatbotCacheService cacheService = new ChatbotCacheService(properties);
        String longText = "a".repeat(51);
        assertThrows(
                ChatbotException.class,
                () -> cacheService.register("session", "doc", longText, Map.of(), false));
    }

    @Test
    void registerAndResolveSession() {
        ChatbotCacheService cacheService = new ChatbotCacheService(properties);
        String cacheKey =
                cacheService.register(
                        "session1", "doc1", "hello world", Map.of("title", "Sample"), false);
        assertTrue(cacheService.resolveBySessionId("session1").isPresent());
        ChatbotDocumentCacheEntry entry = cacheService.resolveByCacheKey(cacheKey).orElseThrow();
        assertEquals("doc1", entry.getDocumentId());
        assertEquals("Sample", entry.getMetadata().get("title"));
    }
}
