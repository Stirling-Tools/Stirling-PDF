package stirling.software.SPDF.utils.validation;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.junit.jupiter.MockitoExtension;
import stirling.software.SPDF.model.UsernameAttribute;
import stirling.software.SPDF.model.provider.GitHubProvider;
import stirling.software.SPDF.model.provider.GoogleProvider;
import stirling.software.SPDF.model.provider.KeycloakProvider;
import stirling.software.SPDF.model.provider.Provider;

import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ValidatorTest {

    @Test
    void testSuccessfulValidation() {
        var provider = mock(GitHubProvider.class);

        when(provider.getClientId()).thenReturn("clientId");
        when(provider.getClientSecret()).thenReturn("clientSecret");
        when(provider.getScopes()).thenReturn(List.of("read:user"));
        when(provider.getUseAsUsername()).thenReturn(UsernameAttribute.EMAIL);

        assertTrue(Validator.validateProvider(provider));
    }

    @ParameterizedTest
    @MethodSource("providerParams")
    void testUnsuccessfulValidation(Provider provider) {
        assertFalse(Validator.validateProvider(provider));
    }

    public static Stream<Arguments> providerParams() {
        Provider generic = null;
        var google = new GoogleProvider(null, "clientSecret", List.of("scope"), UsernameAttribute.EMAIL);
        var github = new GitHubProvider("clientId", "", List.of("scope"), UsernameAttribute.LOGIN);
        var keycloak = new KeycloakProvider("issuer", "clientId", "clientSecret", List.of("scope"), UsernameAttribute.EMAIL);

        keycloak.setUseAsUsername(null);

        return Stream.of(
                Arguments.of(generic),
                Arguments.of(google),
                Arguments.of(github),
                Arguments.of(keycloak)
        );
    }

}