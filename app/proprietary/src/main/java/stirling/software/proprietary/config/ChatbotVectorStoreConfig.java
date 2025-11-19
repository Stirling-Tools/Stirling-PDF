package stirling.software.proprietary.config;

import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.vectorstore.SimpleVectorStore;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.redis.RedisVectorStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import lombok.extern.slf4j.Slf4j;

import redis.clients.jedis.JedisPooled;

@Configuration
@ConditionalOnProperty(value = "premium.proFeatures.chatbot.enabled", havingValue = "true")
@Slf4j
public class ChatbotVectorStoreConfig {

    private static final String DEFAULT_INDEX = "stirling-chatbot-index";
    private static final String DEFAULT_PREFIX = "stirling:chatbot:";

    @Bean
    @Primary
    public VectorStore chatbotVectorStore(
            @Autowired(required = false) JedisPooled jedisPooled, EmbeddingModel embeddingModel) {
        if (jedisPooled != null) {
            try {
                log.info("Initialising Redis vector store for chatbot usage");
                return RedisVectorStore.builder(jedisPooled, embeddingModel)
                        .indexName(DEFAULT_INDEX)
                        .prefix(DEFAULT_PREFIX)
                        .initializeSchema(true)
                        .build();
            } catch (RuntimeException ex) {
                log.warn(
                        "Redis vector store unavailable ({}). Falling back to SimpleVectorStore.",
                        sanitize(ex.getMessage()));
            }
        } else {
            log.info("No Redis connection detected; using SimpleVectorStore for chatbot.");
        }

        return SimpleVectorStore.builder(embeddingModel).build();
    }

    private String sanitize(String message) {
        return message == null ? "unknown error" : message.replaceAll("\\s+", " ").trim();
    }
}
