package stirling.software.proprietary.cluster.s3;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;

import org.junit.jupiter.api.Test;

class S3ClientsTest {

    @Test
    void validateEndpointHost_publicAwsHost_passes() {
        assertThatCode(
                        () ->
                                S3Clients.validateEndpointHost(
                                        URI.create("https://s3.us-east-1.amazonaws.com"), false))
                .doesNotThrowAnyException();
    }

    @Test
    void validateEndpointHost_metadataServiceIp_rejected() {
        assertThatThrownBy(
                        () ->
                                S3Clients.validateEndpointHost(
                                        URI.create("http://169.254.169.254/"), false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("allow-private-endpoints");
    }

    @Test
    void validateEndpointHost_loopback_rejected() {
        assertThatThrownBy(
                        () ->
                                S3Clients.validateEndpointHost(
                                        URI.create("http://127.0.0.1:9000/"), false))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void validateEndpointHost_rfc1918Private_rejected() {
        assertThatThrownBy(
                        () ->
                                S3Clients.validateEndpointHost(
                                        URI.create("http://10.0.0.5:9000/"), false))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void validateEndpointHost_allowPrivateOptIn_bypassesCheck() {
        assertThatCode(
                        () ->
                                S3Clients.validateEndpointHost(
                                        URI.create("http://169.254.169.254/"), true))
                .doesNotThrowAnyException();
        assertThatCode(
                        () ->
                                S3Clients.validateEndpointHost(
                                        URI.create("http://127.0.0.1:9000/"), true))
                .doesNotThrowAnyException();
    }

    @Test
    void validateEndpointHost_missingHost_rejected() {
        assertThatThrownBy(
                        () ->
                                S3Clients.validateEndpointHost(
                                        URI.create("file:///etc/passwd"), false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must include a host");
    }

    @Test
    void validateEndpointHost_errorMessageNamesTheFlag() {
        assertThat(
                        catchMessage(
                                () ->
                                        S3Clients.validateEndpointHost(
                                                URI.create("http://192.168.1.10:9000/"), false)))
                .contains("storage.s3.allow-private-endpoints");
    }

    private static String catchMessage(Runnable r) {
        try {
            r.run();
            return "";
        } catch (RuntimeException e) {
            return e.getMessage() == null ? "" : e.getMessage();
        }
    }
}
