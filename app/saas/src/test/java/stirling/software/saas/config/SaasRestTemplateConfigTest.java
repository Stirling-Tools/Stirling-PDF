package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

/**
 * Unit tests for {@link SaasRestTemplateConfig}.
 *
 * <p>Verifies the {@code saasRestTemplate()} bean is built on a {@link
 * SimpleClientHttpRequestFactory} with the bounded connect (10s) and read (30s) timeouts the
 * Supabase Edge Function client relies on.
 */
class SaasRestTemplateConfigTest {

    private final SaasRestTemplateConfig config = new SaasRestTemplateConfig();

    @Test
    @DisplayName("returns a non-null RestTemplate backed by SimpleClientHttpRequestFactory")
    void returnsRestTemplate() {
        RestTemplate template = config.saasRestTemplate();

        assertThat(template).isNotNull();
        assertThat(template.getRequestFactory()).isInstanceOf(SimpleClientHttpRequestFactory.class);
    }

    @Test
    @DisplayName("configures the connect and read timeouts on the request factory")
    void configuresTimeouts() {
        RestTemplate template = config.saasRestTemplate();

        SimpleClientHttpRequestFactory factory =
                (SimpleClientHttpRequestFactory) template.getRequestFactory();
        assertThat(ReflectionTestUtils.getField(factory, "connectTimeout")).isEqualTo(10_000);
        assertThat(ReflectionTestUtils.getField(factory, "readTimeout")).isEqualTo(30_000);
    }

    @Test
    @DisplayName("each invocation builds a fresh instance")
    void buildsFreshInstance() {
        assertThat(config.saasRestTemplate()).isNotSameAs(config.saasRestTemplate());
    }
}
