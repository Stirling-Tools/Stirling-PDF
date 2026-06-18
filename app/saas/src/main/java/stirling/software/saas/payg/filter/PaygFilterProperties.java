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

        /**
         * Ceiling for OUTPUT recording. Responses larger than this skip the per-PDF hash + ZIP
         * unpack — the bytes still flowed through to the client unmodified, only lineage capture is
         * dropped. Default 500 MiB is generous for the largest realistic Stirling responses (full
         * split-to-ZIP on a 1000-page document) while preventing pathological cases from tying up
         * the interceptor for minutes. Set to {@code null} for "no ceiling at all".
         */
        private Long maxBytes = 500L * 1024L * 1024L;
    }
}
