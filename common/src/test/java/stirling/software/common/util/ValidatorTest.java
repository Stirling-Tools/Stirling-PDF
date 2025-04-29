package stirling.software.common.util;

import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import stirling.software.common.model.enumeration.UsernameAttribute;
import stirling.software.common.model.provider.GitHubProvider;
import stirling.software.common.model.provider.GoogleProvider;
import stirling.software.common.model.provider.Provider;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ValidatorTest {

    @Test
    void testSuccessfulValidation() {
        var provider = mock(GitHubProvider.class);

        when(provider.getClientId()).thenReturn("clientId");
        when(provider.getClientSecret()).thenReturn("clientSecret");
        when(provider.getScopes()).thenReturn(List.of("read:user"));

        assertTrue(Validator.validateProvider(provider));
    }

    @ParameterizedTest
    @MethodSource("providerParams")
    void testUnsuccessfulValidation(Provider provider) {
        assertFalse(Validator.validateProvider(provider));
    }

    public static Stream<Arguments> providerParams() {
        Provider generic = null;
        var google =
                new GoogleProvider(null, "clientSecret", List.of("scope"), UsernameAttribute.EMAIL);
        var github = new GitHubProvider("clientId", "", List.of("scope"), UsernameAttribute.LOGIN);

        return Stream.of(Arguments.of(generic), Arguments.of(google), Arguments.of(github));
    }
}
