package stirling.software.proprietary.policy.s3;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;

import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.cluster.s3.S3Clients;

import software.amazon.awssdk.services.s3.S3Client;

class S3ConnectionPoolTest {

    private static final S3Config LOOPBACK_ENDPOINT =
            new S3Config(
                    "inbox",
                    null,
                    null,
                    "http://127.0.0.1:9000",
                    "AKIAEXAMPLE",
                    "shh",
                    false,
                    null,
                    null);

    private static final S3Config REBINDING_ENDPOINT =
            new S3Config(
                    "inbox",
                    "us-east-1",
                    null,
                    "http://bucket.attacker.test:9000",
                    "AKIAEXAMPLE",
                    "shh",
                    false,
                    null,
                    null);

    @Test
    void rejectsAPrivateEndpointWithoutTheOperatorOptIn() {
        ApplicationProperties properties = new ApplicationProperties();
        AtomicInteger built = new AtomicInteger();
        S3ConnectionPool pool =
                new S3ConnectionPool(
                        properties,
                        config -> {
                            built.incrementAndGet();
                            return mock(S3Client.class);
                        });

        assertThatThrownBy(() -> pool.clientFor(LOOPBACK_ENDPOINT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("allowPrivateS3Endpoints");
        assertThat(built).hasValue(0);
    }

    @Test
    void guardsACachedClientOnEveryUse() {
        ApplicationProperties properties = new ApplicationProperties();
        AtomicInteger built = new AtomicInteger();
        S3ConnectionPool pool =
                new S3ConnectionPool(
                        properties,
                        config -> {
                            built.incrementAndGet();
                            return mock(S3Client.class);
                        });

        properties.getPolicies().setAllowPrivateS3Endpoints(true);
        assertThatCode(() -> pool.clientFor(LOOPBACK_ENDPOINT)).doesNotThrowAnyException();
        assertThat(built).hasValue(1);

        properties.getPolicies().setAllowPrivateS3Endpoints(false);
        assertThatThrownBy(() -> pool.clientFor(LOOPBACK_ENDPOINT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("allowPrivateS3Endpoints");
        assertThat(built).hasValue(1);
    }

    @Test
    void refusesACachedConfigWhenTheNameRebindsToABlockedAddress() {
        ApplicationProperties properties = new ApplicationProperties();
        AtomicInteger built = new AtomicInteger();
        S3ConnectionPool pool =
                new S3ConnectionPool(
                        properties,
                        config -> {
                            built.incrementAndGet();
                            return mock(S3Client.class);
                        });

        try (MockedStatic<S3Clients> s3Clients = mockStatic(S3Clients.class)) {
            s3Clients
                    .when(() -> S3Clients.validateEndpointHost(any(), anyBoolean(), any(), any()))
                    .thenAnswer(invocation -> null);
            assertThatCode(() -> pool.clientFor(REBINDING_ENDPOINT)).doesNotThrowAnyException();
            assertThat(built).hasValue(1);

            s3Clients
                    .when(() -> S3Clients.validateEndpointHost(any(), anyBoolean(), any(), any()))
                    .thenThrow(
                            new IllegalStateException(
                                    "S3 source endpoint host 'bucket.attacker.test' resolves to"
                                            + " private/link-local address 127.0.0.1; set"
                                            + " policies.allowPrivateS3Endpoints=true to opt in"));

            assertThatThrownBy(() -> pool.clientFor(REBINDING_ENDPOINT))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("127.0.0.1")
                    .hasMessageContaining("allowPrivateS3Endpoints");
            assertThat(built).hasValue(1);
        }
    }
}
