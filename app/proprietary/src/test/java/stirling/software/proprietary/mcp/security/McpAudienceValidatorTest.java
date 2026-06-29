package stirling.software.proprietary.mcp.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/** RFC 8707 audience validator: token {@code aud} must list the resource id; blank fails closed. */
class McpAudienceValidatorTest {

    private static final String RESOURCE = "http://localhost:8080/mcp";

    private final McpAudienceValidator validator = new McpAudienceValidator(RESOURCE);

    @Test
    void matchingAudience_isAccepted() {
        Jwt token = tokenWithAudience(List.of(RESOURCE));
        OAuth2TokenValidatorResult result = validator.validate(token);
        assertThat(result.hasErrors()).isFalse();
    }

    @Test
    void multiAudienceIncludingResource_isAccepted() {
        Jwt token = tokenWithAudience(List.of("https://other.example.com", RESOURCE));
        OAuth2TokenValidatorResult result = validator.validate(token);
        assertThat(result.hasErrors()).isFalse();
    }

    @Test
    void wrongAudience_isRejected() {
        Jwt token = tokenWithAudience(List.of("https://other.example.com"));
        OAuth2TokenValidatorResult result = validator.validate(token);
        assertThat(result.hasErrors()).isTrue();
        assertThat(result.getErrors()).anyMatch(e -> e.getErrorCode().equals("invalid_token"));
    }

    @Test
    void missingAudienceClaim_isRejected() {
        Jwt token = tokenWithAudience(null);
        OAuth2TokenValidatorResult result = validator.validate(token);
        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    void blankResourceId_failsClosed_rejectingEvenMatchingTokens() {
        McpAudienceValidator blank = new McpAudienceValidator("");
        OAuth2TokenValidatorResult result = blank.validate(tokenWithAudience(List.of(RESOURCE)));
        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    void acceptedAudience_isAccepted_alongsideResourceId() {
        // Supabase-style IdP: every token carries aud=authenticated, never the resource id.
        McpAudienceValidator relaxed = new McpAudienceValidator(RESOURCE, List.of("authenticated"));
        assertThat(relaxed.validate(tokenWithAudience(List.of("authenticated"))).hasErrors())
                .isFalse();
        assertThat(relaxed.validate(tokenWithAudience(List.of(RESOURCE))).hasErrors()).isFalse();
        assertThat(relaxed.validate(tokenWithAudience(List.of("something-else"))).hasErrors())
                .isTrue();
    }

    @Test
    void blankAcceptedAudienceEntries_areIgnored() {
        McpAudienceValidator relaxed = new McpAudienceValidator(RESOURCE, List.of("", "  "));
        assertThat(relaxed.validate(tokenWithAudience(List.of(""))).hasErrors()).isTrue();
        assertThat(relaxed.validate(tokenWithAudience(List.of(RESOURCE))).hasErrors()).isFalse();
    }

    @Test
    void blankResourceIdWithOnlyBlankAccepted_failsClosed() {
        McpAudienceValidator blank = new McpAudienceValidator("", List.of(" "));
        assertThat(blank.validate(tokenWithAudience(List.of(RESOURCE))).hasErrors()).isTrue();
    }

    private static Jwt tokenWithAudience(List<String> audience) {
        return new Jwt(
                "header.payload.signature",
                Instant.now(),
                Instant.now().plusSeconds(60),
                Map.of("alg", "RS256"),
                audience == null ? Map.of("sub", "u1") : Map.of("sub", "u1", "aud", audience));
    }
}
