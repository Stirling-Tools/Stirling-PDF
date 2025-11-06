package stirling.software.proprietary.config;

import java.time.Duration;

import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;

import lombok.extern.slf4j.Slf4j;

/**
 * Spring AI Configuration for Stirling PDF Chatbot
 *
 * <p>This configuration enables Spring AI auto-configuration for chatbot features. The actual
 * ChatModel and EmbeddingModel beans are provided by Spring Boot's auto-configuration based on the
 * spring.ai.* properties in application-proprietary.properties
 *
 * <p>For OpenAI: - spring.ai.openai.enabled=true - spring.ai.openai.api-key=your-api-key
 *
 * <p>For Ollama (as fallback): - spring.ai.ollama.enabled=true -
 * spring.ai.ollama.base-url=http://localhost:11434
 */
@Configuration
@Slf4j
public class SpringAIConfig {

    public SpringAIConfig() {
        log.info("Spring AI Configuration enabled for Stirling PDF Chatbot");
        log.info(
                "ChatModel and EmbeddingModel beans will be auto-configured based on spring.ai.* properties");
    }

    /** Primary ChatModel bean that delegates to OpenAI's auto-configured bean */
    @Bean
    @Primary
    public ChatModel primaryChatModel(@Qualifier("openAiChatModel") ChatModel openAiChatModel) {
        log.info("Using OpenAI ChatModel as primary");
        return openAiChatModel;
    }

    /** Primary EmbeddingModel bean that delegates to OpenAI's auto-configured bean */
    @Bean
    @Primary
    public EmbeddingModel primaryEmbeddingModel(
            @Qualifier("openAiEmbeddingModel") EmbeddingModel openAiEmbeddingModel) {
        log.info("Using OpenAI EmbeddingModel as primary");
        return openAiEmbeddingModel;
    }

    /**
     * Custom RestTemplate for Spring AI OpenAI client with increased timeouts. This helps prevent
     * timeout errors when processing large documents or complex queries.
     */
    @Bean(name = "openAiRestTemplate")
    public RestTemplate openAiRestTemplate(RestTemplateBuilder builder) {
        log.info("Creating custom RestTemplate for OpenAI with 60s timeouts");
        return builder.connectTimeout(Duration.ofSeconds(60))
                .readTimeout(Duration.ofSeconds(60))
                .build();
    }

    /**
     * Custom RestClient for Spring AI OpenAI with increased timeouts. Spring AI 1.0.3+ prefers
     * RestClient over RestTemplate.
     */
    @Bean(name = "openAiRestClient")
    public RestClient openAiRestClient() {
        log.info("Creating custom RestClient for OpenAI with 60s timeouts");
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(60));
        factory.setReadTimeout(Duration.ofSeconds(60));

        return RestClient.builder().requestFactory(factory).build();
    }
}
