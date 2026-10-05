package stirling.software.saas.store.moderation;

import java.net.http.HttpClient;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import lombok.extern.slf4j.Slf4j;

/**
 * The store's content check is OpenAI's moderation model: free, multilingual, and called only from
 * the SaaS backend, so there is nothing to choose. The key is the only input, because a secret
 * cannot live in code. Without one (a local dev stack) the check is off and the word list is the
 * only text check.
 */
@Slf4j
@Configuration
@Profile("saas")
@ConditionalOnProperty(name = "stirling.store.enabled", havingValue = "true")
public class StoreModerationConfig {

    @Bean
    public StoreContentCheck storeContentCheck(
            @Value("${stirling.store.moderation.openai-api-key:}") String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            log.warn(
                    "Pipeline store content check is off: STIRLING_STORE_MODERATION_OPENAI_API_KEY is"
                            + " not set, so listing text is checked against the word list only");
            return StoreContentCheck.disabled();
        }
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        log.info("Pipeline store content check: OpenAI moderation");
        return new StoreContentCheck(new OpenAiModeration(http, apiKey));
    }
}
