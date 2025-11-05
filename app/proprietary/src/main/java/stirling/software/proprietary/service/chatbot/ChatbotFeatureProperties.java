package stirling.software.proprietary.service.chatbot;

import java.util.Optional;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Premium;
import stirling.software.common.model.ApplicationProperties.Premium.ProFeatures;
import stirling.software.common.model.ApplicationProperties.Premium.ProFeatures.Chatbot;

@Component
public class ChatbotFeatureProperties {

    private final ApplicationProperties applicationProperties;
    private final Environment environment;

    public ChatbotFeatureProperties(
            ApplicationProperties applicationProperties, Environment environment) {
        this.applicationProperties = applicationProperties;
        this.environment = environment;
    }

    public ChatbotSettings current() {
        Chatbot chatbot = resolveChatbot();
        String configuredKey = Optional.ofNullable(chatbot.getModels().getApiKey()).orElse("");
        String fallbackKey = environment.getProperty("spring.ai.openai.api-key", "");
        String apiKey =
                StringUtils.hasText(configuredKey)
                        ? configuredKey
                        : (StringUtils.hasText(fallbackKey) ? fallbackKey : "");

        return new ChatbotSettings(
                chatbot.isEnabled(),
                chatbot.isAlphaWarning(),
                chatbot.getMaxPromptCharacters(),
                chatbot.getMinConfidenceNano(),
                new ChatbotSettings.ModelSettings(
                        chatbot.getModels().getPrimary(),
                        chatbot.getModels().getFallback(),
                        chatbot.getModels().getEmbedding(),
                        apiKey),
                new ChatbotSettings.RagSettings(
                        chatbot.getRag().getChunkSizeTokens(),
                        chatbot.getRag().getChunkOverlapTokens(),
                        chatbot.getRag().getTopK()),
                new ChatbotSettings.CacheSettings(
                        chatbot.getCache().getTtlMinutes(),
                        chatbot.getCache().getMaxEntries(),
                        chatbot.getCache().getMaxDocumentCharacters()),
                new ChatbotSettings.OcrSettings(chatbot.getOcr().isEnabledByDefault()),
                new ChatbotSettings.AuditSettings(chatbot.getAudit().isEnabled()));
    }

    public boolean isEnabled() {
        return current().enabled();
    }

    private Chatbot resolveChatbot() {
        return Optional.ofNullable(applicationProperties)
                .map(ApplicationProperties::getPremium)
                .map(Premium::getProFeatures)
                .map(ProFeatures::getChatbot)
                .orElseGet(Chatbot::new);
    }

    public record ChatbotSettings(
            boolean enabled,
            boolean alphaWarning,
            long maxPromptCharacters,
            double minConfidenceNano,
            ModelSettings models,
            RagSettings rag,
            CacheSettings cache,
            OcrSettings ocr,
            AuditSettings audit) {

        public record ModelSettings(
                String primary, String fallback, String embedding, String apiKey) {}

        public record RagSettings(int chunkSizeTokens, int chunkOverlapTokens, int topK) {}

        public record CacheSettings(long ttlMinutes, long maxEntries, long maxDocumentCharacters) {}

        public record OcrSettings(boolean enabledByDefault) {}

        public record AuditSettings(boolean enabled) {}
    }
}
