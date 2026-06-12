package stirling.software.SPDF.config;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.config.MeterFilter;
import io.micrometer.core.instrument.config.MeterFilterReply;

@ApplicationScoped
public class MetricsConfig {

    @Produces
    @ApplicationScoped
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
