package stirling.software.SPDF.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

/**
 * Spring configuration for the Ledger Auditor AI engine HTTP client.
 *
 * <p>Provides a plain {@link RestTemplate} bean used by {@link
 * stirling.software.SPDF.service.AiEngineClient} to call the Python engine. Kept separate so it can
 * be replaced with a mock in integration tests without touching the client itself.
 */
@Configuration
public class AiEngineClientConfig {

    @Bean
    public RestTemplate aiEngineRestTemplate() {
        return new RestTemplate();
    }
}
