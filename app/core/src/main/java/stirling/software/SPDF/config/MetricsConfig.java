package stirling.software.SPDF.config;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.config.MeterFilter;
import io.micrometer.core.instrument.config.MeterFilterReply;

@Configuration
public class MetricsConfig {

    static final String HTTP_REQUESTS = "http.requests";

    // MetricsFilter tags http.requests with the raw session id and the raw request URI, and the
    // in-memory registry keeps one counter per distinct tag combination for the JVM's lifetime.
    // Untagged, session churn and path-variable URIs therefore grow the registry without bound, so
    // these ceilings trade per-request granularity past the limit for a fixed footprint.
    static final int MAX_SESSION_TAG_VALUES = 10_000;
    static final int MAX_URI_TAG_VALUES = 500;

    // The per-tag ceilings above still admit up to 10,000 x 500 distinct session-URI meters, so
    // this second ceiling caps the admitted combinations directly. Membership is the only state:
    // at most this many short keys are retained.
    static final int MAX_SESSION_URI_COMBINATIONS = 10_000;

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

    @Bean
    public MeterFilter httpRequestsCombinationCardinalityCap() {
        Set<String> admitted = ConcurrentHashMap.newKeySet();
        return new MeterFilter() {
            @Override
            public MeterFilterReply accept(Meter.Id id) {
                if (!HTTP_REQUESTS.equals(id.getName())) {
                    return MeterFilterReply.NEUTRAL;
                }
                String session = id.getTag("session");
                String uri = id.getTag("uri");
                if (session == null || uri == null) {
                    return MeterFilterReply.NEUTRAL;
                }
                String key = session + "\u0000" + uri;
                if (admitted.contains(key)) {
                    return MeterFilterReply.NEUTRAL;
                }
                // Size check and add race under concurrency; the overshoot is bounded by the
                // number of registering threads, not by traffic.
                if (admitted.size() >= MAX_SESSION_URI_COMBINATIONS) {
                    return MeterFilterReply.DENY;
                }
                admitted.add(key);
                return MeterFilterReply.NEUTRAL;
            }
        };
    }
}
