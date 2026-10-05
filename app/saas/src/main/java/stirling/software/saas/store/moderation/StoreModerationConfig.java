package stirling.software.saas.store.moderation;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import lombok.extern.slf4j.Slf4j;

/**
 * Picks the store's content-check provider from {@code stirling.store.moderation.provider}: {@code
 * openai}, {@code azure}, {@code none}, or {@code auto} (the default), which uses OpenAI when an
 * OpenAI key is set, else Azure when an endpoint and key are, else nothing. Naming a provider
 * without its credentials fails startup rather than quietly checking nothing.
 */
@Slf4j
@Configuration
@Profile("saas")
@ConditionalOnProperty(name = "stirling.store.enabled", havingValue = "true")
public class StoreModerationConfig {

    @Bean
    public StoreContentCheck storeContentCheck(
            @Value("${stirling.store.moderation.provider:auto}") String provider,
            @Value("${stirling.store.moderation.fail-closed:false}") boolean failClosed,
            @Value("${stirling.store.moderation.timeout-seconds:8}") int timeoutSeconds,
            @Value("${stirling.store.moderation.openai.api-key:}") String openAiKey,
            @Value("${stirling.store.moderation.openai.base-url:https://api.openai.com/v1}")
                    String openAiBaseUrl,
            @Value("${stirling.store.moderation.openai.model:omni-moderation-latest}")
                    String openAiModel,
            @Value("${stirling.store.moderation.azure.endpoint:}") String azureEndpoint,
            @Value("${stirling.store.moderation.azure.api-key:}") String azureKey,
            @Value("${stirling.store.moderation.azure.severity-threshold:2}") int azureSeverity) {
        String choice = provider == null ? "auto" : provider.trim().toLowerCase(Locale.ROOT);
        boolean hasOpenAi = !openAiKey.isBlank();
        boolean hasAzure = !azureEndpoint.isBlank() && !azureKey.isBlank();
        if (choice.equals("auto")) {
            choice = hasOpenAi ? "openai" : hasAzure ? "azure" : "none";
        }
        Duration timeout = Duration.ofSeconds(Math.max(1, timeoutSeconds));
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        StoreModeration moderation =
                switch (choice) {
                    case "openai" -> {
                        require(hasOpenAi, "stirling.store.moderation.openai.api-key");
                        yield new OpenAiModeration(
                                http, openAiBaseUrl, openAiKey, openAiModel, timeout);
                    }
                    case "azure" -> {
                        require(hasAzure, "stirling.store.moderation.azure.endpoint and .api-key");
                        yield new AzureContentSafetyModeration(
                                http, azureEndpoint, azureKey, azureSeverity, timeout);
                    }
                    case "none" -> null;
                    default ->
                            throw new IllegalStateException(
                                    "Unknown stirling.store.moderation.provider: " + provider);
                };
        if (moderation == null) {
            log.info("Pipeline store content check: off, the word list is the only text check");
            return StoreContentCheck.disabled();
        }
        log.info(
                "Pipeline store content check: {} ({} when it is unavailable)",
                moderation.name(),
                failClosed ? "refuse publishing" : "fall back to the word list");
        return new StoreContentCheck(moderation, failClosed);
    }

    private static void require(boolean present, String what) {
        if (!present) {
            throw new IllegalStateException(
                    "The pipeline store content check needs " + what + " to be set");
        }
    }
}
