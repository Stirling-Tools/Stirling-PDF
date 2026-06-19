package stirling.software.proprietary.mcp.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.mcp.security.McpAudienceValidator.Result;

/**
 * RFC 8707 audience validator: token {@code aud} must list the resource id; blank fails closed.
 *
 * <p>MIGRATION (Spring Security -> Quarkus): {@code McpAudienceValidator} no longer depends on
 * Spring Security's {@code OAuth2TokenValidator<Jwt>}. It now takes the raw {@code aud} claim as a
 * {@code List<String>} and returns a plain {@code Result} record (replacing {@code
 * OAuth2TokenValidatorResult}). Tests call the audience-check logic directly; the assertions are
 * preserved against the new {@code Result} API.
 */
class McpAudienceValidatorTest {

    private static final String RESOURCE = "http://localhost:8080/mcp";

    private final McpAudienceValidator validator = new McpAudienceValidator(RESOURCE);

    @Test
    void matchingAudience_isAccepted() {
        Result result = validator.validate(List.of(RESOURCE));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void multiAudienceIncludingResource_isAccepted() {
        Result result = validator.validate(List.of("https://other.example.com", RESOURCE));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void wrongAudience_isRejected() {
        Result result = validator.validate(List.of("https://other.example.com"));
        assertThat(result.valid()).isFalse();
        assertThat(result.errorCode()).isEqualTo("invalid_token");
    }

    @Test
    void missingAudienceClaim_isRejected() {
        Result result = validator.validate(null);
        assertThat(result.valid()).isFalse();
    }

    @Test
    void blankResourceId_failsClosed_rejectingEvenMatchingTokens() {
        McpAudienceValidator blank = new McpAudienceValidator("");
        Result result = blank.validate(List.of(RESOURCE));
        assertThat(result.valid()).isFalse();
    }
}
