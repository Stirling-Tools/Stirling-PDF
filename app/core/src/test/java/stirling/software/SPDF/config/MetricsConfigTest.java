package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class MetricsConfigTest {

    private SimpleMeterRegistry registryConfigured() {
        MetricsConfig config = new MetricsConfig();
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        registry.config()
                .meterFilter(config.meterFilter())
                .meterFilter(config.httpRequestsSessionCardinalityCap())
                .meterFilter(config.httpRequestsUriCardinalityCap());
        return registry;
    }

    private Counter count(SimpleMeterRegistry registry, String uri, String session) {
        return Counter.builder(MetricsConfig.HTTP_REQUESTS)
                .tag("session", session)
                .tag("method", "POST")
                .tag("uri", uri)
                .register(registry);
    }

    @Test
    @DisplayName("session tag is capped so session churn cannot grow the registry without bound")
    void sessionTagIsCapped() {
        SimpleMeterRegistry registry = registryConfigured();

        for (int i = 0; i < MetricsConfig.MAX_SESSION_TAG_VALUES + 50; i++) {
            count(registry, "/api/v1/general/rotate-pdf", "session-" + i).increment();
        }

        assertThat(registry.find(MetricsConfig.HTTP_REQUESTS).counters())
                .hasSize(MetricsConfig.MAX_SESSION_TAG_VALUES);
    }

    @Test
    @DisplayName("uri tag is capped so path-variable URIs cannot grow the registry without bound")
    void uriTagIsCapped() {
        SimpleMeterRegistry registry = registryConfigured();

        for (int i = 0; i < MetricsConfig.MAX_URI_TAG_VALUES + 50; i++) {
            count(registry, "/api/v1/general/convert/job-" + i, "session-1").increment();
        }

        assertThat(registry.find(MetricsConfig.HTTP_REQUESTS).counters())
                .hasSize(MetricsConfig.MAX_URI_TAG_VALUES);
    }

    @Test
    @DisplayName("sessions within the cap keep counting per session")
    void sessionsWithinCapRemainDistinct() {
        SimpleMeterRegistry registry = registryConfigured();

        count(registry, "/api/v1/general/rotate-pdf", "session-1").increment();
        count(registry, "/api/v1/general/rotate-pdf", "session-1").increment();
        count(registry, "/api/v1/general/rotate-pdf", "session-2").increment();

        assertThat(
                        registry.get(MetricsConfig.HTTP_REQUESTS)
                                .tag("session", "session-1")
                                .counter()
                                .count())
                .isEqualTo(2.0);
        assertThat(
                        registry.get(MetricsConfig.HTTP_REQUESTS)
                                .tag("session", "session-2")
                                .counter()
                                .count())
                .isEqualTo(1.0);
    }

    @Test
    @DisplayName("meters other than http.requests are still denied")
    void otherMetersDenied() {
        SimpleMeterRegistry registry = registryConfigured();

        registry.counter("some.other.metric").increment();

        assertThat(registry.getMeters()).isEmpty();
    }
}
