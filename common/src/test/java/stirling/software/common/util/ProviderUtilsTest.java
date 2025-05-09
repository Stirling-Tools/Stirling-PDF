package stirling.software.common.util;

import static org.mockito.Mockito.*;

import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.enumeration.UsernameAttribute;
import stirling.software.common.model.oauth2.GitHubProvider;
import stirling.software.common.model.oauth2.GoogleProvider;
import stirling.software.common.model.oauth2.Provider;

@ExtendWith(MockitoExtension.class)
<<<<<<<< HEAD:common/src/test/java/stirling/software/common/util/ProviderUtilsTest.java
class ProviderUtilsTest {
========
class ProviderUtilTest {
>>>>>>>> 7d4baf22 (renaming module):common/src/test/java/stirling/software/common/util/ProviderUtilTest.java

    @Test
    void testSuccessfulValidation() {
        var provider = mock(GitHubProvider.class);

        when(provider.getClientId()).thenReturn("clientId");
        when(provider.getClientSecret()).thenReturn("clientSecret");
        when(provider.getScopes()).thenReturn(List.of("read:user"));

<<<<<<<< HEAD:common/src/test/java/stirling/software/common/util/ProviderUtilsTest.java
        Assertions.assertTrue(ProviderUtils.validateProvider(provider));
========
        assertTrue(ProviderUtil.validateProvider(provider));
>>>>>>>> 7d4baf22 (renaming module):common/src/test/java/stirling/software/common/util/ProviderUtilTest.java
    }

    @ParameterizedTest
    @MethodSource("providerParams")
    void testUnsuccessfulValidation(Provider provider) {
<<<<<<<< HEAD:common/src/test/java/stirling/software/common/util/ProviderUtilsTest.java
        Assertions.assertFalse(ProviderUtils.validateProvider(provider));
========
        assertFalse(ProviderUtil.validateProvider(provider));
>>>>>>>> 7d4baf22 (renaming module):common/src/test/java/stirling/software/common/util/ProviderUtilTest.java
    }

    public static Stream<Arguments> providerParams() {
        Provider generic = null;
        var google =
                new GoogleProvider(null, "clientSecret", List.of("scope"), UsernameAttribute.EMAIL);
        var github = new GitHubProvider("clientId", "", List.of("scope"), UsernameAttribute.LOGIN);

        return Stream.of(Arguments.of(generic), Arguments.of(google), Arguments.of(github));
    }
}
