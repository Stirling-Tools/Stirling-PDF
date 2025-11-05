package stirling.software.proprietary.config;

import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.OpenAiEmbeddingModel;
import org.springframework.ai.openai.OpenAiEmbeddingOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings;

@Configuration
@ConditionalOnProperty(value = "premium.proFeatures.chatbot.enabled", havingValue = "true")
public class ChatbotAiConfiguration {

    @Bean
    public OpenAiApi chatbotOpenAiApi(ChatbotFeatureProperties properties) {
        ChatbotSettings settings = properties.current();
        String apiKey = settings.models().apiKey();
        if (!StringUtils.hasText(apiKey)) {
            throw new IllegalStateException(
                    "premium.proFeatures.chatbot.models.apiKey must be set (or provide SPRING_AI_OPENAI_API_KEY)");
        }
        return new OpenAiApi(apiKey);
    }

    @Bean
    public ChatModel chatbotChatModel(
            OpenAiApi chatbotOpenAiApi, ChatbotFeatureProperties properties) {
        OpenAiChatOptions options =
                OpenAiChatOptions.builder()
                        .withModel(properties.current().models().primary())
                        .build();
        return new OpenAiChatModel(chatbotOpenAiApi, options);
    }

    @Bean
    public EmbeddingModel chatbotEmbeddingModel(
            OpenAiApi chatbotOpenAiApi, ChatbotFeatureProperties properties) {
        OpenAiEmbeddingOptions options =
                OpenAiEmbeddingOptions.builder()
                        .withModel(properties.current().models().embedding())
                        .build();
        return new OpenAiEmbeddingModel(chatbotOpenAiApi, options);
    }
}
