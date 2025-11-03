package stirling.software.proprietary.service.chatbot;

import java.util.Optional;

import org.springframework.stereotype.Component;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Premium;
import stirling.software.common.model.ApplicationProperties.Premium.ProFeatures;
import stirling.software.common.model.ApplicationProperties.Premium.ProFeatures.Chatbot;

@Component
public class ChatbotFeatureProperties {

    private final ApplicationProperties applicationProperties;

    public ChatbotFeatureProperties(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    public ChatbotSettings current() {
        Chatbot chatbot = resolveChatbot();
        return new ChatbotSettings(
                chatbot.isEnabled(),
                chatbot.isAlphaWarning(),
                chatbot.getMaxPromptCharacters(),
                chatbot.getMinConfidenceNano(),
                new ChatbotSettings.ModelSettings(
                        chatbot.getModels().getPrimary(),
                        chatbot.getModels().getFallback(),
                        chatbot.getModels().getEmbedding()),
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

        public record ModelSettings(String primary, String fallback, String embedding) {}

        public record RagSettings(int chunkSizeTokens, int chunkOverlapTokens, int topK) {}

        public record CacheSettings(long ttlMinutes, long maxEntries, long maxDocumentCharacters) {}

        public record OcrSettings(boolean enabledByDefault) {}

        public record AuditSettings(boolean enabled) {}
    }
}
