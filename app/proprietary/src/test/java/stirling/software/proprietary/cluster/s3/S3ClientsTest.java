package stirling.software.proprietary.cluster.s3;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;

import org.junit.jupiter.api.Test;

import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;

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

    // ----- requestChecksumCalculation parsing -----

    @Test
    void parseRequestChecksum_nullOrBlank_defaultsToWhenSupported() {
        assertThat(S3Clients.parseRequestChecksum(null))
                .isEqualTo(RequestChecksumCalculation.WHEN_SUPPORTED);
        assertThat(S3Clients.parseRequestChecksum(""))
                .isEqualTo(RequestChecksumCalculation.WHEN_SUPPORTED);
        assertThat(S3Clients.parseRequestChecksum("   "))
                .isEqualTo(RequestChecksumCalculation.WHEN_SUPPORTED);
    }

    @Test
    void parseRequestChecksum_caseInsensitive_andTrimmed() {
        assertThat(S3Clients.parseRequestChecksum("when_required"))
                .isEqualTo(RequestChecksumCalculation.WHEN_REQUIRED);
        assertThat(S3Clients.parseRequestChecksum("  WHEN_REQUIRED  "))
                .isEqualTo(RequestChecksumCalculation.WHEN_REQUIRED);
        assertThat(S3Clients.parseRequestChecksum("When_Supported"))
                .isEqualTo(RequestChecksumCalculation.WHEN_SUPPORTED);
    }

    @Test
    void parseRequestChecksum_unknownValue_fallsBackToDefault() {
        assertThat(S3Clients.parseRequestChecksum("yes-please"))
                .isEqualTo(RequestChecksumCalculation.WHEN_SUPPORTED);
        assertThat(S3Clients.parseRequestChecksum("disabled-completely"))
                .isEqualTo(RequestChecksumCalculation.WHEN_SUPPORTED);
    }

    // ----- responseChecksumValidation parsing -----

    @Test
    void parseResponseChecksum_nullOrBlank_defaultsToWhenSupported() {
        assertThat(S3Clients.parseResponseChecksum(null))
                .isEqualTo(ResponseChecksumValidation.WHEN_SUPPORTED);
        assertThat(S3Clients.parseResponseChecksum(""))
                .isEqualTo(ResponseChecksumValidation.WHEN_SUPPORTED);
    }

    @Test
    void parseResponseChecksum_explicitWhenRequired_returnedAsEnum() {
        assertThat(S3Clients.parseResponseChecksum("WHEN_REQUIRED"))
                .isEqualTo(ResponseChecksumValidation.WHEN_REQUIRED);
    }

    @Test
    void parseResponseChecksum_unknownValue_fallsBackToDefault() {
        assertThat(S3Clients.parseResponseChecksum("nope"))
                .isEqualTo(ResponseChecksumValidation.WHEN_SUPPORTED);
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
