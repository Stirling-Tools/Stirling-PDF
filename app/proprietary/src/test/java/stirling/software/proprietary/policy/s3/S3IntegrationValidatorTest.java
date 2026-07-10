package stirling.software.proprietary.policy.s3;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.integration.model.IntegrationType;

/**
 * Tests for {@link S3IntegrationValidator}: the S3 connection schema fails at save time - missing
 * credentials, bad endpoints, and private endpoints without the operator opt-in.
 */
class S3IntegrationValidatorTest {

    @Test
    void acceptsACompleteConnection() {
        assertThatCode(
                        () ->
                                validator(false)
                                        .validate(
                                                Map.of(
                                                        "bucket", "inbox",
                                                        "accessKeyId", "AKIAEXAMPLE",
                                                        "secretAccessKey", "shh")))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsMissingCredentialsOrBucket() {
        assertThatThrownBy(() -> validator(false).validate(Map.of("bucket", "inbox")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                        () ->
                                validator(false)
                                        .validate(
                                                Map.of(
                                                        "accessKeyId", "AKIAEXAMPLE",
                                                        "secretAccessKey", "shh")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAPrivateEndpointWithoutTheOperatorOptIn() {
        Map<String, Object> config =
                Map.of(
                        "bucket", "inbox",
                        "accessKeyId", "AKIAEXAMPLE",
                        "secretAccessKey", "shh",
                        "endpoint", "http://localhost:9000");

        assertThatThrownBy(() -> validator(false).validate(config))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("allowPrivateS3Endpoints");
        assertThatCode(() -> validator(true).validate(config)).doesNotThrowAnyException();
    }

    @Test
    void itOnlyClaimsTheS3Type() {
        org.junit.jupiter.api.Assertions.assertEquals(IntegrationType.S3, validator(false).type());
    }

    private static S3IntegrationValidator validator(boolean allowPrivateEndpoints) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowPrivateS3Endpoints(allowPrivateEndpoints);
        return new S3IntegrationValidator(properties);
    }
}
