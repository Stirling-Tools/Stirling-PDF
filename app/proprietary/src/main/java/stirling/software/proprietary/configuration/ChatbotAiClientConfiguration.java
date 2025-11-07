package stirling.software.proprietary.configuration;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Premium;
import stirling.software.common.model.ApplicationProperties.Premium.ProFeatures;
import stirling.software.common.model.ApplicationProperties.Premium.ProFeatures.Chatbot;

@Configuration
@ConditionalOnClass(RestClientCustomizer.class)
@ConditionalOnProperty(value = "spring.ai.openai.enabled", havingValue = "true")
public class ChatbotAiClientConfiguration {

    @Bean
    public RestClientCustomizer chatbotRestClientCustomizer(
            ApplicationProperties applicationProperties) {
        long connectTimeout = resolveConnectTimeout(applicationProperties);
        long readTimeout = resolveReadTimeout(applicationProperties);
        return builder -> builder.requestFactory(createRequestFactory(connectTimeout, readTimeout));
    }

    private JdkClientHttpRequestFactory createRequestFactory(
            long connectTimeoutMillis, long readTimeoutMillis) {
        HttpClient httpClient =
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofMillis(connectTimeoutMillis))
                        .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout((int) readTimeoutMillis);
        return factory;
    }

    private long resolveConnectTimeout(ApplicationProperties properties) {
        long configured = resolveChatbot(properties).getModels().getConnectTimeoutMillis();
        return configured > 0 ? configured : 30000L;
    }

    private long resolveReadTimeout(ApplicationProperties properties) {
        long configured = resolveChatbot(properties).getModels().getReadTimeoutMillis();
        return configured > 0 ? configured : 120000L;
    }

    private Chatbot resolveChatbot(ApplicationProperties properties) {
        return Optional.ofNullable(properties)
                .map(ApplicationProperties::getPremium)
                .map(Premium::getProFeatures)
                .map(ProFeatures::getChatbot)
                .orElseGet(Chatbot::new);
    }
}
