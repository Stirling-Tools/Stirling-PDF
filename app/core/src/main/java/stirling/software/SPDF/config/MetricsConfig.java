package stirling.software.SPDF.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.config.MeterFilter;
import io.micrometer.core.instrument.config.MeterFilterReply;

@Configuration
public class MetricsConfig {

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
}
