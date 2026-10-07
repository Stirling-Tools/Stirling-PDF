package stirling.software.spdf.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.config.MeterFilter;
import io.micrometer.core.instrument.config.MeterFilterReply;

@Configuration(proxyBeanMethods = false)
public class MetricsConfig {

    static final String HTTP_REQUESTS = "http.requests";

    // MetricsFilter tags http.requests with the raw session id and the raw request URI, and the
    // in-memory registry keeps one counter per distinct tag combination for the JVM's lifetime.
    // Untagged, session churn and path-variable URIs therefore grow the registry without bound, so
    // these ceilings trade per-request granularity past the limit for a fixed footprint.
    static final int MAX_SESSION_TAG_VALUES = 10_000;
    static final int MAX_URI_TAG_VALUES = 500;

    @Bean
    public MeterFilter meterFilter() {
        return new MeterFilter() {
            @Override
            public MeterFilterReply accept(Meter.Id id) {
                if (HTTP_REQUESTS.equals(id.getName())) {
                    return MeterFilterReply.NEUTRAL;
                }
                return MeterFilterReply.DENY;
            }
        };
    }

    @Bean
    public MeterFilter httpRequestsSessionCardinalityCap() {
        return MeterFilter.maximumAllowableTags(
                HTTP_REQUESTS, "session", MAX_SESSION_TAG_VALUES, MeterFilter.deny());
    }

    @Bean
    public MeterFilter httpRequestsUriCardinalityCap() {
        return MeterFilter.maximumAllowableTags(
                HTTP_REQUESTS, "uri", MAX_URI_TAG_VALUES, MeterFilter.deny());
    }
}
