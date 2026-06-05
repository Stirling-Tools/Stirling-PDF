package stirling.software.saas.payg.filter;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

/**
 * Configuration knobs for the PAYG filter + interceptor stack. See {@code PAYG_FILTER_DESIGN.md}
 * §16 for the rationale on each default.
 *
 * <ul>
 *   <li>{@code payg.filter.enabled} — master kill switch. Restart-required; no
 *       {@code @RefreshScope}. When {@code false}, the wrapper filter passes through and the
 *       interceptor short-circuits in {@code preHandle}.
 *   <li>{@code payg.filter.response.in-memory-threshold-bytes} — the wrapper buffers below this in
 *       a {@link java.io.ByteArrayOutputStream}; above it spills to a {@code TempFile}.
 *   <li>{@code payg.filter.response.max-bytes} — optional ceiling. Responses exceeding this skip
 *       OUTPUT recording in {@code afterCompletion}. {@code null} = unbounded.
 * </ul>
 */
@Component
@Profile("saas")
@ConfigurationProperties(prefix = "payg.filter")
@Getter
@Setter
public class PaygFilterProperties {

    private boolean enabled = true;

    private final Response response = new Response();

    @Getter
    @Setter
    public static class Response {
        /** 10 MiB. Tiny responses stay in RAM; large responses spill. */
        private long inMemoryThresholdBytes = 10L * 1024L * 1024L;

        /** Optional ceiling: when set, OUTPUT recording is skipped past this size. */
        private Long maxBytes;
    }
}
