package stirling.software.saas.billing.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;
import java.net.ServerSocket;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.saas.config.SupabaseConfigurationProperties;

/**
 * Branch-gap tests for {@link StripeUsageReportingService} covering the failure paths the
 * happy-path suite does not reach: the network {@code IOException} catch (target refuses the
 * connection) and the generic {@code Exception} catch (a malformed URL makes {@code URI.create}
 * throw).
 *
 * <p>Edge-function config is populated so execution gets past the early config guards and actually
 * attempts the HTTP send.
 */
class StripeUsageReportingServiceMoreTest {

    private StripeUsageReportingService newService(String supabaseUrl)
            throws ReflectiveOperationException {
        SupabaseConfigurationProperties props = new SupabaseConfigurationProperties();
        props.setEdgeFunctionUrl(supabaseUrl);
        props.setEdgeFunctionSecret("edge-secret");

        StripeUsageReportingService svc = new StripeUsageReportingService(props);
        Field f = StripeUsageReportingService.class.getDeclaredField("supabaseUrl");
        f.setAccessible(true);
        f.set(svc, supabaseUrl);
        return svc;
    }

    @Nested
    @DisplayName("reportUsageToStripe - failure paths")
    class FailurePaths {

        @Test
        @DisplayName("returns false on a network error (connection refused)")
        void networkError_returnsFalse() throws Exception {
            // Grab a port, then close it so nothing is listening -> ConnectException (IOException).
            int closedPort;
            try (ServerSocket socket = new ServerSocket(0)) {
                closedPort = socket.getLocalPort();
            }
            StripeUsageReportingService svc = newService("http://127.0.0.1:" + closedPort);

            boolean ok = svc.reportUsageToStripe(UUID.randomUUID().toString(), 5, "k");

            assertThat(ok).isFalse();
        }

        @Test
        @DisplayName("returns false when the configured URL is malformed (generic catch)")
        void malformedUrl_returnsFalse() throws Exception {
            // The space makes "http://exa mple.com/functions/v1/meter-usage" fail URI.create.
            StripeUsageReportingService svc = newService("http://exa mple.com");

            boolean ok = svc.reportUsageToStripe(UUID.randomUUID().toString(), 5, "k");

            assertThat(ok).isFalse();
        }
    }
}
