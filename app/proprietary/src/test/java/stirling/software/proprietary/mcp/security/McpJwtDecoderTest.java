package stirling.software.proprietary.mcp.security;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtDecoderInitializationException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.service.UserService;

class McpJwtDecoderTest {

    @SuppressWarnings("unchecked")
    private JwtDecoder decoderFor(String issuerUri) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getMcp().getAuth().setIssuerUri(issuerUri);
        McpSecurityConfig config =
                new McpSecurityConfig(
                        properties, mock(UserService.class), mock(ObjectProvider.class));
        return config.mcpJwtDecoder();
    }

    @Test
    void anUnreachableIssuerDoesNotStopStartup() {
        // Port 1 refuses connections, so discovery would fail if it ran eagerly.
        assertThatCode(() -> decoderFor("http://127.0.0.1:1/issuer")).doesNotThrowAnyException();
    }

    @Test
    void anUnreachableIssuerRejectsTokensInstead() {
        JwtDecoder decoder = decoderFor("http://127.0.0.1:1/issuer");

        assertThatThrownBy(() -> decoder.decode("a.b.c"))
                .isInstanceOf(JwtDecoderInitializationException.class);
    }
}
