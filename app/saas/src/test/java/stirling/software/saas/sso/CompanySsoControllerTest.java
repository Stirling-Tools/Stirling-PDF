package stirling.software.saas.sso;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

class CompanySsoControllerTest {
    @Test
    void incompleteOrWrongAudienceTokensNeverReachTheCeremony() {
        var service = mock(CompanySsoService.class);
        var decoder = mock(JwtDecoder.class);
        var controller = new CompanySsoController(service, decoder);
        for (var token :
                List.of(
                        Jwt.withTokenValue("test")
                                .header("alg", "RS256")
                                .claim("role", "authenticated")
                                .build(),
                        Jwt.withTokenValue("test")
                                .header("alg", "RS256")
                                .audience(List.of("other"))
                                .subject(UUID.randomUUID().toString())
                                .claim("role", "authenticated")
                                .build(),
                        Jwt.withTokenValue("test")
                                .header("alg", "RS256")
                                .audience(List.of("authenticated"))
                                .subject(UUID.randomUUID().toString())
                                .claim("role", "authenticated")
                                .build())) {
            when(decoder.decode("test")).thenReturn(token);
            assertThatThrownBy(() -> controller.settings("Bearer test"))
                    .isInstanceOf(CompanySsoException.class);
        }
        verifyNoInteractions(service);
    }
}
