package stirling.software.SPDF.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.config.MeterFilter;
import io.micrometer.core.instrument.config.MeterFilterReply;

@Configuration
public class MetricsConfig {

    static final int MAX_URI_TAG_VALUES = 500;

    @Bean
    public MeterFilter meterFilter() {
        return new MeterFilter() {
            @Override
            public MeterFilterReply accept(Meter.Id id) {
                if ("http.requests".equals(id.getName())) {
                    return MeterFilterReply.NEUTRAL;
                }
                return MeterFilterReply.DENY;
            }
        };
    }

    @Bean
    public MeterFilter uriCardinalityLimit() {
        return MeterFilter.maximumAllowableTags(
                "http.requests", "uri", MAX_URI_TAG_VALUES, MeterFilter.deny());
    }
}
